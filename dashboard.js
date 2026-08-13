import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, addDoc, doc, deleteDoc, updateDoc,
  onSnapshot, query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

(() => {
  'use strict';
  const REQUIRED_KEYS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'appId'];
  const CONFIG_MISSING = REQUIRED_KEYS.some(k => !firebaseConfig[k] || firebaseConfig[k].includes('YOUR_'));
  let auth, db;
  try {
    const fb = initializeApp(firebaseConfig);
    auth = getAuth(fb);
    db = getFirestore(fb);
  } catch (e) {
    console.error('Firebase init failed', e);
  }

  const $ = (id) => document.getElementById(id);

  // redirect to login if not authenticated
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.replace('login.html');
      return;
    }
    // user is signed in — initialize dashboard
    attachRealListeners(user.uid);
  });

  // logout button
  const logoutBtn = $('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', async () => { try { await signOut(auth); } catch {} window.location.replace('login.html'); });

  // tab switching (show panels)
  document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
  function setTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
  }

  // --- todo UI ----
  const todoForm = $('todo-form');
  const todoInput = $('todo-input');
  const todoDate = $('todo-date');
  const pendingList = $('todo-pending');
  const doneList = $('todo-done');
  const doneWrap = $('done-wrap');
  const doneToggle = $('done-toggle');

  let todosArr = [];

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
    $('todo-count').textContent = todosArr.length ? `${pending.length} open · ${done.length} done` : '';
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

  async function addTodo(text, date) {
    if (!db) return;
    try {
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'todos'), {
        text, date: date || '', done: false, createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error('addTodo failed', err);
    }
  }

  async function toggleTodo(t) {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid, 'todos', t.id), { done: !t.done });
    } catch (err) { console.error('toggle failed', err); }
  }

  async function deleteTodo(t) {
    if (!db) return;
    try { await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'todos', t.id)); } catch (err) { console.error('delete failed', err); }
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

  // --- ideas UI ----
  const ideaForm = $('idea-form');
  const ideaTitle = $('idea-title');
  const ideaBody = $('idea-body');
  const ideaGrid = $('idea-grid');

  let ideasArr = [];

  function renderIdeas() {
    try {
      const list = Array.isArray(ideasArr) ? ideasArr.slice() : [];
      const sorted = list.sort((a, b) => (b.createdAt ? (b.createdAt.seconds || 0) : 0) - (a.createdAt ? (a.createdAt.seconds || 0) : 0));
      if (!ideaGrid) return;
      ideaGrid.innerHTML = '';
      sorted.forEach(idea => ideaGrid.appendChild(ideaCard(idea)));
      $('ideas-empty').hidden = sorted.length !== 0;
      $('ideas-count').textContent = sorted.length ? `${sorted.length} saved` : '';
    } catch (err) {
      console.error('renderIdeas error', err);
    }
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
    time.textContent = idea.createdAt && idea.createdAt.toDate ? idea.createdAt.toDate().toLocaleDateString() : '';

    card.appendChild(del);
    card.appendChild(h3);
    if (idea.body) card.appendChild(p);
    card.appendChild(time);
    return card;
  }

  async function addIdea(title, body) {
    if (!db) return;
    try {
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'ideas'), {
        title, body: body || '', createdAt: serverTimestamp()
      });
    } catch (err) { console.error('addIdea failed', err); }
  }

  async function deleteIdea(idea) {
    if (!db) return;
    try { await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'ideas', idea.id)); } catch (err) { console.error('deleteIdea failed', err); }
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

  // --- purchases UI ----
  const purchaseForm = $('purchase-form');
  const purchaseDate = $('purchase-date');
  const purchaseVendor = $('purchase-vendor');
  const purchaseDesc = $('purchase-desc');
  const purchaseAmount = $('purchase-amount');
  const purchaseCategory = $('purchase-category');
  const purchaseList = $('purchase-list');
  const expendituresMonth = $('expenditures-month');
  const expendituresClear = $('expenditures-clear');
  const expendituresTotal = $('expenditures-total');

  let purchasesArr = [];

  function renderPurchases() {
    try {
      if (!purchaseList) return;
      // apply month filter if set (value is yyyy-mm)
      const month = expendituresMonth && expendituresMonth.value ? expendituresMonth.value : null;
      const list = (purchasesArr || []).filter(p => {
        if (!month) return true;
        if (!p.date) return false;
        return p.date.indexOf(month) === 0 || p.date.startsWith(month);
      });
      purchaseList.innerHTML = '';
      list.forEach(p => purchaseList.appendChild(purchaseRow(p)));
      $('purchases-empty').hidden = list.length !== 0;
      $('purchases-count').textContent = list.length ? `${list.length} recorded` : '';
      // compute total
      const total = list.reduce((s, it) => s + (Number(it.amount) || 0), 0);
      if (expendituresTotal) expendituresTotal.textContent = `Total: ${formatINR(total)}`;
    } catch (err) { console.error('renderPurchases error', err); }
  }

  function purchaseRow(p) {
    const row = document.createElement('div');
    row.className = 'purchase-item';
    const left = document.createElement('div'); left.className = 'purchase-left';
    const right = document.createElement('div'); right.className = 'purchase-right';
    const vendor = document.createElement('strong'); vendor.textContent = p.vendor || '';
    const meta = document.createElement('div'); meta.className = 'muted'; meta.textContent = `${p.date || ''} · ${p.category || ''}`;
    left.appendChild(vendor); left.appendChild(meta);
    right.textContent = formatINR(Number(p.amount) || 0);
    const del = document.createElement('button'); del.className = 'icon-btn del'; del.textContent = '✕';
    del.addEventListener('click', () => deletePurchase(p));
    right.appendChild(del);
    row.appendChild(left); row.appendChild(right);
    return row;
  }

  function formatINR(amount) {
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
    } catch (e) {
      return '₹' + amount.toFixed(2);
    }
  }

  async function addPurchase(date, vendor, desc, amount, category) {
    if (!db) return;
    try {
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'purchases'), {
        date: date || '', vendor, desc: desc || '', amount: Number(amount) || 0, category: category || 'general', createdAt: serverTimestamp()
      });
    } catch (err) { console.error('addPurchase failed', err); }
  }

  async function deletePurchase(p) {
    if (!db) return;
    try { await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'purchases', p.id)); } catch (err) { console.error('deletePurchase failed', err); }
  }

  if (purchaseForm) purchaseForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const date = purchaseDate.value;
    const vendor = (purchaseVendor.value || '').trim();
    const desc = (purchaseDesc.value || '').trim();
    const amount = purchaseAmount.value;
    const category = purchaseCategory.value;
    if (!vendor || !amount) return;
    addPurchase(date, vendor, desc, amount, category);
    purchaseDate.value = '';
    purchaseVendor.value = '';
    purchaseDesc.value = '';
    purchaseAmount.value = '';
    purchaseCategory.value = 'general';
  });

  // --- daily UI ----
  const dailyForm = $('daily-form');
  const dailyDate = $('daily-date');
  const dailyTitle = $('daily-title');
  const dailyEntry = $('daily-entry');
  const dailyList = $('daily-list');

  let dailyArr = [];

  function renderDaily() {
    try {
      if (!dailyList) return;
      const list = (dailyArr || []).slice().sort((a,b) => (b.createdAt ? (b.createdAt.seconds||0) : 0) - (a.createdAt ? (a.createdAt.seconds||0) : 0));
      dailyList.innerHTML = '';
      list.forEach(d => dailyList.appendChild(dailyRow(d)));
      $('daily-empty').hidden = list.length !== 0;
      $('daily-count').textContent = list.length ? `${list.length} entries` : '';
    } catch (err) { console.error('renderDaily error', err); }
  }

  function dailyRow(d) {
    const row = document.createElement('div'); row.className = 'daily-item';
    const left = document.createElement('div'); left.className = 'daily-left';
    const right = document.createElement('div'); right.className = 'daily-right';
    const h = document.createElement('strong'); h.textContent = d.title || '';
    const meta = document.createElement('div'); meta.className = 'muted'; meta.textContent = d.date || '';
    const p = document.createElement('div'); p.textContent = d.entry || '';
    const del = document.createElement('button'); del.className = 'icon-btn'; del.textContent = '✕'; del.addEventListener('click', () => deleteDaily(d));
    left.appendChild(h); left.appendChild(meta); left.appendChild(p);
    right.appendChild(del);
    row.appendChild(left); row.appendChild(right);
    return row;
  }

  async function addDaily(date, title, entry) {
    if (!db) return;
    try { await addDoc(collection(db, 'users', auth.currentUser.uid, 'daily'), { date: date||'', title: title||'', entry: entry||'', createdAt: serverTimestamp() }); }
    catch (err) { console.error('addDaily failed', err); }
  }

  async function deleteDaily(d) { if (!db) return; try { await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'daily', d.id)); } catch (err) { console.error('deleteDaily failed', err); } }

  if (dailyForm) dailyForm.addEventListener('submit', (e) => { e.preventDefault(); const date = dailyDate.value; const title = (dailyTitle.value||'').trim(); const entry = (dailyEntry.value||'').trim(); if (!date) return; addDaily(date, title, entry); dailyDate.value=''; dailyTitle.value=''; dailyEntry.value=''; });

  function exportDailyCSV() {
    const rows = [['Date','Title','Entry']].concat((dailyArr||[]).map(d => [d.date||'', d.title||'', d.entry||'']));
    const csv = rows.map(r => r.map(cell => '"'+String(cell).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`daily-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  function exportDailyPDF() {
    const container = document.createElement('div'); container.style.padding='20px'; const h=document.createElement('h2'); h.textContent='Daily Log'; container.appendChild(h);
    (dailyArr||[]).forEach(d => { const el=document.createElement('div'); el.style.marginBottom='12px'; const t=document.createElement('div'); t.textContent=`${d.date} — ${d.title||''}`; const b=document.createElement('div'); b.textContent=d.entry||''; el.appendChild(t); el.appendChild(b); container.appendChild(el); });
    if (window.html2pdf) html2pdf().from(container).save(`daily-${new Date().toISOString().slice(0,10)}.pdf`);
    else { const w=window.open('','_blank'); if (!w) { alert('Popup blocked'); return;} w.document.write('<html><head><title>Daily</title></head><body>'); w.document.body.appendChild(container); w.document.write('</body></html>'); w.document.close(); w.focus(); w.print(); }
  }

  const exportDailyCsvBtn = $('export-daily-csv'); if (exportDailyCsvBtn) exportDailyCsvBtn.addEventListener('click', exportDailyCSV);
  const exportDailyPdfBtn = $('export-daily-pdf'); if (exportDailyPdfBtn) exportDailyPdfBtn.addEventListener('click', exportDailyPDF);

  // CSV export
  function exportPurchasesCSV() {
    const rows = [['Date','Vendor','Description','Category','Amount (INR)']].concat((purchasesArr||[]).map(p => [p.date||'', p.vendor||'', p.desc||'', p.category||'', p.amount||0]));
    const csv = rows.map(r => r.map(cell => '"'+String(cell).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `expenditures-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  // PDF export (uses html2pdf if present, otherwise opens print)
  function exportPurchasesPDF() {
    const container = document.createElement('div');
    container.style.padding = '20px';
    const h = document.createElement('h2'); h.textContent = 'Purchases'; container.appendChild(h);
    const tbl = document.createElement('table'); tbl.style.width = '100%'; tbl.style.borderCollapse = 'collapse';
    const header = document.createElement('tr'); ['Date','Vendor','Description','Category','Amount'].forEach(t => { const th = document.createElement('th'); th.textContent = t; th.style.borderBottom='1px solid #ccc'; th.style.textAlign='left'; th.style.padding='6px'; header.appendChild(th); });
    tbl.appendChild(header);
    (purchasesArr||[]).forEach(p => {
      const tr = document.createElement('tr'); [p.date||'', p.vendor||'', p.desc||'', p.category||'', (Number(p.amount)||0).toFixed(2)].forEach(cell => { const td = document.createElement('td'); td.textContent = cell; td.style.padding='6px'; tr.appendChild(td); });
      tbl.appendChild(tr);
    });
    container.appendChild(tbl);
    if (window.html2pdf) {
      html2pdf().from(container).save(`expenditures-${new Date().toISOString().slice(0,10)}.pdf`);
    } else {
      const w = window.open('', '_blank'); if (!w) { alert('Popup blocked — allow popups to export PDF.'); return; }
        w.document.write('<html><head><title>Expenditures</title></head><body>');
      w.document.body.appendChild(container);
      w.document.write('</body></html>');
      w.document.close(); w.focus(); w.print();
    }
  }

  const exportCsvBtn = $('export-csv');
  const exportPdfBtn = $('export-pdf');
  if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportPurchasesCSV);
  if (exportPdfBtn) exportPdfBtn.addEventListener('click', exportPurchasesPDF);
  const exportXlsxBtn = $('export-xlsx');
  function exportPurchasesXLSX() {
    if (!window.XLSX) { alert('Excel export library missing.'); return; }
    const rows = [['Date','Vendor','Description','Category','Amount']].concat((purchasesArr||[]).map(p => [p.date||'', p.vendor||'', p.desc||'', p.category||'', p.amount||0]));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Expenditures');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `expenditures-${new Date().toISOString().slice(0,10)}.xlsx`; a.click(); URL.revokeObjectURL(url);
  }
  if (exportXlsxBtn) exportXlsxBtn.addEventListener('click', exportPurchasesXLSX);

  if (expendituresMonth) expendituresMonth.addEventListener('change', renderPurchases);
  if (expendituresClear) expendituresClear.addEventListener('click', (e) => { e.preventDefault(); if (expendituresMonth) { expendituresMonth.value = ''; renderPurchases(); } });

  // --- Firestore realtime listeners ---
  let unsubTodos = null, unsubIdeas = null, unsubPurchases = null, unsubDaily = null;
  function attachRealListeners(uid) {
    if (!db) return;
    if (unsubTodos) unsubTodos();
    if (unsubIdeas) unsubIdeas();
    if (unsubPurchases) unsubPurchases();
    if (unsubDaily) unsubDaily();

    const todosQ = query(collection(db, 'users', uid, 'todos'), orderBy('createdAt', 'desc'));
    unsubTodos = onSnapshot(todosQ, (snap) => {
      todosArr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderTodos();
    }, (err) => console.error('todos snapshot failed', err));

    const ideasQ = query(collection(db, 'users', uid, 'ideas'), orderBy('createdAt', 'desc'));
    unsubIdeas = onSnapshot(ideasQ, (snap) => {
      ideasArr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderIdeas();
    }, (err) => console.error('ideas snapshot failed', err));

    const purchasesQ = query(collection(db, 'users', uid, 'purchases'), orderBy('createdAt', 'desc'));
    unsubPurchases = onSnapshot(purchasesQ, (snap) => {
      purchasesArr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderPurchases();
    }, (err) => console.error('purchases snapshot failed', err));

    const dailyQ = query(collection(db, 'users', uid, 'daily'), orderBy('createdAt', 'desc'));
    unsubDaily = onSnapshot(dailyQ, (snap) => {
      dailyArr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderDaily();
    }, (err) => console.error('daily snapshot failed', err));
  }

})();
