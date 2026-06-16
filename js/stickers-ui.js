/**
 * UI do módulo Álbum de Figurinhas.
 * Renderiza dentro de #stickers-content com sub-abas próprias.
 */
import {
  fetchMyAlbum, incrementSticker, decrementSticker, setStickerQuantity,
  reserveSticker, bulkUpdate, fetchTradeSuggestions, fetchTradeOffers,
  createTradeOffer, patchTradeOffer, fetchTradeHistory,
} from './stickers-client.js';

const SUBTABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'collection', label: 'Minha coleção' },
  { id: 'missing', label: 'Faltantes' },
  { id: 'duplicates', label: 'Repetidas' },
  { id: 'trades', label: 'Trocas' },
  { id: 'stats', label: 'Estatísticas' },
];

const CATEGORY_LABEL = {
  especial: 'Especiais',
  estadio: 'Estádios',
  escudo: 'Escudos',
  jogador: 'Jogadores',
};

const state = {
  inited: false,
  loaded: false,
  loading: false,
  album: null,
  stickers: [],
  subtab: 'dashboard',
  view: 'grid',
  filters: { search: '', category: 'all', team: 'all', type: 'all', page: 'all', status: 'all' },
  suggestions: null,
  offers: { incoming: [], outgoing: [] },
  history: [],
  ctx: { showToast: () => {}, currentUser: null },
};

let container = null;

export function initStickers(el, ctx = {}) {
  container = el;
  state.ctx = { showToast: ctx.showToast || (() => {}), currentUser: ctx.currentUser ?? null };
  if (state.inited) return;
  state.inited = true;
  bindEvents();
}

export function setStickersUser(user) {
  state.ctx.currentUser = user ?? null;
}

export async function renderStickers(ctx = {}) {
  if (ctx.currentUser !== undefined) state.ctx.currentUser = ctx.currentUser;
  if (ctx.showToast) state.ctx.showToast = ctx.showToast;
  if (!container) return;

  if (!state.ctx.currentUser) {
    container.innerHTML = loginPrompt();
    return;
  }

  if (!state.loaded && !state.loading) {
    container.innerHTML = '<div class="empty" style="padding:2rem">Carregando álbum...</div>';
    await loadAlbum();
  }
  render();
}

/* ---------------- Data ---------------- */

async function loadAlbum(force = false) {
  if (state.loading) return;
  state.loading = true;
  try {
    const data = await fetchMyAlbum();
    state.album = data.album;
    state.stickers = data.stickers || [];
    state.loaded = true;
  } catch (err) {
    state.ctx.showToast(err.message || 'Erro ao carregar álbum');
  } finally {
    state.loading = false;
  }
}

function statusOf(s) {
  if ((s.quantity ?? 0) < 1) return 'missing';
  if ((s.duplicates ?? 0) > 0) return s.reservedForTrade > 0 ? 'reserved' : 'duplicate';
  return 'owned';
}

function computeStats() {
  const stickers = state.stickers;
  const total = stickers.length;
  const owned = stickers.filter((s) => s.owned).length;
  const duplicates = stickers.reduce((a, s) => a + (s.duplicates || 0), 0);
  const reserved = stickers.reduce((a, s) => a + (s.reservedForTrade || 0), 0);
  const completion = total ? Math.round((owned / total) * 1000) / 10 : 0;

  const agg = (items, keyFn, metaFn) => {
    const map = new Map();
    for (const s of items) {
      const key = keyFn(s);
      if (key == null) continue;
      if (!map.has(key)) map.set(key, { key, ...(metaFn ? metaFn(s) : {}), total: 0, owned: 0 });
      const e = map.get(key);
      e.total += 1;
      if (s.owned) e.owned += 1;
    }
    return [...map.values()].map((e) => ({
      ...e, missing: e.total - e.owned,
      completion: e.total ? Math.round((e.owned / e.total) * 1000) / 10 : 0,
    }));
  };

  const byCategory = agg(stickers, (s) => s.category).sort((a, b) => b.completion - a.completion);
  const byTeam = agg(stickers.filter((s) => s.teamId), (s) => s.teamId,
    (s) => ({ teamName: s.teamName, teamFlag: s.teamFlag })).sort((a, b) => b.completion - a.completion);
  const pages = agg(stickers, (s) => s.page, (s) => ({ page: s.page }))
    .map((p) => ({ ...p, complete: p.missing === 0, near: p.missing > 0 && p.missing <= 2 }))
    .sort((a, b) => a.page - b.page);

  return {
    total, owned, missing: total - owned, duplicates, reserved, completion,
    byCategory, byTeam, pages,
    pagesComplete: pages.filter((p) => p.complete).length,
    pagesNearComplete: pages.filter((p) => p.near).length,
  };
}

/* ---------------- Render ---------------- */

function render() {
  if (!container) return;
  const nav = SUBTABS.map((t) => `
    <button type="button" class="stk-tab ${state.subtab === t.id ? 'active' : ''}" data-stk-tab="${t.id}">
      ${t.label}
    </button>`).join('');

  let body = '';
  switch (state.subtab) {
    case 'dashboard': body = renderDashboard(); break;
    case 'collection': body = renderCollection(); break;
    case 'missing': body = renderMissing(); break;
    case 'duplicates': body = renderDuplicates(); break;
    case 'trades': body = renderTrades(); break;
    case 'stats': body = renderStatsTab(); break;
  }

  container.innerHTML = `
    <div class="stk-wrap">
      <div class="stk-tabs" role="tablist">${nav}</div>
      <div class="stk-body">${body}</div>
    </div>`;
}

function loginPrompt() {
  return `
    <div class="empty" style="padding:3rem">
      <h2>Álbum de Figurinhas</h2>
      <p>Faça login para controlar sua coleção, faltantes, repetidas e trocas.</p>
      <a href="/auth.html" class="btn btn--primary">Entrar</a>
    </div>`;
}

function statCard(label, value, accent = '') {
  return `<article class="stk-stat ${accent}"><span class="stk-stat__value">${value}</span><span class="stk-stat__label">${label}</span></article>`;
}

function progressBar(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="stk-progress"><div class="stk-progress__fill" style="width:${p}%"></div></div>`;
}

function renderDashboard() {
  const st = computeStats();
  return `
    <section class="stk-section">
      <div class="stk-stats-grid">
        ${statCard('Total do álbum', st.total)}
        ${statCard('Possuo', st.owned, 'is-owned')}
        ${statCard('Faltam', st.missing, 'is-missing')}
        ${statCard('Repetidas', st.duplicates, 'is-dup')}
        ${statCard('Reservadas p/ troca', st.reserved)}
        ${statCard('Conclusão', `${st.completion}%`, 'is-accent')}
      </div>

      <article class="card">
        <div class="card__header"><h2>Progresso geral</h2><span class="stk-muted">${st.owned}/${st.total}</span></div>
        <div class="card__body">
          ${progressBar(st.completion)}
          <p class="stk-muted">Páginas completas: <strong>${st.pagesComplete}</strong> · Quase completas: <strong>${st.pagesNearComplete}</strong></p>
        </div>
      </article>

      <div class="grid grid--2">
        <article class="card">
          <div class="card__header"><h2>Progresso por categoria</h2></div>
          <div class="card__body">${st.byCategory.map(rowProgress).join('') || '<p class="stk-muted">Sem dados</p>'}</div>
        </article>
        <article class="card">
          <div class="card__header"><h2>Top seleções</h2></div>
          <div class="card__body">${st.byTeam.slice(0, 8).map(rowProgressTeam).join('') || '<p class="stk-muted">Sem dados</p>'}</div>
        </article>
      </div>
    </section>`;
}

function rowProgress(e) {
  const label = CATEGORY_LABEL[e.key] || e.key;
  return `
    <div class="stk-progress-row">
      <div class="stk-progress-row__head"><span>${label}</span><span class="stk-muted">${e.owned}/${e.total} · ${e.completion}%</span></div>
      ${progressBar(e.completion)}
    </div>`;
}

function rowProgressTeam(e) {
  return `
    <div class="stk-progress-row">
      <div class="stk-progress-row__head"><span>${e.teamFlag || ''} ${escapeHtml(e.teamName || '')}</span><span class="stk-muted">${e.owned}/${e.total} · ${e.completion}%</span></div>
      ${progressBar(e.completion)}
    </div>`;
}

/* ---------------- Coleção ---------------- */

function uniqueOptions(getter, labelFn = (v) => v) {
  const set = new Map();
  for (const s of state.stickers) {
    const v = getter(s);
    if (v == null || v === '') continue;
    if (!set.has(v)) set.set(v, labelFn(v, s));
  }
  return [...set.entries()];
}

function filteredStickers() {
  const f = state.filters;
  const q = f.search.trim().toLowerCase();
  return state.stickers.filter((s) => {
    if (f.category !== 'all' && s.category !== f.category) return false;
    if (f.team !== 'all' && s.teamId !== f.team) return false;
    if (f.type !== 'all' && s.type !== f.type) return false;
    if (f.page !== 'all' && String(s.page) !== String(f.page)) return false;
    if (f.status !== 'all' && statusOf(s) !== f.status) return false;
    if (q) {
      const hay = `${s.code} ${s.title} ${s.teamName || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderCollection() {
  const f = state.filters;
  const catOpts = uniqueOptions((s) => s.category, (v) => CATEGORY_LABEL[v] || v);
  const teamOpts = uniqueOptions((s) => s.teamId, (v, s) => `${s.teamFlag || ''} ${s.teamName || v}`);
  const typeOpts = uniqueOptions((s) => s.type);
  const pageOpts = [...new Set(state.stickers.map((s) => s.page))].sort((a, b) => a - b);

  const list = filteredStickers();
  const grid = state.view === 'grid'
    ? `<div class="stk-grid">${list.map(stickerCell).join('')}</div>`
    : renderCollectionTable(list);

  return `
    <section class="stk-section">
      <article class="card stk-quick">
        <div class="card__header"><h2>Lançamento rápido</h2></div>
        <div class="card__body">
          <p class="stk-muted">Cole números separados por vírgula, espaço ou quebra de linha. Cada repetição soma uma figurinha.</p>
          <div class="stk-quick__row">
            <textarea id="stk-bulk-input" class="stk-textarea" rows="2" placeholder="Ex.: 12, 45 88 120&#10;233"></textarea>
            <button type="button" class="btn btn--primary" id="stk-bulk-apply">Adicionar</button>
          </div>
        </div>
      </article>

      <div class="stk-toolbar">
        <input type="search" id="stk-search" class="stk-input" placeholder="Buscar nº ou nome..." value="${escapeAttr(f.search)}" />
        ${selectFilter('stk-f-category', 'Categoria', catOpts, f.category)}
        ${selectFilter('stk-f-team', 'Seleção', teamOpts, f.team)}
        ${selectFilter('stk-f-type', 'Tipo', typeOpts, f.type)}
        ${selectFilter('stk-f-page', 'Página', pageOpts.map((p) => [String(p), `Pág. ${p}`]), f.page)}
        ${selectFilter('stk-f-status', 'Status', [['missing', 'Faltando'], ['owned', 'Possuo'], ['duplicate', 'Repetida'], ['reserved', 'Reservada']], f.status)}
        <div class="stk-view-toggle">
          <button type="button" class="btn btn--ghost btn--sm ${state.view === 'grid' ? 'active' : ''}" data-stk-view="grid">Grade</button>
          <button type="button" class="btn btn--ghost btn--sm ${state.view === 'table' ? 'active' : ''}" data-stk-view="table">Tabela</button>
        </div>
      </div>

      <p class="stk-muted">${list.length} figurinha(s)</p>
      ${list.length ? grid : '<p class="empty">Nenhuma figurinha com esses filtros.</p>'}
    </section>`;
}

function stickerCell(s) {
  const status = statusOf(s);
  return `
    <div class="stk-cell stk-cell--${status}" data-sticker="${s.id}">
      <div class="stk-cell__code">#${escapeHtml(s.code)}</div>
      <div class="stk-cell__title">${escapeHtml(s.title)}</div>
      <div class="stk-cell__qty">
        <button type="button" class="stk-qty-btn" data-stk-dec="${s.id}" aria-label="Diminuir">−</button>
        <span class="stk-qty-val">${s.quantity}</span>
        <button type="button" class="stk-qty-btn" data-stk-inc="${s.id}" aria-label="Aumentar">+</button>
      </div>
      ${s.duplicates > 0 ? `<div class="stk-cell__badge">+${s.duplicates} rep.</div>` : ''}
    </div>`;
}

function renderCollectionTable(list) {
  const rows = list.map((s) => `
    <tr class="stk-row--${statusOf(s)}">
      <td>#${escapeHtml(s.code)}</td>
      <td>${escapeHtml(s.title)}</td>
      <td>${CATEGORY_LABEL[s.category] || s.category}</td>
      <td>${s.teamFlag || ''} ${escapeHtml(s.teamName || '—')}</td>
      <td>${s.page}</td>
      <td class="stk-td-qty">
        <button type="button" class="stk-qty-btn" data-stk-dec="${s.id}">−</button>
        <span class="stk-qty-val">${s.quantity}</span>
        <button type="button" class="stk-qty-btn" data-stk-inc="${s.id}">+</button>
      </td>
    </tr>`).join('');
  return `
    <div class="stk-table-wrap">
      <table class="stk-table">
        <thead><tr><th>Nº</th><th>Título</th><th>Categoria</th><th>Seleção</th><th>Pág.</th><th>Qtde</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* ---------------- Faltantes ---------------- */

function renderMissing() {
  const missing = state.stickers.filter((s) => !s.owned)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return `
    <section class="stk-section">
      <div class="stk-toolbar">
        <span class="stk-muted">${missing.length} figurinha(s) faltando</span>
        <div class="stk-actions">
          <button type="button" class="btn btn--ghost btn--sm" data-stk-copy="missing">Copiar lista</button>
          <button type="button" class="btn btn--ghost btn--sm" data-stk-csv="missing">Exportar CSV</button>
          <button type="button" class="btn btn--ghost btn--sm" data-stk-whatsapp="missing">WhatsApp</button>
        </div>
      </div>
      ${missing.length ? `<div class="stk-chips">${missing.map((s) => `<span class="stk-chip" title="${escapeAttr(s.title)}">#${escapeHtml(s.code)}</span>`).join('')}</div>` : '<p class="empty">Parabéns! Nenhuma figurinha faltando.</p>'}
    </section>`;
}

/* ---------------- Repetidas ---------------- */

function renderDuplicates() {
  const dups = state.stickers.filter((s) => (s.duplicates || 0) > 0)
    .sort((a, b) => b.duplicates - a.duplicates);
  const rows = dups.map((s) => `
    <tr>
      <td>#${escapeHtml(s.code)}</td>
      <td>${escapeHtml(s.title)}</td>
      <td>${CATEGORY_LABEL[s.category] || s.category}</td>
      <td>${s.duplicates}</td>
      <td>${s.reservedForTrade > 0 ? `<span class="stk-tag stk-tag--ok">Reservadas: ${s.reservedForTrade}</span>` : '<span class="stk-tag">Não reservada</span>'}</td>
      <td class="stk-td-qty">
        <button type="button" class="stk-qty-btn" data-stk-unreserve="${s.id}">−</button>
        <span class="stk-qty-val">${s.reservedForTrade}</span>
        <button type="button" class="stk-qty-btn" data-stk-reserve="${s.id}">+</button>
      </td>
    </tr>`).join('');
  return `
    <section class="stk-section">
      <div class="stk-toolbar">
        <span class="stk-muted">${dups.length} figurinha(s) repetida(s)</span>
        <div class="stk-actions">
          <button type="button" class="btn btn--ghost btn--sm" data-stk-copy="duplicates">Copiar lista</button>
          <button type="button" class="btn btn--ghost btn--sm" data-stk-whatsapp="duplicates">WhatsApp</button>
        </div>
      </div>
      ${dups.length ? `<div class="stk-table-wrap"><table class="stk-table">
        <thead><tr><th>Nº</th><th>Título</th><th>Categoria</th><th>Repetidas</th><th>Troca</th><th>Reservar</th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : '<p class="empty">Você ainda não tem figurinhas repetidas.</p>'}
    </section>`;
}

/* ---------------- Trocas ---------------- */

function renderTrades() {
  const sug = state.suggestions;
  const suggestionsHtml = sug == null
    ? '<p class="stk-muted">Carregando sugestões...</p>'
    : (sug.length
      ? sug.map(suggestionCard).join('')
      : '<p class="empty">Nenhuma sugestão por enquanto. Marque repetidas e cadastre faltantes para encontrar trocas.</p>');

  const incoming = state.offers.incoming.map((o) => offerCard(o, 'incoming')).join('')
    || '<p class="stk-muted">Nenhuma oferta recebida.</p>';
  const outgoing = state.offers.outgoing.map((o) => offerCard(o, 'outgoing')).join('')
    || '<p class="stk-muted">Nenhuma oferta enviada.</p>';

  const history = state.history.length
    ? state.history.map((h) => `<li>${formatDate(h.createdAt)} — <strong>${actionLabel(h.action)}</strong> · ${escapeHtml(h.fromUserName)} ⇄ ${escapeHtml(h.toUserName || '—')}</li>`).join('')
    : '<li class="stk-muted">Sem histórico ainda.</li>';

  return `
    <section class="stk-section">
      <article class="card">
        <div class="card__header"><h2>Sugestões de troca</h2>
          <button type="button" class="btn btn--ghost btn--sm" data-stk-refresh-trades>Atualizar</button></div>
        <div class="card__body">${suggestionsHtml}</div>
      </article>

      <div class="grid grid--2">
        <article class="card"><div class="card__header"><h2>Ofertas recebidas</h2></div><div class="card__body">${incoming}</div></article>
        <article class="card"><div class="card__header"><h2>Ofertas enviadas</h2></div><div class="card__body">${outgoing}</div></article>
      </div>

      <article class="card"><div class="card__header"><h2>Histórico</h2></div><div class="card__body"><ul class="stk-history">${history}</ul></div></article>
    </section>`;
}

function suggestionCard(u) {
  const theyOffer = u.theyOffer.map((s) => `<span class="stk-chip" title="${escapeAttr(s.title)}">#${escapeHtml(s.code)}</span>`).join('') || '<span class="stk-muted">—</span>';
  const iOffer = u.iOffer.map((s) => `<span class="stk-chip stk-chip--ok" title="${escapeAttr(s.title)}">#${escapeHtml(s.code)}</span>`).join('') || '<span class="stk-muted">—</span>';
  return `
    <div class="stk-suggestion">
      <div class="stk-suggestion__head">
        <strong>${escapeHtml(u.userName)}</strong>
        <span class="stk-tag stk-tag--ok">${u.score} match(es)</span>
      </div>
      <div class="stk-suggestion__cols">
        <div><span class="stk-muted">Você precisa (ela/ele tem):</span><div class="stk-chips">${theyOffer}</div></div>
        <div><span class="stk-muted">Você oferece:</span><div class="stk-chips">${iOffer}</div></div>
      </div>
      <button type="button" class="btn btn--primary btn--sm" data-stk-propose="${u.userId}">Propor troca</button>
    </div>`;
}

function offerCard(o, kind) {
  const offered = o.offered.map((s) => `#${escapeHtml(s.code)}`).join(', ') || '—';
  const requested = o.requested.map((s) => `#${escapeHtml(s.code)}`).join(', ') || '—';
  const other = kind === 'incoming' ? o.fromUserName : (o.toUserName || '—');
  let actions = '';
  if (kind === 'incoming' && o.status === 'pending') {
    actions = `<button type="button" class="btn btn--primary btn--sm" data-stk-offer="${o.id}" data-status="accepted">Aceitar</button>
               <button type="button" class="btn btn--ghost btn--sm" data-stk-offer="${o.id}" data-status="declined">Recusar</button>`;
  } else if (kind === 'outgoing' && o.status === 'pending') {
    actions = `<button type="button" class="btn btn--ghost btn--sm" data-stk-offer="${o.id}" data-status="cancelled">Cancelar</button>`;
  } else if (o.status === 'accepted') {
    actions = `<button type="button" class="btn btn--primary btn--sm" data-stk-offer="${o.id}" data-status="completed">Concluir</button>`;
  }
  return `
    <div class="stk-offer stk-offer--${o.status}">
      <div class="stk-offer__head"><strong>${escapeHtml(other)}</strong><span class="stk-tag">${statusLabel(o.status)}</span></div>
      <div class="stk-muted">Oferece: ${offered}</div>
      <div class="stk-muted">Pede: ${requested}</div>
      ${o.message ? `<p class="stk-offer__msg">${escapeHtml(o.message)}</p>` : ''}
      <div class="stk-actions">${actions}</div>
    </div>`;
}

/* ---------------- Estatísticas ---------------- */

function renderStatsTab() {
  const st = computeStats();
  const cats = st.byCategory.map(rowProgress).join('');
  const teams = st.byTeam.map(rowProgressTeam).join('');
  const dupByCat = st.byCategory.map((c) => {
    const dup = state.stickers.filter((s) => s.category === c.key).reduce((a, s) => a + (s.duplicates || 0), 0);
    return `<li>${CATEGORY_LABEL[c.key] || c.key}: <strong>${dup}</strong></li>`;
  }).join('');

  return `
    <section class="stk-section">
      <div class="stk-stats-grid">
        ${statCard('Conclusão', `${st.completion}%`, 'is-accent')}
        ${statCard('Páginas completas', st.pagesComplete)}
        ${statCard('Quase completas', st.pagesNearComplete)}
        ${statCard('Repetidas', st.duplicates, 'is-dup')}
      </div>
      <div class="grid grid--2">
        <article class="card"><div class="card__header"><h2>Por categoria</h2></div><div class="card__body">${cats}</div></article>
        <article class="card"><div class="card__header"><h2>Por seleção</h2></div><div class="card__body">${teams}</div></article>
      </div>
      <article class="card"><div class="card__header"><h2>Repetidas por categoria</h2></div><div class="card__body"><ul class="stk-history">${dupByCat}</ul></div></article>
    </section>`;
}

/* ---------------- Helpers de UI ---------------- */

function selectFilter(id, label, options, value) {
  const opts = [`<option value="all">${label}: todos</option>`]
    .concat(options.map(([v, l]) => `<option value="${escapeAttr(String(v))}" ${String(value) === String(v) ? 'selected' : ''}>${escapeHtml(String(l))}</option>`));
  return `<select class="stk-select" data-stk-filter="${id}">${opts.join('')}</select>`;
}

function statusLabel(s) {
  return ({ pending: 'Pendente', accepted: 'Aceita', declined: 'Recusada', cancelled: 'Cancelada', completed: 'Concluída' })[s] || s;
}
function actionLabel(a) {
  return ({ created: 'Criada', accepted: 'Aceita', declined: 'Recusada', cancelled: 'Cancelada', completed: 'Concluída' })[a] || a;
}
function formatDate(iso) {
  try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; }
}
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

/* ---------------- Eventos ---------------- */

function bindEvents() {
  container.addEventListener('click', onClick);
  container.addEventListener('input', onInput);
  container.addEventListener('change', onChange);
}

function getId(el, attr) { return Number(el.getAttribute(attr)); }

async function onClick(e) {
  const tabBtn = e.target.closest('[data-stk-tab]');
  if (tabBtn) {
    state.subtab = tabBtn.dataset.stkTab;
    if (state.subtab === 'trades') refreshTrades();
    render();
    return;
  }

  const viewBtn = e.target.closest('[data-stk-view]');
  if (viewBtn) { state.view = viewBtn.dataset.stkView; render(); return; }

  const inc = e.target.closest('[data-stk-inc]');
  if (inc) { await mutateQty(getId(inc, 'data-stk-inc'), 'inc'); return; }
  const dec = e.target.closest('[data-stk-dec]');
  if (dec) { await mutateQty(getId(dec, 'data-stk-dec'), 'dec'); return; }

  const reserve = e.target.closest('[data-stk-reserve]');
  if (reserve) { await mutateReserve(getId(reserve, 'data-stk-reserve'), +1); return; }
  const unreserve = e.target.closest('[data-stk-unreserve]');
  if (unreserve) { await mutateReserve(getId(unreserve, 'data-stk-unreserve'), -1); return; }

  if (e.target.closest('#stk-bulk-apply')) { await applyBulk(); return; }

  const copyBtn = e.target.closest('[data-stk-copy]');
  if (copyBtn) { copyList(copyBtn.dataset.stkCopy, 'plain'); return; }
  const csvBtn = e.target.closest('[data-stk-csv]');
  if (csvBtn) { exportCsv(csvBtn.dataset.stkCsv); return; }
  const waBtn = e.target.closest('[data-stk-whatsapp]');
  if (waBtn) { copyList(waBtn.dataset.stkWhatsapp, 'whatsapp'); return; }

  if (e.target.closest('[data-stk-refresh-trades]')) { await refreshTrades(); render(); return; }

  const propose = e.target.closest('[data-stk-propose]');
  if (propose) { await proposeTrade(getId(propose, 'data-stk-propose')); return; }

  const offerBtn = e.target.closest('[data-stk-offer]');
  if (offerBtn) { await actOffer(getId(offerBtn, 'data-stk-offer'), offerBtn.dataset.status); return; }
}

function onInput(e) {
  if (e.target.id === 'stk-search') {
    state.filters.search = e.target.value;
    const wrap = container.querySelector('.stk-grid, .stk-table-wrap');
    const list = filteredStickers();
    if (wrap) {
      wrap.outerHTML = state.view === 'grid'
        ? `<div class="stk-grid">${list.map(stickerCell).join('')}</div>`
        : renderCollectionTable(list);
    }
  }
}

function onChange(e) {
  const filter = e.target.closest('[data-stk-filter]');
  if (!filter) return;
  const map = {
    'stk-f-category': 'category', 'stk-f-team': 'team', 'stk-f-type': 'type',
    'stk-f-page': 'page', 'stk-f-status': 'status',
  };
  const key = map[filter.dataset.stkFilter];
  if (key) { state.filters[key] = e.target.value; render(); }
}

function localSticker(id) { return state.stickers.find((s) => s.id === id); }

async function mutateQty(id, dir) {
  const s = localSticker(id);
  if (!s) return;
  try {
    const res = dir === 'inc' ? await incrementSticker(id) : await decrementSticker(id);
    applyInventory(s, res.inventory);
    refreshCurrent();
  } catch (err) { state.ctx.showToast(err.message || 'Erro ao atualizar'); }
}

async function mutateReserve(id, delta) {
  const s = localSticker(id);
  if (!s) return;
  const target = Math.max(0, (s.reservedForTrade || 0) + delta);
  try {
    const res = await reserveSticker(id, target);
    applyInventory(s, res.inventory);
    render();
  } catch (err) { state.ctx.showToast(err.message || 'Erro ao reservar'); }
}

function applyInventory(s, inv) {
  if (!inv) return;
  s.quantity = inv.quantity;
  s.reservedForTrade = inv.reserved_for_trade;
  s.owned = inv.quantity >= 1;
  s.duplicates = Math.max(inv.quantity - 1, 0);
}

function refreshCurrent() {
  if (state.subtab === 'collection') {
    // Atualiza apenas a célula afetada quando possível, senão re-render.
    render();
  } else {
    render();
  }
}

async function applyBulk() {
  const input = container.querySelector('#stk-bulk-input');
  if (!input) return;
  const codes = input.value.split(/[\s,;\n]+/).map((c) => c.trim()).filter(Boolean);
  if (!codes.length) { state.ctx.showToast('Informe ao menos um número'); return; }
  try {
    const res = await bulkUpdate(codes, { mode: 'increment', quantity: 1 });
    await loadAlbum(true);
    render();
    let msg = `${res.appliedCount} figurinha(s) adicionada(s)`;
    if (res.notFound?.length) msg += ` · ${res.notFound.length} código(s) inválido(s)`;
    state.ctx.showToast(msg);
  } catch (err) { state.ctx.showToast(err.message || 'Erro no lançamento'); }
}

function listFor(kind) {
  if (kind === 'duplicates') {
    return state.stickers.filter((s) => (s.duplicates || 0) > 0).sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return state.stickers.filter((s) => !s.owned).sort((a, b) => a.sortOrder - b.sortOrder);
}

function copyList(kind, format) {
  const items = listFor(kind);
  if (!items.length) { state.ctx.showToast('Lista vazia'); return; }
  let text;
  if (format === 'whatsapp') {
    const title = kind === 'duplicates' ? '♻️ Repetidas' : '🔻 Faltam';
    const lines = items.map((s) => `#${s.code}${kind === 'duplicates' ? ` (x${s.duplicates})` : ''} - ${s.title}`);
    text = `${title} (${state.album?.name || 'Álbum Copa 2026'})\n${lines.join('\n')}\nTotal: ${items.length}`;
  } else {
    text = items.map((s) => s.code).join(', ');
  }
  copyToClipboard(text);
}

function exportCsv(kind) {
  const items = listFor(kind);
  if (!items.length) { state.ctx.showToast('Lista vazia'); return; }
  const header = 'codigo,titulo,categoria,selecao,pagina,quantidade,repetidas';
  const rows = items.map((s) => [
    s.code, csvCell(s.title), csvCell(CATEGORY_LABEL[s.category] || s.category),
    csvCell(s.teamName || ''), s.page, s.quantity, s.duplicates,
  ].join(','));
  const blob = new Blob([`${header}\n${rows.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `figurinhas-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  state.ctx.showToast('CSV exportado');
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => state.ctx.showToast('Copiado para a área de transferência'),
      () => fallbackCopy(text)
    );
  } else {
    fallbackCopy(text);
  }
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); state.ctx.showToast('Copiado'); } catch { state.ctx.showToast('Não foi possível copiar'); }
  document.body.removeChild(ta);
}

/* ---------------- Trocas: ações ---------------- */

async function refreshTrades() {
  try {
    const [sug, offers, history] = await Promise.all([
      fetchTradeSuggestions(), fetchTradeOffers(), fetchTradeHistory(),
    ]);
    state.suggestions = sug.items || [];
    state.offers = { incoming: offers.incoming || [], outgoing: offers.outgoing || [] };
    state.history = history.items || [];
  } catch (err) {
    state.suggestions = [];
    state.ctx.showToast(err.message || 'Erro ao carregar trocas');
  }
}

async function proposeTrade(userId) {
  const sug = (state.suggestions || []).find((u) => u.userId === userId);
  if (!sug) return;
  try {
    await createTradeOffer({
      toUserId: userId,
      offerStickerIds: sug.iOffer.map((s) => s.stickerId),
      requestStickerIds: sug.theyOffer.map((s) => s.stickerId),
      message: 'Proposta gerada pelas sugestões do álbum.',
    });
    state.ctx.showToast('Oferta enviada');
    await refreshTrades();
    render();
  } catch (err) { state.ctx.showToast(err.message || 'Erro ao criar oferta'); }
}

async function actOffer(id, status) {
  try {
    await patchTradeOffer(id, status);
    state.ctx.showToast(`Oferta ${statusLabel(status).toLowerCase()}`);
    await refreshTrades();
    render();
  } catch (err) { state.ctx.showToast(err.message || 'Erro ao atualizar oferta'); }
}
