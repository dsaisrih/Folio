import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, setPersistence, inMemoryPersistence,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, addDoc, doc, deleteDoc, updateDoc,
  onSnapshot, query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

(() => {
  'use strict';

  /* ---------- Firebase setup ---------- */
  const CONFIG_MISSING = firebaseConfig.apiKey === 'YOUR_API_KEY';
  let auth, db;
  if (!CONFIG_MISSING) {
    const fbApp = initializeApp(firebaseConfig);
    auth = getAuth(fbApp);
    db = getFirestore(fbApp);
    // Never persist the session — a page refresh must always ask for the
    // password again, otherwise the safety system below can be skipped.
    setPersistence(auth, inMemoryPersistence).catch((err) => {
      console.warn('Could not set Firebase persistence:', err);
    });
  }

  /* ---------- local (device-only) keys — used only for the decoy & attempt counter ---------- */
  const K_ATTEMPTS = 'folio_wrong_attempts';
  const K_DECOY_SEEDED = 'folio_decoy_seeded';
  const localKey = (kind) => `folio_decoy_${kind}`; // folio_decoy_todos, folio_decoy_ideas

  const WRONG_LIMIT = 2; // wrong attempts before the decoy quietly opens instead

  /* ---------- tiny helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const readJSON = (key, fallback) => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  };
  const writeJSON = (key, val) => localStorage.setItem(key, JSON.stringify(val));

  function friendlyError(err) {
    const map = {
      'auth/email-already-in-use': 'An account already exists for that email.',
      'auth/weak-password': 'Password should be at least 6 characters.',
      'auth/invalid-email': 'That email address doesn\u2019t look right.',
      'auth/too-many-requests': 'Too many attempts — please wait a moment and try again.',
      'auth/network-request-failed': 'Network error — check your connection and try again.',
    };
    return map[err.code] || (err.message || 'Something went wrong.').replace(/^Firebase:\s*/, '').replace(/\s*\(auth\/[\w-]+\)\.?$/, '.');
  }

  /* ---------- state ---------- */
  let currentMode = null;   // 'real' | 'decoy' — never persisted, never shown in the UI
  let currentUid = null;
  let unsubTodos = null;
  let unsubIdeas = null;
  let todosArr = [];
  let ideasArr = [];
  let gateMode = 'login';   // 'login' | 'signup'

  /* ---------- gate elements ---------- */
  const gateForm = $('gate-form');
  const emailInput = $('email');
  const passInput = $('password');
  const confirmField = $('confirm-field');
  const confirmInput = $('confirm');
  const gateError = $('gate-error');
  const gateCard = document.querySelector('.gate-card');
  const gateSubmit = $('gate-submit');
  const tagline = $('tagline');
  const footnote = $('gate-footnote');
  const seal = $('seal');
  const switchText = $('gate-switch-text');
  const modeToggle = $('mode-toggle');

  function renderGateMode() {
    if (gateMode === 'signup') {
      confirmField.hidden = false;
      confirmInput.required = true;
      tagline.textContent = 'Set up your private space.';
      gateSubmit.textContent = 'Create my vault';
      footnote.textContent = 'Choose a password you\u2019ll remember — this protects everything you write here.';
      switchText.textContent = 'Already have an account?';
      modeToggle.textContent = 'Log in';
    } else {
      confirmField.hidden = true;
      confirmInput.required = false;
      tagline.textContent = 'Tasks and ideas, kept safely.';
      gateSubmit.textContent = 'Enter Folio';
      footnote.textContent = '';
      switchText.textContent = 'New here?';
      modeToggle.textContent = 'Create an account';
    }
  }

  modeToggle.addEventListener('click', () => {
    gateMode = gateMode === 'login' ? 'signup' : 'login';
    clearGateError();
    renderGateMode();
  });

  function showGateError(msg) {
    gateError.textContent = msg;
    gateError.hidden = false;
    gateCard.classList.remove('shake');
    void gateCard.offsetWidth;
    gateCard.classList.add('shake');
  }
  function clearGateError() {
    gateError.hidden = true;
    gateError.textContent = '';
  }

  if (CONFIG_MISSING) {
    tagline.textContent = 'Firebase isn\u2019t connected yet.';
    footnote.textContent = 'Add your project keys to firebase-config.js, then reload this page.';
    gateSubmit.disabled = true;
  }

  gateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (CONFIG_MISSING) return;
    clearGateError();
    const email = emailInput.value.trim();
    const password = passInput.value;

    if (gateMode === 'signup') {
      const confirm = confirmInput.value;
      if (password.length < 6) { showGateError('Password should be at least 6 characters.'); return; }
      if (password !== confirm) { showGateError('Passwords don\u2019t match.'); return; }
      gateSubmit.disabled = true;
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        writeJSON(K_ATTEMPTS, 0);
        enterDashboard('real', cred.user.uid);
      } catch (err) {
        gateSubmit.disabled = false;
        showGateError(friendlyError(err));
      }
      return;
    }

    // ---- login ----
    gateSubmit.disabled = true;
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      writeJSON(K_ATTEMPTS, 0);
      enterDashboard('real', cred.user.uid);
    } catch (err) {
      gateSubmit.disabled = false;
      const credentialErrors = [
        'auth/wrong-password', 'auth/user-not-found',
        'auth/invalid-credential', 'auth/invalid-login-credentials'
      ];
      if (!credentialErrors.includes(err.code)) {
        showGateError(friendlyError(err));
        return;
      }

      const attempts = readJSON(K_ATTEMPTS, 0) + 1;
      writeJSON(K_ATTEMPTS, attempts);

      if (attempts < WRONG_LIMIT) {
        showGateError('Incorrect email or password.');
        return;
      }

      // Wrong-password limit reached: open the decoy quietly — no error,
      // no hint that anything different just happened. This is what keeps
      // the real, synced data hidden. The decoy never touches Firebase.
      writeJSON(K_ATTEMPTS, 0);
      enterDashboard('decoy', null);
    }
  });

  /* ---------- transition ---------- */
  function enterDashboard(mode, uidValue) {
    currentMode = mode;
    currentUid = uidValue;
    seal.classList.add('crack');
    setTimeout(() => {
      $('gate').hidden = true;
      $('dashboard').hidden = false;
      passInput.value = '';
      confirmInput.value = '';
      gateSubmit.disabled = false;

      if (mode === 'real') {
        attachRealListeners(currentUid);
      } else {
        seedDecoyIfEmpty();
        todosArr = readJSON(localKey('todos'), []);
        ideasArr = readJSON(localKey('ideas'), []);
        renderTodos();
        renderIdeas();
      }
      setTab('todo');
    }, 320);
  }

  $('logout-btn').addEventListener('click', async () => {
    if (currentMode === 'real') {
      if (unsubTodos) unsubTodos();
      if (unsubIdeas) unsubIdeas();
      unsubTodos = unsubIdeas = null;
      try { await signOut(auth); } catch {}
    }
    currentMode = null;
    currentUid = null;
    todosArr = [];
    ideasArr = [];
    $('dashboard').hidden = true;
    $('gate').hidden = false;
    seal.classList.remove('crack');
    passInput.value = '';
    gateMode = 'login';
    renderGateMode();
    passInput.focus();
  });

  /* ---------- tabs ---------- */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });
  function setTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $('panel-todo').classList.toggle('active', tab === 'todo');
    $('panel-ideas').classList.toggle('active', tab === 'ideas');
  }

  /* ================= REAL DATA (Firestore, synced) ================= */
  function attachRealListeners(uidValue) {
    const todosQ = query(collection(db, 'users', uidValue, 'todos'), orderBy('createdAt', 'desc'));
    unsubTodos = onSnapshot(todosQ, (snap) => {
      todosArr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderTodos();
    }, () => showGateError('Sync error — check your connection.'));

    const ideasQ = query(collection(db, 'users', uidValue, 'ideas'), orderBy('createdAt', 'desc'));
    unsubIdeas = onSnapshot(ideasQ, (snap) => {
      ideasArr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderIdeas();
    }, () => {});
  }

  /* ================= DECOY DATA (local only, offline) ================= */
  function seedDecoyIfEmpty() {
    if (readJSON(K_DECOY_SEEDED, false)) return;
    writeJSON(localKey('todos'), [
      { id: uid(), text: 'Pay electricity bill', date: '', done: false },
      { id: uid(), text: 'Book dentist appointment', date: '', done: false },
      { id: uid(), text: 'Pick up dry cleaning', date: '', done: true },
    ]);
    writeJSON(localKey('ideas'), [
      { id: uid(), title: 'Weekend trip', body: 'Look into a short hiking trip next month.', ts: Date.now() },
    ]);
    writeJSON(K_DECOY_SEEDED, true);
  }

  /* ================= TO-DO (mode-aware) ================= */
  const todoForm = $('todo-form');
  const todoInput = $('todo-input');
  const todoDate = $('todo-date');
  const pendingList = $('todo-pending');
  const doneList = $('todo-done');
  const doneWrap = $('done-wrap');
  const doneToggle = $('done-toggle');

  function renderTodos() {
    const pending = todosArr.filter(t => !t.done);
    const done = todosArr.filter(t => t.done);

    pendingList.innerHTML = '';
    pending.forEach(t => pendingList.appendChild(todoRow(t)));

    doneList.innerHTML = '';
    done.forEach(t => doneList.appendChild(todoRow(t)));

    doneWrap.hidden = done.length === 0;
    $('done-count').textContent = `(${done.length})`;

    $('todo-empty').hidden = todosArr.length !== 0;
    $('todo-count').textContent = todosArr.length
      ? `${pending.length} open · ${done.length} done`
      : '';
  }

  function todoRow(t) {
    const row = document.createElement('div');
    row.className = 'todo-item' + (t.done ? ' done' : '');

    const check = document.createElement('button');
    check.className = 'todo-check' + (t.done ? ' checked' : '');
    check.setAttribute('aria-label', t.done ? 'Mark as not done' : 'Mark as done');
    check.textContent = t.done ? '✓' : '';
    check.addEventListener('click', () => toggleTodo(t));

    const text = document.createElement('span');
    text.className = 'todo-text';
    text.textContent = t.text;

    row.appendChild(check);
    row.appendChild(text);

    if (t.date) {
      const date = document.createElement('span');
      date.className = 'todo-date';
      date.textContent = t.date;
      row.appendChild(date);
    }

    const del = document.createElement('button');
    del.className = 'icon-btn';
    del.setAttribute('aria-label', 'Delete task');
    del.textContent = '✕';
    del.addEventListener('click', () => deleteTodo(t));
    row.appendChild(del);

    return row;
  }

  function addTodo(text, date) {
    if (currentMode === 'real') {
      addDoc(collection(db, 'users', currentUid, 'todos'), {
        text, date: date || '', done: false, createdAt: serverTimestamp()
      }).catch((err) => {
        console.error('Firestore addTodo failed:', err);
        showGateError('Could not save — check your connection.');
      });
    } else {
      todosArr.unshift({ id: uid(), text, date: date || '', done: false });
      writeJSON(localKey('todos'), todosArr);
      renderTodos();
    }
  }

  function toggleTodo(t) {
    if (currentMode === 'real') {
      updateDoc(doc(db, 'users', currentUid, 'todos', t.id), { done: !t.done }).catch((err) => {
        console.error('Firestore toggleTodo failed:', err);
      });
    } else {
      t.done = !t.done;
      writeJSON(localKey('todos'), todosArr);
      renderTodos();
    }
  }

  function deleteTodo(t) {
    if (currentMode === 'real') {
      deleteDoc(doc(db, 'users', currentUid, 'todos', t.id)).catch((err) => {
        console.error('Firestore deleteTodo failed:', err);
      });
    } else {
      todosArr = todosArr.filter(x => x.id !== t.id);
      writeJSON(localKey('todos'), todosArr);
      renderTodos();
    }
  }

  todoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = todoInput.value.trim();
    if (!text) return;
    addTodo(text, todoDate.value);
    todoInput.value = '';
    todoDate.value = '';
    todoInput.focus();
  });

  doneToggle.addEventListener('click', () => doneWrap.classList.toggle('open'));

  /* ================= IDEAS (mode-aware) ================= */
  const ideaForm = $('idea-form');
  const ideaTitle = $('idea-title');
  const ideaBody = $('idea-body');
  const ideaGrid = $('idea-grid');

  function renderIdeas() {
    const sorted = todosSortIdeas(ideasArr);
    ideaGrid.innerHTML = '';
    sorted.forEach(idea => ideaGrid.appendChild(ideaCard(idea)));
    $('ideas-empty').hidden = sorted.length !== 0;
    $('ideas-count').textContent = sorted.length ? `${sorted.length} saved` : '';
  }

  function todosSortIdeas(arr) {
    // Firestore already orders by createdAt desc; local decoy data needs manual sorting.
    if (currentMode === 'real') return arr;
    return arr.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }

  function ideaTimestamp(idea) {
    if (currentMode === 'real') {
      return idea.createdAt && idea.createdAt.toDate ? idea.createdAt.toDate() : new Date();
    }
    return new Date(idea.ts || Date.now());
  }

  function ideaCard(idea) {
    const card = document.createElement('div');
    card.className = 'idea-card';

    const del = document.createElement('button');
    del.className = 'icon-btn';
    del.setAttribute('aria-label', 'Delete idea');
    del.textContent = '✕';
    del.addEventListener('click', () => deleteIdea(idea));

    const h3 = document.createElement('h3');
    h3.textContent = idea.title;

    const p = document.createElement('p');
    p.textContent = idea.body || '';

    const time = document.createElement('time');
    time.textContent = ideaTimestamp(idea).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    card.appendChild(del);
    card.appendChild(h3);
    if (idea.body) card.appendChild(p);
    card.appendChild(time);
    return card;
  }

  function addIdea(title, body) {
    if (currentMode === 'real') {
      addDoc(collection(db, 'users', currentUid, 'ideas'), {
        title, body: body || '', createdAt: serverTimestamp()
      }).catch((err) => {
        console.error('Firestore addIdea failed:', err);
        showGateError('Could not save — check your connection.');
      });
    } else {
      ideasArr.unshift({ id: uid(), title, body: body || '', ts: Date.now() });
      writeJSON(localKey('ideas'), ideasArr);
      renderIdeas();
    }
  }

  function deleteIdea(idea) {
    if (currentMode === 'real') {
      deleteDoc(doc(db, 'users', currentUid, 'ideas', idea.id)).catch((err) => {
        console.error('Firestore deleteIdea failed:', err);
      });
    } else {
      ideasArr = ideasArr.filter(x => x.id !== idea.id);
      writeJSON(localKey('ideas'), ideasArr);
      renderIdeas();
    }
  }

  ideaForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = ideaTitle.value.trim();
    if (!title) return;
    addIdea(title, ideaBody.value.trim());
    ideaTitle.value = '';
    ideaBody.value = '';
    ideaTitle.focus();
  });

  /* ---------- installable app hints ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    });
  }

  /* ---------- init ---------- */
  renderGateMode();
  emailInput.focus();
})();
