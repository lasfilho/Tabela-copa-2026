/**
 * Cliente API — administração (somente admin).
 */
import { authHeaders } from './auth-client.js';

const API = '/api/admin';

async function request(url, options = {}) {
  const res = await fetch(`${API}${url}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function fetchAdminUsers() {
  return request('/users');
}

export async function deleteAdminUser(userId) {
  return request(`/users/${userId}`, { method: 'DELETE' });
}

export async function resetUserPassword(userId, newPassword) {
  return request(`/users/${userId}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ newPassword }),
  });
}

export async function changeOwnPassword(currentPassword, newPassword) {
  return request('/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}
