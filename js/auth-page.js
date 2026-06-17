import { login, register, getToken } from './auth-client.js';
import { takePendingJoinToken } from './pool-client.js';

const params = new URLSearchParams(location.search);
const redirect = params.get('redirect');

if (getToken()) {
  const pending = takePendingJoinToken();
  window.location.href = redirect || (pending ? `/boloes?join=${encodeURIComponent(pending)}&auto=1` : '/');
}

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.hidden = !msg;
}

const choiceView = document.getElementById('auth-choice');
const formsView = document.getElementById('auth-forms');

function selectMode(mode) {
  document.querySelectorAll('.auth-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === mode);
  });
  document.querySelectorAll('.auth-form').forEach((f) => {
    const active = f.dataset.panel === mode;
    f.classList.toggle('active', active);
    f.hidden = !active;
  });
  showError('login-error', '');
  showError('register-error', '');
  const firstInput = document.querySelector(`.auth-form[data-panel="${mode}"] input`);
  firstInput?.focus();
}

function showForms(mode) {
  selectMode(mode);
  choiceView.hidden = true;
  formsView.hidden = false;
}

function showChoice() {
  formsView.hidden = true;
  choiceView.hidden = false;
}

document.querySelectorAll('[data-choice]').forEach((btn) => {
  btn.addEventListener('click', () => showForms(btn.dataset.choice));
});

document.getElementById('auth-back')?.addEventListener('click', showChoice);

document.querySelectorAll('.auth-tab').forEach((tab) => {
  tab.addEventListener('click', () => selectMode(tab.dataset.tab));
});

document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('login-error', '');
  const fd = new FormData(e.target);
  try {
    await login(fd.get('email'), fd.get('password'));
    const pending = takePendingJoinToken();
    window.location.href = redirect || (pending ? `/boloes?join=${encodeURIComponent(pending)}&auto=1` : '/');
  } catch (err) {
    showError('login-error', err.message);
  }
});

document.getElementById('form-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('register-error', '');
  const fd = new FormData(e.target);
  try {
    await register(fd.get('name'), fd.get('email'), fd.get('password'));
    const pending = takePendingJoinToken();
    window.location.href = redirect || (pending ? `/boloes?join=${encodeURIComponent(pending)}&auto=1` : '/');
  } catch (err) {
    showError('register-error', err.message);
  }
});
