import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, setPersistence, browserSessionPersistence, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

(() => {
  'use strict';
  const REQUIRED_KEYS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'appId'];
  const CONFIG_MISSING = REQUIRED_KEYS.some(k => !firebaseConfig[k] || firebaseConfig[k].includes('YOUR_'));
  let auth;
  if (!CONFIG_MISSING) {
    try {
      initializeApp(firebaseConfig);
      auth = getAuth();
      setPersistence(auth, browserSessionPersistence).catch(() => {});
    } catch (e) {
      console.error('Firebase init failed', e);
    }
  }

  const $ = (id) => document.getElementById(id);
  const gateForm = $('gate-form');
  const emailInput = $('email');
  const passInput = $('password');
  const gateError = $('gate-error');
  const gateSubmit = $('gate-submit');
  const tagline = $('tagline');
  const footnote = $('gate-footnote');
  const switchText = $('gate-switch-text');
  const modeToggle = $('mode-toggle');

  let gateMode = 'login';

  function renderGateMode() {
    if (gateMode === 'signup') {
      tagline.textContent = 'Set up your private space.';
      gateSubmit.textContent = 'Create my vault';
      footnote.textContent = 'Choose a password you\u2019ll remember — this protects everything you write here.';
      switchText.textContent = 'Already have an account?';
      modeToggle.textContent = 'Log in';
    } else {
      tagline.textContent = 'Tasks and ideas, kept safely.';
      gateSubmit.textContent = 'Enter Folio';
      footnote.textContent = '';
      switchText.textContent = 'New here?';
      modeToggle.textContent = 'Create an account';
    }
  }

  modeToggle.addEventListener('click', () => {
    gateMode = gateMode === 'login' ? 'signup' : 'login';
    gateError.hidden = true;
    renderGateMode();
  });

  function showGateError(msg) {
    gateError.textContent = msg;
    gateError.hidden = false;
  }

  gateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (CONFIG_MISSING) return showGateError('Firebase not configured');
    const email = emailInput.value.trim();
    const password = passInput.value;

    if (gateMode === 'signup') {
      if (password.length < 6) return showGateError('Password should be at least 6 characters.');
      gateSubmit.disabled = true;
      try {
        await createUserWithEmailAndPassword(auth, email, password);
        // go to dashboard; session persisted for browser session
        window.location.href = 'dashboard.html';
      } catch (err) {
        gateSubmit.disabled = false;
        showGateError(err.message || 'Sign up failed');
      }
      return;
    }

    gateSubmit.disabled = true;
    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = 'dashboard.html';
    } catch (err) {
      gateSubmit.disabled = false;
      showGateError(err.message || 'Sign in failed');
    }
  });

  renderGateMode();
  emailInput.focus();
})();
