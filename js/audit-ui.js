/**
 * Painel de Auditoria — administrador.
 * Lista todas as ações dos usuários no sistema.
 */
import { fetchAuditEvents, fetchAuditActions } from './admin-client.js';

const PAGE_SIZE = 50;

const ACTION_LABEL = {
  'auth.login': 'Entrou no sistema',
  'auth.register': 'Cadastrou-se',
  'match.score.update': 'Atualizou placar',
  'match.status.update': 'Encerrou/reabriu jogo',
  'match.scores.clear': 'Limpou placares',
  'preferences.update': 'Alterou preferências',
  'sync.run': 'Sincronizou placares',
  'pool.create': 'Criou bolão',
  'pool.update': 'Editou bolão',
  'pool.delete': 'Excluiu bolão',
  'pool.join': 'Entrou em bolão',
  'pool.invite.create': 'Criou convite de bolão',
  'pool.prediction.save': 'Salvou palpite',
  'pool.recalculate': 'Recalculou ranking',
  'sticker.bulk_update': 'Lançou figurinhas em lote',
  'sticker.increment': 'Adicionou figurinha',
  'sticker.decrement': 'Removeu figurinha',
  'sticker.update': 'Atualizou figurinha',
  'trade.offer.create': 'Criou oferta de troca',
  'trade.offer.update': 'Atualizou troca',
  'admin.password.change': 'Alterou a própria senha',
  'admin.user.reset_password': 'Resetou senha de usuário',
  'admin.user.delete': 'Excluiu usuário',
};

const state = {
  inited: false,
  loading: false,
  page: 0,
  total: 0,
  action: '',
  search: '',
  actions: [],
  items: [],
  ctx: { showToast: () => {}, currentUser: null },
};

let container = null;
let searchTimer = null;

export function initAudit(el, ctx = {}) {
  container = el;
  state.ctx = { showToast: ctx.showToast || (() => {}), currentUser: ctx.currentUser ?? null };
  state.inited = true;
}

export async function renderAudit(ctx = {}) {
  if (ctx.currentUser !== undefined) state.ctx.currentUser = ctx.currentUser;
  if (ctx.showToast) state.ctx.showToast = ctx.showToast;
  if (!container) return;

  if (!state.ctx.currentUser || state.ctx.currentUser.role !== 'admin') {
    container.innerHTML = '<div class="empty">Acesso restrito a administradores.</div>';
    return;
  }

  renderShell();
  if (!state.actions.length) loadActions();
  await loadEvents();
}

async function loadActions() {
  try {
    const data = await fetchAuditActions();
    state.actions = data.items || [];
    const sel = container.querySelector('#audit-action');
    if (sel) sel.innerHTML = actionOptions();
  } catch { /* silencioso */ }
}

async function loadEvents() {
  if (state.loading) return;
  state.loading = true;
  const body = container.querySelector('#audit-body');
  if (body) body.innerHTML = '<div class="pool-loading">Carregando eventos...</div>';
  try {
    const data = await fetchAuditEvents({
      limit: PAGE_SIZE,
      offset: state.page * PAGE_SIZE,
      action: state.action,
      search: state.search,
    });
    state.items = data.items || [];
    state.total = data.total || 0;
    renderTable();
  } catch (err) {
    if (body) body.innerHTML = `<div class="empty">${esc(err.message || 'Erro ao carregar')}</div>`;
  } finally {
    state.loading = false;
  }
}

function renderShell() {
  container.innerHTML = `
    <div class="audit-toolbar">
      <input type="search" id="audit-search" class="stk-input" placeholder="Buscar por usuário, ação ou rota..." value="${esc(state.search)}" />
      <select id="audit-action" class="stk-select">${actionOptions()}</select>
      <button type="button" class="btn btn--ghost btn--sm" id="audit-refresh">Atualizar</button>
    </div>
    <div id="audit-body"></div>`;

  container.querySelector('#audit-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    state.search = e.target.value.trim();
    searchTimer = setTimeout(() => { state.page = 0; loadEvents(); }, 350);
  });
  container.querySelector('#audit-action').addEventListener('change', (e) => {
    state.action = e.target.value;
    state.page = 0;
    loadEvents();
  });
  container.querySelector('#audit-refresh').addEventListener('click', () => {
    state.page = 0;
    loadActions();
    loadEvents();
  });
}

function actionOptions() {
  const opts = ['<option value="">Todas as ações</option>'];
  for (const a of state.actions) {
    const label = ACTION_LABEL[a.action] || a.action;
    const selected = state.action === a.action ? 'selected' : '';
    opts.push(`<option value="${esc(a.action)}" ${selected}>${esc(label)} (${a.count})</option>`);
  }
  return opts.join('');
}

function renderTable() {
  const body = container.querySelector('#audit-body');
  if (!body) return;

  if (!state.items.length) {
    body.innerHTML = '<div class="empty">Nenhum evento encontrado.</div>';
    return;
  }

  const rows = state.items.map((e) => {
    const who = e.actorName || e.actorEmail || (e.userId ? `#${e.userId}` : 'Anônimo');
    const role = e.actorRole === 'admin' ? '<span class="audit-tag audit-tag--admin">admin</span>' : '';
    const failed = e.statusCode >= 400 ? `<span class="audit-tag audit-tag--fail">${e.statusCode}</span>` : '';
    return `
      <tr>
        <td class="audit-when">${formatDate(e.createdAt)}</td>
        <td>
          <div class="audit-who">${esc(who)} ${role}</div>
          ${e.actorEmail && e.actorName ? `<div class="audit-email">${esc(e.actorEmail)}</div>` : ''}
        </td>
        <td>
          <div class="audit-action-label">${esc(ACTION_LABEL[e.action] || e.action)} ${failed}</div>
          <div class="audit-path">${esc(e.method || '')} ${esc(e.path || '')}</div>
        </td>
        <td class="audit-details">${renderDetails(e.details)}</td>
        <td class="audit-ip">${esc(e.ip || '—')}</td>
      </tr>`;
  }).join('');

  const totalPages = Math.max(Math.ceil(state.total / PAGE_SIZE), 1);
  const from = state.total ? state.page * PAGE_SIZE + 1 : 0;
  const to = Math.min((state.page + 1) * PAGE_SIZE, state.total);

  body.innerHTML = `
    <div class="audit-table-wrap">
      <table class="audit-table">
        <thead><tr><th>Quando</th><th>Usuário</th><th>Ação</th><th>Detalhes</th><th>IP</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="audit-pager">
      <span class="stk-muted">${from}–${to} de ${state.total}</span>
      <div class="stk-actions">
        <button type="button" class="btn btn--ghost btn--sm" id="audit-prev" ${state.page <= 0 ? 'disabled' : ''}>‹ Anteriores</button>
        <span class="stk-muted">Página ${state.page + 1}/${totalPages}</span>
        <button type="button" class="btn btn--ghost btn--sm" id="audit-next" ${state.page + 1 >= totalPages ? 'disabled' : ''}>Próximos ›</button>
      </div>
    </div>`;

  body.querySelector('#audit-prev')?.addEventListener('click', () => {
    if (state.page > 0) { state.page -= 1; loadEvents(); }
  });
  body.querySelector('#audit-next')?.addEventListener('click', () => {
    if ((state.page + 1) * PAGE_SIZE < state.total) { state.page += 1; loadEvents(); }
  });
}

function renderDetails(details) {
  if (!details || typeof details !== 'object' || !Object.keys(details).length) return '<span class="stk-muted">—</span>';
  const parts = Object.entries(details)
    .slice(0, 6)
    .map(([k, v]) => `<span class="audit-kv"><b>${esc(k)}</b>: ${esc(formatValue(v))}</span>`);
  return parts.join(' ');
}

function formatValue(v) {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function formatDate(iso) {
  try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }); } catch { return ''; }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
