/**
 * Cliente API — modo Bolão (recreativo, sem transações financeiras).
 */
import { authHeaders } from './auth-client.js';

const API = '/api';

async function request(url, options = {}) {
  const res = await fetch(`${API}${url}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const POOL_DISCLAIMER =
  'Bolão recreativo: sem apostas, pagamentos, prêmios ou transações financeiras pelo sistema.';

export async function fetchMyPools() {
  return request('/pools');
}

export async function checkPoolName(name, excludeId = null) {
  const q = excludeId
    ? `?name=${encodeURIComponent(name)}&excludeId=${excludeId}`
    : `?name=${encodeURIComponent(name)}`;
  return request(`/pools/check-name${q}`);
}

export async function fetchPoolMatchesMeta() {
  return request('/pools/meta/matches');
}

export async function createPool(payload) {
  return request('/pools', { method: 'POST', body: JSON.stringify(payload) });
}

export async function fetchPool(id) {
  return request(`/pools/${id}`);
}

export async function updatePool(id, payload) {
  return request(`/pools/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function deletePool(id) {
  return request(`/pools/${id}`, { method: 'DELETE' });
}

export async function joinPool(id, body = {}) {
  return request(`/pools/${id}/join`, { method: 'POST', body: JSON.stringify(body) });
}

export async function fetchPoolPredictions(id) {
  return request(`/pools/${id}/predictions`);
}

export async function savePrediction(poolId, matchId, homeScore, awayScore) {
  return request(`/pools/${poolId}/predictions`, {
    method: 'POST',
    body: JSON.stringify({ matchId, homeScore, awayScore }),
  });
}

export async function fetchPoolRanking(id, page = 1) {
  return request(`/pools/${id}/ranking?page=${page}`);
}

export async function fetchPoolRules(id) {
  return request(`/pools/${id}/rules`);
}

export async function createPoolInvite(poolId, body = {}) {
  return request(`/pools/${poolId}/invites`, { method: 'POST', body: JSON.stringify(body) });
}

export async function fetchPoolInvites(poolId) {
  return request(`/pools/${poolId}/invites`);
}

export async function searchPoolInviteUsers(poolId, query) {
  const q = encodeURIComponent(query.trim());
  return request(`/pools/${poolId}/invite-users?q=${q}`);
}

export async function fetchParticipantDetail(poolId, participantId) {
  return request(`/pools/${poolId}/participants/${participantId}`);
}

export async function fetchPublicPools(page = 1) {
  return request(`/public/pools?page=${page}`);
}

export async function fetchPublicPool(slug) {
  return request(`/public/pools/${slug}`);
}

export async function fetchPublicRanking(slug, page = 1) {
  return request(`/public/pools/${slug}/ranking?page=${page}`);
}

export async function fetchPublicRules(slug) {
  return request(`/public/pools/${slug}/rules`);
}

export async function fetchInvitePreview(token) {
  return request(`/public/invite-preview?token=${encodeURIComponent(token)}`);
}

export async function joinByToken(token) {
  return request('/pools/join-by-token', { method: 'POST', body: JSON.stringify({ token }) });
}

export async function fetchMyInvites() {
  return request('/pools/invites/mine');
}

export async function respondToInvite(inviteId, accept) {
  return request(`/pools/invites/${inviteId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ accept }),
  });
}

const PENDING_JOIN_KEY = 'copa2026-pending-join';

export function savePendingJoinToken(token) {
  localStorage.setItem(PENDING_JOIN_KEY, token);
}

export function takePendingJoinToken() {
  const t = localStorage.getItem(PENDING_JOIN_KEY);
  localStorage.removeItem(PENDING_JOIN_KEY);
  return t;
}

export function statusLabel(status) {
  const map = {
    draft: 'Rascunho',
    open: 'Aberto',
    in_progress: 'Em andamento',
    closed: 'Encerrado',
    archived: 'Arquivado',
  };
  return map[status] ?? status;
}

export function visibilityLabel(v) {
  const map = { private: 'Privado', link: 'Por link', public: 'Público' };
  return map[v] ?? v;
}

export function inviteStatusLabel(status) {
  const map = {
    pending: 'Pendente',
    accepted: 'Aceito',
    declined: 'Recusado',
    expired: 'Expirado',
  };
  return map[status] ?? status;
}

export function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function formatDateShort(d) {
  if (!d) return '—';
  const s = typeof d === 'string' ? d.slice(0, 10) : d;
  return new Date(`${s}T12:00:00`).toLocaleDateString('pt-BR');
}
