/**
 * Cliente de autenticação (JWT em localStorage).
 */
const TOKEN_KEY = 'copa2026-token';
const USER_KEY = 'copa2026-user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function authRequest(url, options = {}) {
  const { headers: extraHeaders, ...rest } = options;
  const res = await fetch(`/api/auth${url}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function login(email, password) {
  const data = await authRequest('/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setAuth(data.token, data.user);
  return data.user;
}

export async function register(name, email, password) {
  const data = await authRequest('/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
  setAuth(data.token, data.user);
  return data.user;
}

export async function fetchCurrentUser() {
  const token = getToken();
  if (!token) return null;
  try {
    const data = await authRequest('/me', { headers: authHeaders() });
    setAuth(token, data.user);
    return data.user;
  } catch {
    clearAuth();
    return null;
  }
}

export function logout() {
  clearAuth();
  window.location.href = '/';
}
