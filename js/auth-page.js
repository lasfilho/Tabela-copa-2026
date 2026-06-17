import { login, register, getToken, clearAuth } from './auth-client.js';
import { takePendingJoinToken } from './pool-client.js';

const params = new URLSearchParams(location.search);
const redirect = params.get('redirect');

if (getToken()) {
  const pending = takePendingJoinToken();
  window.location.href = redirect || (pending ? `/boloes?join=${encodeURIComponent(pending)}&auto=1` : '/');
}

const choiceView = document.getElementById('auth-choice');
const formsView = document.getElementById('auth-forms');

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.hidden = !msg;
}

function showNotice(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.hidden = !msg;
}

function clearMessages() {
  showError('login-error', '');
  showError('register-error', '');
  showNotice('login-notice', '');
  showNotice('register-notice', '');
}

/** Mostra apenas o formulário do modo escolhido (login ou register). */
function selectMode(mode, { keepMessages = false } = {}) {
  if (!keepMessages) clearMessages();
  document.querySelectorAll('.auth-form').forEach((f) => {
    const active = f.dataset.panel === mode;
    f.classList.toggle('active', active);
    f.hidden = !active;
  });
  const firstEmpty = [...document.querySelectorAll(`.auth-form[data-panel="${mode}"] input`)]
    .find((inp) => !inp.value);
  (firstEmpty ?? document.querySelector(`.auth-form[data-panel="${mode}"] input`))?.focus();
}

function showForms(mode) {
  selectMode(mode);
  choiceView.hidden = true;
  formsView.hidden = false;
}

function showChoice() {
  clearMessages();
  formsView.hidden = true;
  choiceView.hidden = false;
}

document.querySelectorAll('[data-choice]').forEach((btn) => {
  btn.addEventListener('click', () => showForms(btn.dataset.choice));
});

document.getElementById('auth-back')?.addEventListener('click', showChoice);

document.querySelectorAll('[data-switch]').forEach((btn) => {
  btn.addEventListener('click', () => selectMode(btn.dataset.switch));
});

document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessages();
  const fd = new FormData(e.target);
  const email = fd.get('email');
  try {
    await login(email, fd.get('password'));
    const pending = takePendingJoinToken();
    window.location.href = redirect || (pending ? `/boloes?join=${encodeURIComponent(pending)}&auto=1` : '/');
  } catch (err) {
    // E-mail não cadastrado: leva para o cadastro com aviso.
    if (err.status === 404 || err.data?.notRegistered) {
      const regEmail = document.querySelector('#form-register input[name="email"]');
      if (regEmail) regEmail.value = email ?? '';
      selectMode('register', { keepMessages: true });
      showNotice('register-notice', 'E-mail não cadastrado. Crie sua conta para continuar.');
      return;
    }
    showError('login-error', err.message);
  }
});

document.getElementById('form-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessages();
  const fd = new FormData(e.target);
  const email = fd.get('email');
  try {
    await register(fd.get('name'), email, fd.get('password'));
    // Não faz login automático: envia para a tela de login.
    clearAuth();
    e.target.reset();
    const loginEmail = document.querySelector('#form-login input[name="email"]');
    if (loginEmail) loginEmail.value = email ?? '';
    selectMode('login', { keepMessages: true });
    showNotice('login-notice', 'Cadastro realizado! Faça login para entrar.');
  } catch (err) {
    showError('register-error', err.message);
  }
});
