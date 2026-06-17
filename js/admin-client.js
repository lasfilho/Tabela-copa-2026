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

export async function fetchAuditEvents({ limit = 50, offset = 0, action = '', search = '' } = {}) {
  const params = new URLSearchParams();
  params.set('limit', limit);
  params.set('offset', offset);
  if (action) params.set('action', action);
  if (search) params.set('q', search);
  return request(`/audit?${params.toString()}`);
}

export async function fetchAuditActions() {
  return request('/audit/actions');
}
