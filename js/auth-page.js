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

document.querySelectorAll('.auth-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach((t) => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.auth-form').forEach((f) => {
      const active = f.dataset.panel === tab.dataset.tab;
      f.classList.toggle('active', active);
      f.hidden = !active;
    });
    showError('login-error', '');
    showError('register-error', '');
  });
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
