/**
 * Cliente API — módulo Álbum de Figurinhas.
 */
import { authHeaders } from './auth-client.js';

const API = '/api/stickers';

async function request(url, options = {}) {
  const res = await fetch(`${API}${url}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function fetchMyAlbum() {
  return request('/me/album');
}

export async function fetchStats() {
  return request('/me/album/stats');
}

export async function fetchMissing() {
  return request('/me/album/missing');
}

export async function fetchDuplicates() {
  return request('/me/album/duplicates');
}

export async function incrementSticker(stickerId) {
  return request(`/me/album/stickers/${stickerId}/increment`, { method: 'POST' });
}

export async function decrementSticker(stickerId) {
  return request(`/me/album/stickers/${stickerId}/decrement`, { method: 'POST' });
}

export async function setStickerQuantity(stickerId, quantity) {
  return request(`/me/album/stickers/${stickerId}/quantity`, {
    method: 'POST',
    body: JSON.stringify({ quantity }),
  });
}

export async function reserveSticker(stickerId, reserved) {
  return request(`/me/album/stickers/${stickerId}/reserve`, {
    method: 'POST',
    body: JSON.stringify({ reserved }),
  });
}

export async function bulkUpdate(codes, { mode = 'increment', quantity = 1 } = {}) {
  return request('/me/album/bulk-update', {
    method: 'POST',
    body: JSON.stringify({ codes, mode, quantity }),
  });
}

export async function fetchTradeSuggestions() {
  return request('/trades/suggestions');
}

export async function fetchTradeOffers() {
  return request('/trades/offers');
}

export async function createTradeOffer(payload) {
  return request('/trades/offers', { method: 'POST', body: JSON.stringify(payload) });
}

export async function patchTradeOffer(id, status) {
  return request(`/trades/offers/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export async function fetchTradeHistory() {
  return request('/trades/history');
}
