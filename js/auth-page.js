import { login, register, getToken, clearAuth } from './auth-client.js';
import { takePendingJoinToken } from './pool-client.js';

const params = new URLSearchParams(location.search);
const redirect = params.get('redirect');

if (getToken()) {
  const pending = takePendingJoinToken();
  window.location.href = redirect || (pending ? `/boloes?join=${encodeURIComponent(pending)}&auto=1` : '/');
}

const screens = {
  choice: document.getElementById('auth-choice'),
  login: document.getElementById('auth-login-screen'),
  register: document.getElementById('auth-register-screen'),
};

function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.hidden = !msg;
}

function showNotice(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.hidden = !msg;
}

function clearLoginMessages() {
  showError('login-error', '');
  showNotice('login-notice', '');
  const help = document.getElementById('login-help');
  if (help) help.hidden = true;
}

function clearRegisterMessages() {
  showError('register-error', '');
  showNotice('register-notice', '');
}

/** Exibe uma única tela por vez (choice | login | register). */
function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) {
    if (el) el.hidden = key !== name;
  }
  if (name === 'login') {
    clearLoginMessages();
    screens.login?.querySelector('input[name="email"]')?.focus();
  } else if (name === 'register') {
    clearRegisterMessages();
    screens.register?.querySelector('input[name="name"]')?.focus();
  }
}

document.querySelectorAll('[data-go]').forEach((btn) => {
  btn.addEventListener('click', () => showScreen(btn.dataset.go));
});

document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearLoginMessages();
  const fd = new FormData(e.target);
  const email = fd.get('email');
  try {
    await login(email, fd.get('password'));
    const pending = takePendingJoinToken();
    window.location.href = redirect || (pending ? `/boloes?join=${encodeURIComponent(pending)}&auto=1` : '/');
  } catch {
    showError('login-error', 'E-mail ou senha incorretos.');
    const help = document.getElementById('login-help');
    if (help) help.hidden = false;
  }
});

document.getElementById('form-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearRegisterMessages();
  const fd = new FormData(e.target);
  const email = fd.get('email');
  try {
    await register(fd.get('name'), email, fd.get('password'));
    clearAuth();
    e.target.reset();
    const loginEmail = screens.login?.querySelector('input[name="email"]');
    if (loginEmail) loginEmail.value = email ?? '';
    showScreen('login');
    showNotice('login-notice', 'Cadastro realizado! Faça login para entrar.');
  } catch (err) {
    showError('register-error', err.message);
  }
});

// Ao ir para cadastro a partir do link de erro no login, preserva o e-mail digitado.
document.querySelectorAll('[data-go="register"]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const loginEmail = screens.login?.querySelector('input[name="email"]')?.value;
    const regEmail = screens.register?.querySelector('input[name="email"]');
    if (loginEmail && regEmail && !regEmail.value) regEmail.value = loginEmail;
  });
});
