/**
 * UI do modo Bolão — área autenticada.
 */
import {
  fetchMyPools, checkPoolName, fetchPoolMatchesMeta, createPool, fetchPool, updatePool, deletePool,
  joinPool, fetchPoolPredictions, savePrediction, fetchPoolRanking, fetchPoolRules,
  createPoolInvite, fetchPoolInvites, searchPoolInviteUsers, fetchParticipantDetail,
  fetchMyInvites, respondToInvite, fetchPoolCreators, fetchPoolsByCreator,
  POOL_DISCLAIMER, statusLabel, visibilityLabel, inviteStatusLabel, formatDate, formatDateShort,
} from './pool-client.js?v=23';
import { esc, matchTeamsHTML } from './pool-match-display.js?v=22';

const state = {
  screen: 'list',
  poolId: null,
  tab: 'predictions',
  rankingPage: 1,
  pools: [],
  poolDetail: null,
  matchesMeta: [],
  ranking: null,
  createDraft: null,
  adminCreatorId: null,
  adminCreatorName: null,
  adminView: false,
  detailReturn: 'list',
};

let teamMap = {};
let currentUser = null;
let showToastFn = () => {};
let poolContainer = null;

function matchWhenHTML(row) {
  const date = formatDateShort(row.date ?? row.match_date);
  const time = row.time ?? row.match_time?.slice?.(0, 5) ?? '';
  if (date === '—') return '';
  return `<span class="pool-pred-row__when">${esc(`${date}${time ? ` ${time}` : ''}`)}</span>`;
}

function matchMetaHTML(row) {
  const parts = [];
  if (row.group) parts.push(`Grupo ${row.group}`);
  if (row.phase && row.phase !== 'group') parts.push(row.phase.toUpperCase());
  const date = formatDateShort(row.date ?? row.match_date);
  const time = row.time ?? row.match_time?.slice?.(0, 5) ?? '';
  if (date !== '—') parts.push(`${date}${time ? ` ${time}` : ''}`);
  return parts.length ? `<small class="pool-match-meta">${esc(parts.join(' · '))}</small>` : '';
}

function poolOpts() {
  return { teamMap, showToast: showToastFn, currentUser };
}

function disclaimerHTML() {
  return `<div class="pool-disclaimer" role="note">
    <strong>⚠ Recreativo:</strong> ${POOL_DISCLAIMER}
  </div>`;
}

function poolTabsHTML(active) {
  const tabs = [
    ['list', 'Meus bolões'],
    ['create', 'Criar bolão'],
    ['public', 'Ranking público'],
  ];
  if (currentUser?.role === 'admin') tabs.push(['admin', 'Administração']);
  const activeAdmin = active === 'admin' || active === 'adminCreator';
  return `<nav class="pool-tabs" aria-label="Bolão">
    ${tabs.map(([id, label]) => {
      const isActive = id === 'admin' ? activeAdmin : active === id;
      return `<button type="button" class="pool-tab ${isActive ? 'active' : ''}" data-pool-nav="${id}">${label}</button>`;
    }).join('')}
  </nav>`;
}

function detailTabsHTML(active, isCreator) {
  const tabs = state.adminView
    ? [['ranking', 'Ranking'], ['rules', 'Regras']]
    : [
        ['predictions', 'Palpites'],
        ['ranking', 'Ranking'],
        ['rules', 'Regras'],
        ['invites', 'Convites'],
      ];
  if (!state.adminView && isCreator) tabs.push(['settings', 'Configurações']);
  return `<nav class="pool-subtabs" aria-label="Detalhes do bolão">
    ${tabs.map(([id, label]) =>
      `<button type="button" class="pool-subtab ${active === id ? 'active' : ''}" data-pool-tab="${id}">${label}</button>`
    ).join('')}
  </nav>`;
}

function statusBadge(status) {
  return `<span class="badge badge--pool badge--${status}">${statusLabel(status)}</span>`;
}

function paginationHTML(page, total, limit, attr) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return '';
  return `<div class="pool-pagination">
    <button type="button" class="btn btn--ghost btn--sm" data-${attr}-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Anterior</button>
    <span>Página ${page} de ${pages}</span>
    <button type="button" class="btn btn--ghost btn--sm" data-${attr}-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Próxima →</button>
  </div>`;
}

async function openParticipantModal(participantId) {
  const modal = document.getElementById('pool-participant-modal');
  const body = document.getElementById('pool-participant-modal-body');
  const title = document.getElementById('pool-participant-modal-title');
  if (!modal) return;

  body.innerHTML = '<div class="pool-loading">Carregando...</div>';
  modal.showModal();

  try {
    const detail = await fetchParticipantDetail(state.poolId, participantId);
    const p = detail.participant;
    title.textContent = p.name;
    body.innerHTML = `
      <div class="pool-participant-summary">
        <p><strong>${p.totalPoints}</strong> pontos · ${p.exactHits} exatos · ${p.resultHits} resultados · #${p.rankPosition ?? '—'}</p>
        <p class="text-muted">Aderiu em ${formatDate(p.joinedAt)}</p>
      </div>
      <h4>Palpites</h4>
      ${detail.predictions.length ? `
        <table class="pool-table">
          <thead><tr><th>Jogo</th><th>Palpite</th><th>Pts</th></tr></thead>
          <tbody>${detail.predictions.map((pr) => `<tr>
            <td>${matchTeamsHTML(pr, teamMap, true)}</td>
            <td>${pr.homeScore} × ${pr.awayScore}</td>
            <td>${pr.pointsEarned ?? '—'}</td>
          </tr>`).join('')}</tbody>
        </table>` : '<p class="pool-empty">Sem palpites.</p>'}`;
  } catch (err) {
    body.innerHTML = `<p class="pool-empty">${esc(err.message)}</p>`;
  }
}

async function renderList(container) {
  container.innerHTML = `${disclaimerHTML()}${poolTabsHTML('list')}
    <div class="pool-loading">Carregando bolões...</div>`;
  try {
    const [data, invitesData] = await Promise.all([
      fetchMyPools(),
      fetchMyInvites().catch(() => ({ items: [] })),
    ]);
    state.pools = data.items ?? [];
    const invites = invitesData.items ?? [];

    let invitesHTML = '';
    if (invites.length) {
      invitesHTML = `<section class="card pool-invites-pending">
        <h3>Convites pendentes</h3>
        <ul>${invites.map((i) => `<li>
          <span><strong>${esc(i.pool_name)}</strong> — convite para participar</span>
          <button type="button" class="btn btn--sm btn--primary" data-accept-invite="${i.id}">Aceitar</button>
          <button type="button" class="btn btn--sm btn--ghost" data-decline-invite="${i.id}">Recusar</button>
        </li>`).join('')}</ul>
      </section>`;
    }

    if (!state.pools.length) {
      container.innerHTML = `${disclaimerHTML()}${poolTabsHTML('list')}${invitesHTML}
        <div class="pool-empty">
          <h2>Nenhum bolão ainda</h2>
          <p>Crie um bolão ou aceite um convite.</p>
          <button type="button" class="btn btn--primary" data-pool-nav="create">Criar bolão</button>
        </div>`;
      return;
    }

    container.innerHTML = `${disclaimerHTML()}${poolTabsHTML('list')}${invitesHTML}
      <div class="pool-grid">
        ${state.pools.map((p) => `
          <article class="pool-card">
            <div class="pool-card__head">
              <h3>${esc(p.name)}</h3>
              ${statusBadge(p.status)}
            </div>
            <p class="pool-card__meta">${visibilityLabel(p.visibility)} · Criador: ${esc(p.creatorName ?? '—')} · ${p.participantCount ?? 0} participantes · ${p.matchCount ?? 0} jogos</p>
            ${p.description ? `<p class="pool-card__desc">${esc(p.description)}</p>` : ''}
            <div class="pool-card__actions">
              <button type="button" class="btn btn--ghost btn--sm" data-open-pool="${p.id}">Abrir</button>
              ${currentUser && p.creatorId === currentUser.id
                ? `<button type="button" class="btn btn--ghost btn--sm btn--danger" data-delete-pool="${p.id}">Excluir</button>`
                : ''}
            </div>
          </article>
        `).join('')}
      </div>`;
  } catch (err) {
    container.innerHTML = `${disclaimerHTML()}${poolTabsHTML('list')}
      <div class="pool-empty"><p>${esc(err.message)}</p></div>`;
  }
}

let createRenderGen = 0;

function readCreateDraft(form) {
  if (!form) return null;
  const fd = new FormData(form);
  return {
    name: String(fd.get('name') ?? ''),
    description: String(fd.get('description') ?? ''),
    visibility: String(fd.get('visibility') ?? 'private'),
    allowPublicListing: fd.get('allowPublicListing') === 'on',
    matchIds: fd.getAll('matchIds').map(String),
  };
}

function applyCreateDraft(form, draft) {
  if (!form || !draft) return;
  const nameInput = form.querySelector('input[name="name"]');
  if (nameInput) nameInput.value = draft.name ?? '';
  const descInput = form.querySelector('textarea[name="description"]');
  if (descInput) descInput.value = draft.description ?? '';
  const visInput = form.querySelector('select[name="visibility"]');
  if (visInput && draft.visibility) visInput.value = draft.visibility;
  const listInput = form.querySelector('input[name="allowPublicListing"]');
  if (listInput) listInput.checked = Boolean(draft.allowPublicListing);
  form.querySelectorAll('input[name="matchIds"]').forEach((cb) => {
    cb.checked = draft.matchIds?.includes(cb.value) ?? false;
  });
}

function bindCreateDraft(form) {
  if (!form) return;
  const save = () => {
    state.createDraft = readCreateDraft(form);
  };
  form.addEventListener('input', save);
  form.addEventListener('change', save);
}

async function renderCreate(container) {
  const gen = ++createRenderGen;
  const existingForm = container.querySelector('#pool-create-form');
  if (existingForm) {
    state.createDraft = readCreateDraft(existingForm);
  }

  if (!state.matchesMeta.length) {
    container.innerHTML = `${disclaimerHTML()}${poolTabsHTML('create')}
      <div class="pool-loading">Carregando partidas elegíveis...</div>`;
  }

  let meta;
  try {
    if (state.matchesMeta.length) {
      meta = { items: state.matchesMeta, creator: { name: currentUser?.name } };
    } else {
      meta = await fetchPoolMatchesMeta();
      if (gen !== createRenderGen) return;
      state.matchesMeta = meta.items ?? [];
    }
  } catch (err) {
    if (gen !== createRenderGen) return;
    container.innerHTML = `${disclaimerHTML()}<p class="pool-empty">${esc(err.message)}</p>`;
    return;
  }

  if (gen !== createRenderGen) return;

  const creatorName = meta.creator?.name ?? currentUser?.name ?? '—';
  const matches = state.matchesMeta;

  container.innerHTML = `${disclaimerHTML()}${poolTabsHTML('create')}
    <form id="pool-create-form" class="pool-form card">
      <h2>Criar bolão</h2>
      <p class="pool-form__hint">Crie o bolão até 1 hora antes da primeira partida. Horários em Brasília (BRT).</p>
      <div class="pool-form__creator">
        <span class="pool-form__creator-label">Criador do bolão</span>
        <strong>${esc(creatorName)}</strong>
      </div>
      <label>Nome do bolão *
        <input type="text" name="name" required minlength="3" maxlength="120" placeholder="Ex: Bolão da Firma" />
        <span class="field-hint" id="name-check-hint"></span>
      </label>
      <label>Descrição<textarea name="description" rows="2" placeholder="Opcional"></textarea></label>
      <label>Visibilidade
        <select name="visibility">
          <option value="private">Privado (somente convidados)</option>
          <option value="link">Por link de convite</option>
          <option value="public">Público (listagem aberta)</option>
        </select>
      </label>
      <label class="pool-check">
        <input type="checkbox" name="allowPublicListing" /> Listar na página pública de rankings
      </label>
      <fieldset class="pool-matches-select">
        <legend>Partidas do bolão *</legend>
        <p class="pool-form__hint">${esc(meta.filterNote ?? 'Jogos agendados com início em pelo menos 1 hora (BRT)')}</p>
        ${matches.length ? `<div class="pool-matches-list">
          ${matches.map((m) => `
            <label class="pool-match-check">
              <input type="checkbox" name="matchIds" value="${m.id}" />
              <span class="pool-match-check__body">
                ${matchTeamsHTML(m, teamMap)}
                ${matchMetaHTML(m)}
              </span>
            </label>
          `).join('')}
        </div>` : '<p class="pool-empty">Nenhuma partida elegível no momento. Só aparecem jogos agendados com início em pelo menos 1 hora.</p>'}
      </fieldset>
      <p class="auth-form__error" id="pool-create-error" hidden></p>
      <button type="submit" class="btn btn--primary" ${matches.length ? '' : 'disabled'}>Criar bolão</button>
    </form>`;

  const form = container.querySelector('#pool-create-form');
  applyCreateDraft(form, state.createDraft);
  bindCreateDraft(form);
  bindNameCheck(container.querySelector('input[name="name"]'), container.querySelector('#name-check-hint'));
}

function bindNameCheck(nameInput, hintEl, excludeId = null) {
  if (!nameInput) return;
  let nameTimer;
  nameInput.addEventListener('input', () => {
    clearTimeout(nameTimer);
    nameTimer = setTimeout(async () => {
      if (!nameInput.value.trim() || nameInput.value.length < 3) {
        hintEl.textContent = '';
        return;
      }
      try {
        const r = await checkPoolName(nameInput.value.trim(), excludeId);
        hintEl.textContent = r.available ? '✓ Nome disponível' : '✗ Nome de bolão já existente';
        hintEl.className = `field-hint ${r.available ? 'ok' : 'err'}`;
      } catch { hintEl.textContent = ''; }
    }, 400);
  });
}

async function renderDetail(container) {
  if (!state.poolId) return renderList(container);
  try {
    const data = await fetchPool(state.poolId);
    state.poolDetail = data;
  } catch (err) {
    showToastFn(err.message);
    return renderList(container);
  }

  const p = state.poolDetail?.pool;
  if (!p?.id) {
    showToastFn('Bolão não encontrado');
    return renderList(container);
  }
  const isCreator = currentUser && p.creatorId === currentUser.id;

  if (state.adminView && !['ranking', 'rules'].includes(state.tab)) {
    state.tab = 'ranking';
  }

  const backLabel = state.adminView ? '← Bolões do criador' : '← Voltar';

  container.innerHTML = `${disclaimerHTML()}
    <div class="pool-detail-head">
      <button type="button" class="btn btn--ghost btn--sm" data-pool-back>${backLabel}</button>
      <div>
        <h2>${esc(p.name)} ${statusBadge(p.status)}${state.adminView ? ' <span class="badge badge--pool">Visão admin</span>' : ''}</h2>
        <p class="pool-detail__meta">${visibilityLabel(p.visibility)} · Criador: ${esc(p.creatorName ?? '—')} · ${p.participantCount} participantes · Adesão até ${formatDate(p.joinDeadline)}</p>
        ${p.visibility === 'link' && p.inviteToken && isCreator
          ? `<p class="pool-share-link"><small>Link do bolão na aba <strong>Convites</strong></small></p>` : ''}
      </div>
    </div>
    ${detailTabsHTML(state.tab, isCreator)}
    <div id="pool-detail-body" class="pool-detail-body"></div>`;

  const body = container.querySelector('#pool-detail-body');
  if (state.tab === 'predictions') await renderPredictions(body);
  else if (state.tab === 'ranking') await renderRanking(body);
  else if (state.tab === 'rules') await renderRules(body);
  else if (state.tab === 'invites') await renderInvites(body);
  else if (state.tab === 'settings') await renderSettings(body, p, isCreator);
}

async function renderAdminCreators(container) {
  container.innerHTML = `${disclaimerHTML()}${poolTabsHTML('admin')}
    <div class="pool-loading">Carregando criadores...</div>`;
  try {
    const data = await fetchPoolCreators();
    const items = data.items ?? [];
    if (!items.length) {
      container.innerHTML = `${disclaimerHTML()}${poolTabsHTML('admin')}
        <div class="pool-empty"><p>Nenhum bolão foi criado ainda.</p></div>`;
      return;
    }
    container.innerHTML = `${disclaimerHTML()}${poolTabsHTML('admin')}
      <section class="pool-admin">
        <h2>Bolões por criador</h2>
        <p class="pool-form__hint">Clique em um criador para ver todos os bolões dele e acompanhar ranking e palpites.</p>
        <div class="pool-grid">
          ${items.map((c) => `
            <article class="pool-card pool-creator-card" data-admin-creator="${c.id}" data-admin-creator-name="${esc(c.name)}" role="button" tabindex="0">
              <div class="pool-card__head"><h3>${esc(c.name)}</h3></div>
              <p class="pool-card__meta">${esc(c.email ?? '')}</p>
              <p class="pool-creator-card__stats">
                <span><strong>${c.poolCount}</strong> bolão(ões)</span>
                <span><strong>${c.participantTotal}</strong> participações</span>
              </p>
              <p class="pool-card__meta">Última atividade: ${formatDate(c.lastActivity)}</p>
            </article>
          `).join('')}
        </div>
      </section>`;
  } catch (err) {
    container.innerHTML = `${disclaimerHTML()}${poolTabsHTML('admin')}
      <div class="pool-empty"><p>${esc(err.message)}</p></div>`;
  }
}

async function renderAdminCreatorPools(container) {
  const header = `<div class="pool-detail-head">
    <button type="button" class="btn btn--ghost btn--sm" data-admin-back>← Criadores</button>
    <div><h2>Bolões de ${esc(state.adminCreatorName ?? '')}</h2></div>
  </div>`;
  container.innerHTML = `${disclaimerHTML()}${poolTabsHTML('adminCreator')}${header}
    <div class="pool-loading">Carregando bolões...</div>`;
  try {
    const data = await fetchPoolsByCreator(state.adminCreatorId);
    const items = data.items ?? [];
    if (!items.length) {
      container.innerHTML = `${disclaimerHTML()}${poolTabsHTML('adminCreator')}${header}
        <div class="pool-empty"><p>Este criador não tem bolões.</p></div>`;
      return;
    }
    container.innerHTML = `${disclaimerHTML()}${poolTabsHTML('adminCreator')}${header}
      <div class="pool-grid">
        ${items.map((p) => `
          <article class="pool-card">
            <div class="pool-card__head"><h3>${esc(p.name)}</h3>${statusBadge(p.status)}</div>
            <p class="pool-card__meta">${visibilityLabel(p.visibility)} · ${p.participantCount ?? 0} participantes · ${p.matchCount ?? 0} jogos</p>
            ${p.description ? `<p class="pool-card__desc">${esc(p.description)}</p>` : ''}
            <div class="pool-card__actions">
              <button type="button" class="btn btn--ghost btn--sm" data-admin-open-pool="${p.id}">Acompanhar</button>
            </div>
          </article>
        `).join('')}
      </div>`;
  } catch (err) {
    container.innerHTML = `${disclaimerHTML()}${poolTabsHTML('adminCreator')}${header}
      <div class="pool-empty"><p>${esc(err.message)}</p></div>`;
  }
}

async function renderSettings(container, pool, isCreator) {
  if (!isCreator) {
    container.innerHTML = '<div class="pool-empty">Somente o criador pode editar.</div>';
    return;
  }
  if (['closed', 'archived'].includes(pool.status)) {
    container.innerHTML = '<div class="pool-empty">Bolão encerrado — edição não permitida.</div>';
    return;
  }

  container.innerHTML = `
    <form id="pool-edit-form" class="pool-form card">
      <h3>Editar bolão</h3>
      <p class="pool-form__hint">Partidas não podem ser alteradas após o bolão iniciar.</p>
      <label>Nome *
        <input type="text" name="name" required minlength="3" maxlength="120" value="${esc(pool.name)}" />
        <span class="field-hint" id="edit-name-hint"></span>
      </label>
      <label>Descrição<textarea name="description" rows="2">${esc(pool.description ?? '')}</textarea></label>
      <label>Visibilidade
        <select name="visibility">
          <option value="private" ${pool.visibility === 'private' ? 'selected' : ''}>Privado</option>
          <option value="link" ${pool.visibility === 'link' ? 'selected' : ''}>Por link</option>
          <option value="public" ${pool.visibility === 'public' ? 'selected' : ''}>Público</option>
        </select>
      </label>
      <label class="pool-check">
        <input type="checkbox" name="allowPublicListing" ${pool.allowPublicListing ? 'checked' : ''} />
        Listar na página pública
      </label>
      <label class="pool-check">
        <input type="checkbox" name="showParticipants" ${pool.showParticipants !== false ? 'checked' : ''} />
        Exibir nomes dos participantes publicamente
      </label>
      <label>Status
        <select name="status">
          <option value="open" ${pool.status === 'open' ? 'selected' : ''}>Aberto</option>
          <option value="draft" ${pool.status === 'draft' ? 'selected' : ''}>Rascunho</option>
          <option value="archived" ${pool.status === 'archived' ? 'selected' : ''}>Arquivado</option>
        </select>
      </label>
      <p class="auth-form__error" id="pool-edit-error" hidden></p>
      <button type="submit" class="btn btn--primary">Salvar alterações</button>
    </form>`;

  bindNameCheck(
    container.querySelector('input[name="name"]'),
    container.querySelector('#edit-name-hint'),
    pool.id
  );
}

async function renderPredictions(container) {
  container.innerHTML = '<div class="pool-loading">Carregando palpites...</div>';
  try {
    const data = await fetchPoolPredictions(state.poolId);
    const items = data.items ?? [];
    if (!items.length) {
      container.innerHTML = '<div class="pool-empty">Nenhuma partida neste bolão.</div>';
      return;
    }
    const editable = items.filter((r) => r.canEdit);
    container.innerHTML = `
      <form id="pool-predictions-form" class="pool-predictions-form">
        <div class="pool-pred-list">
          <div class="pool-pred-row pool-pred-row--head" aria-hidden="true">
            <span class="pool-pred-row__teams">Jogo</span>
            <span class="pool-pred-row__when">Data</span>
            <span class="pool-pred-row__palpite">Palpite</span>
            <span class="pool-pred-row__col">Resultado</span>
            <span class="pool-pred-row__pts">Pts</span>
          </div>
          ${items.map((row) => {
            const pred = row.prediction;
            const actual = row.actual;
            const pts = pred?.pointsEarned ?? '—';
            const predText = pred ? `${pred.homeScore}×${pred.awayScore}` : '—';
            const actualText = actual?.homeScore != null ? `${actual.homeScore}×${actual.awayScore}` : '—';
            const palpiteCell = row.canEdit
              ? `<div class="pool-pred-inputs" data-match-id="${row.matchId}">
                   <input type="number" min="0" max="20" value="${pred?.homeScore ?? ''}" name="home" inputmode="numeric" aria-label="Gols mandante" />
                   <span class="pool-pred-form__sep">×</span>
                   <input type="number" min="0" max="20" value="${pred?.awayScore ?? ''}" name="away" inputmode="numeric" aria-label="Gols visitante" />
                 </div>`
              : `<span class="pool-pred-row__saved" title="${esc(row.editBlockedReason ?? '')}">${predText}${row.editBlockedReason ? ' 🔒' : ''}</span>`;
            return `<div class="pool-pred-row">
              <div class="pool-pred-row__teams">${matchTeamsHTML(row, teamMap, true)}</div>
              ${matchWhenHTML(row) || '<span class="pool-pred-row__when">—</span>'}
              <div class="pool-pred-row__palpite">${palpiteCell}</div>
              <span class="pool-pred-row__col">${actualText}</span>
              <span class="pool-pred-row__pts">${pts}</span>
            </div>`;
          }).join('')}
        </div>
        ${editable.length
          ? `<div class="pool-predictions-footer">
              <button type="submit" class="btn btn--primary" id="pool-predictions-save-btn">Salvar palpites</button>
              <span class="pool-predictions-footer__hint">${editable.length} jogo(s) editável(is)</span>
            </div>`
          : ''}
      </form>`;
  } catch (err) {
    container.innerHTML = `<div class="pool-empty">${esc(err.message)}</div>`;
  }
}

async function renderRanking(container) {
  container.innerHTML = '<div class="pool-loading">Carregando ranking...</div>';
  try {
    const data = await fetchPoolRanking(state.poolId, state.rankingPage);
    state.ranking = data;
    const items = data.items ?? [];
    container.innerHTML = `
      <p class="pool-ranking-meta">Atualizado: ${formatDate(data.updatedAt)} · ${data.total} participantes</p>
      <table class="pool-table pool-table--ranking">
        <thead><tr>
          <th>#</th><th>Participante</th><th>Pts</th><th>Exatos</th><th>Resultados</th><th>Palpites</th>
        </tr></thead>
        <tbody>
          ${items.map((r) => `<tr>
            <td>${r.rank ?? '—'}</td>
            <td><button type="button" class="link-btn" data-participant="${r.participantId}">${esc(r.name)}</button></td>
            <td><strong>${r.totalPoints}</strong></td>
            <td>${r.exactHits}</td>
            <td>${r.resultHits}</td>
            <td>${r.predictionsCount}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      ${paginationHTML(data.page, data.total, data.limit, 'ranking')}`;
  } catch (err) {
    container.innerHTML = `<div class="pool-empty">${esc(err.message)}</div>`;
  }
}

async function renderRules(container) {
  try {
    const data = state.poolDetail?.rulesHtml
      ? { rulesHtml: state.poolDetail.rulesHtml }
      : await fetchPoolRules(state.poolId);
    container.innerHTML = `<div class="pool-rules card">${data.rulesHtml ?? ''}</div>`;
  } catch (err) {
    container.innerHTML = `<div class="pool-empty">${esc(err.message)}</div>`;
  }
}

async function renderInvites(container) {
  const pool = state.poolDetail?.pool;
  const isCreator = currentUser && pool?.creatorId === currentUser.id;
  const isPrivate = pool?.visibility === 'private';
  const isLink = pool?.visibility === 'link';
  const mainLink = isLink && pool?.inviteToken
    ? `${location.origin}/boloes?join=${pool.inviteToken}`
    : null;

  const linkPoolHTML = isCreator && isLink && mainLink
    ? `<section class="card pool-share-link-card">
        <h3>Link principal do bolão</h3>
        <p class="pool-form__hint">Compartilhe este link com quantas pessoas quiser — ele não expira.</p>
        <p class="pool-main-link"><code>${esc(mainLink)}</code></p>
        <button type="button" class="btn btn--primary btn--sm" data-copy-link="${esc(mainLink)}">Copiar link</button>
      </section>
      <section class="pool-invite-link-section">
        <h4>Link adicional (opcional)</h4>
        <p class="pool-form__hint">Gera outro link válido por 7 dias — aparece na lista abaixo.</p>
        <button type="button" class="btn btn--ghost btn--sm" id="pool-new-invite">Gerar link adicional</button>
      </section>`
    : '';

  const privateInviteHTML = isCreator && isPrivate
    ? `<section class="card pool-invite-user">
        <h3>Convidar usuário cadastrado</h3>
        <p class="pool-form__hint">Busque por nome ou e-mail. A pessoa verá o convite ao entrar no site (sem e-mail automático).</p>
        <div class="pool-invite-search">
          <input type="search" id="pool-invite-user-q" class="pool-invite-search__input"
            placeholder="Digite nome ou e-mail..." autocomplete="off" />
          <p class="pool-form__hint pool-invite-search__hint" id="pool-invite-user-hint">
            Digite pelo menos 2 caracteres para buscar.
          </p>
          <ul id="pool-invite-user-results" class="pool-invite-search-results" hidden></ul>
        </div>
      </section>
      <section class="pool-invite-link-section">
        <h4>Link aberto (opcional)</h4>
        <p class="pool-form__hint">Qualquer pessoa com o link pode entrar, mesmo sem convite nominal.</p>
        <button type="button" class="btn btn--ghost btn--sm" id="pool-new-invite">Gerar link de convite</button>
      </section>`
    : isCreator && !isLink
      ? '<button type="button" class="btn btn--primary btn--sm" id="pool-new-invite">Gerar link de convite</button>'
      : '';

  const extraInvitesHeading = isLink
    ? '<h3 class="pool-invites__heading">Links adicionais gerados</h3>'
    : '<h3 class="pool-invites__heading">Convites enviados</h3>';

  container.innerHTML = `
    <div class="pool-invites">
      ${linkPoolHTML}${privateInviteHTML}
      ${extraInvitesHeading}
      <div id="pool-invites-list" class="pool-loading">Carregando...</div>
    </div>`;

  if (!isCreator) {
    document.getElementById('pool-invites-list').innerHTML =
      '<p class="pool-empty">Somente o criador gerencia convites.</p>';
    return;
  }

  if (isPrivate) bindInviteUserSearch(container);

  await renderInvitesList(isLink);
}

async function renderInvitesList(isLinkPool = false) {
  const list = document.getElementById('pool-invites-list');
  if (!list) return;
  try {
    const data = await fetchPoolInvites(state.poolId);
    const items = data.items ?? [];
    list.innerHTML = items.length
      ? `<ul class="pool-invite-list">${items.map((i) => {
          const token = i.inviteToken ?? i.invite_token;
          const link = token ? `${location.origin}/boloes?join=${token}` : '—';
          const inviteeId = i.inviteeUserId ?? i.invitee_user_id;
          const inviteeName = i.inviteeName ?? i.invitee_name;
          const inviteeEmail = i.inviteeEmail ?? i.invitee_email;
          const expiresAt = i.expiresAt ?? i.expires_at;
          const label = inviteeId
            ? `${esc(inviteeName ?? 'Usuário')} (${esc(inviteeEmail ?? '')})`
            : 'Link aberto';
          const typeBadge = inviteeId
            ? '<span class="badge badge--pool">Nominal</span>'
            : '<span class="badge">Link</span>';
          return `<li>
            ${typeBadge}
            <span class="badge badge--pool">${inviteStatusLabel(i.status)}</span>
            ${label}
            ${token && i.status === 'pending'
              ? `<button type="button" class="btn btn--ghost btn--sm" data-copy-link="${esc(link)}">Copiar link</button>`
              : ''}
            <small>Expira ${formatDate(expiresAt)}</small>
          </li>`;
        }).join('')}</ul>`
      : `<p class="pool-empty">${isLinkPool
        ? 'Nenhum link adicional. Use o link principal acima para convidar.'
        : 'Nenhum convite ainda. Busque um usuário acima ou gere um link.'}</p>`;
  } catch (err) {
    list.innerHTML = `<p class="pool-empty">${esc(err.message)}</p>`;
  }
}

let inviteSearchGen = 0;

async function resolveCreatedPoolId(data, poolName) {
  const direct = data?.pool?.id ?? data?.poolId;
  if (direct) return direct;
  try {
    const list = await fetchMyPools();
    const found = (list.items ?? []).find((p) => p.name === poolName);
    return found?.id ?? null;
  } catch {
    return null;
  }
}

function bindInviteUserSearch(container) {
  const input = container.querySelector('#pool-invite-user-q');
  const results = container.querySelector('#pool-invite-user-results');
  const hint = container.querySelector('#pool-invite-user-hint');
  if (!input || !results) return;

  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) {
      results.hidden = true;
      results.innerHTML = '';
      hint.textContent = 'Digite pelo menos 2 caracteres para buscar.';
      return;
    }
    const gen = ++inviteSearchGen;
    hint.textContent = 'Buscando...';
    timer = setTimeout(async () => {
      try {
        const data = await searchPoolInviteUsers(state.poolId, q);
        if (gen !== inviteSearchGen) return;
        const items = data.items ?? [];
        if (!items.length) {
          results.hidden = true;
          hint.textContent = 'Nenhum usuário encontrado (ou já convidado/participando).';
          return;
        }
        hint.textContent = `${items.length} resultado(s)`;
        results.innerHTML = items.map((u) => `
          <li>
            <span class="pool-invite-search-results__user">
              <strong>${esc(u.name)}</strong>
              <small>${esc(u.email)}</small>
            </span>
            <button type="button" class="btn btn--primary btn--sm" data-invite-user="${u.id}">Convidar</button>
          </li>`).join('');
        results.hidden = false;
      } catch (err) {
        if (gen !== inviteSearchGen) return;
        hint.textContent = err.message;
        results.hidden = true;
      }
    }, 350);
  });
}

async function renderPublicLink(container) {
  container.innerHTML = `${disclaimerHTML()}${poolTabsHTML('public')}
    <p>Rankings públicos em <a href="/boloes">Ranking dos Bolões</a> — sem login.</p>
    <a href="/boloes" class="btn btn--primary">Abrir ranking público</a>`;
}

export function updatePoolContext(opts = {}) {
  teamMap = opts.teamMap ?? teamMap;
  currentUser = opts.currentUser ?? currentUser;
  showToastFn = opts.showToast ?? showToastFn;
}

export async function renderPoolApp(container, opts = {}) {
  updatePoolContext(opts);
  poolContainer = container;

  if (state.screen === 'list') await renderList(container);
  else if (state.screen === 'create') await renderCreate(container);
  else if (state.screen === 'detail') await renderDetail(container);
  else if (state.screen === 'public') await renderPublicLink(container);
  else if (state.screen === 'admin') await renderAdminCreators(container);
  else if (state.screen === 'adminCreator') await renderAdminCreatorPools(container);
}

export function initPoolUI(container, opts = {}) {
  showToastFn = opts.showToast ?? (() => {});
  teamMap = opts.teamMap ?? {};
  currentUser = opts.currentUser ?? null;
  poolContainer = container;

  document.getElementById('pool-participant-modal-close')?.addEventListener('click', () => {
    document.getElementById('pool-participant-modal')?.close();
  });

  container.addEventListener('click', async (e) => {
    const nav = e.target.closest('[data-pool-nav]');
    if (nav) {
      if (state.screen === 'create') {
        const form = container.querySelector('#pool-create-form');
        if (form) state.createDraft = readCreateDraft(form);
      }
      state.screen = nav.dataset.poolNav;
      state.poolId = null;
      state.rankingPage = 1;
      state.adminView = false;
      await renderPoolApp(container, poolOpts());
      return;
    }

    const open = e.target.closest('[data-open-pool]');
    if (open) {
      state.screen = 'detail';
      state.poolId = Number(open.dataset.openPool);
      state.tab = 'predictions';
      state.rankingPage = 1;
      state.adminView = false;
      state.detailReturn = 'list';
      await renderPoolApp(container, poolOpts());
      return;
    }

    const adminCreator = e.target.closest('[data-admin-creator]');
    if (adminCreator) {
      state.screen = 'adminCreator';
      state.adminCreatorId = Number(adminCreator.dataset.adminCreator);
      state.adminCreatorName = adminCreator.dataset.adminCreatorName ?? '';
      await renderPoolApp(container, poolOpts());
      return;
    }

    const adminBack = e.target.closest('[data-admin-back]');
    if (adminBack) {
      state.screen = 'admin';
      await renderPoolApp(container, poolOpts());
      return;
    }

    const adminOpen = e.target.closest('[data-admin-open-pool]');
    if (adminOpen) {
      state.screen = 'detail';
      state.poolId = Number(adminOpen.dataset.adminOpenPool);
      state.tab = 'ranking';
      state.rankingPage = 1;
      state.adminView = true;
      state.detailReturn = 'adminCreator';
      await renderPoolApp(container, poolOpts());
      return;
    }

    const delPool = e.target.closest('[data-delete-pool]');
    if (delPool) {
      const poolId = Number(delPool.dataset.deletePool);
      const pool = state.pools.find((p) => p.id === poolId);
      if (!window.confirm(`Excluir o bolão "${pool?.name ?? ''}"? Todos os palpites e participantes serão removidos.`)) {
        return;
      }
      try {
        await deletePool(poolId);
        showToastFn('Bolão excluído');
        if (state.poolId === poolId) {
          state.poolId = null;
          state.screen = 'list';
        }
        await renderPoolApp(container, poolOpts());
      } catch (err) {
        showToastFn(err.message);
      }
      return;
    }

    const back = e.target.closest('[data-pool-back]');
    if (back) {
      state.screen = state.detailReturn === 'adminCreator' ? 'adminCreator' : 'list';
      state.adminView = false;
      if (state.screen !== 'adminCreator') state.poolId = null;
      await renderPoolApp(container, poolOpts());
      return;
    }

    const tab = e.target.closest('[data-pool-tab]');
    if (tab) {
      state.tab = tab.dataset.poolTab;
      await renderPoolApp(container, poolOpts());
      return;
    }

    const rankPage = e.target.closest('[data-ranking-page]');
    if (rankPage && !rankPage.disabled) {
      state.rankingPage = Number(rankPage.dataset.rankingPage);
      await renderDetail(container);
      return;
    }

    const participant = e.target.closest('[data-participant]');
    if (participant) {
      await openParticipantModal(Number(participant.dataset.participant));
      return;
    }

    const copyBtn = e.target.closest('[data-copy-link]');
    if (copyBtn) {
      try {
        await navigator.clipboard.writeText(copyBtn.dataset.copyLink);
        showToastFn('Link copiado!');
      } catch { showToastFn(copyBtn.dataset.copyLink); }
    }

    if (e.target.id === 'pool-new-invite') {
      try {
        await createPoolInvite(state.poolId, {});
        showToastFn('Link adicional gerado — copie na lista abaixo');
        state.tab = 'invites';
        await renderInvitesList(state.poolDetail?.pool?.visibility === 'link');
      } catch (err) { showToastFn(err.message); }
      return;
    }

    const inviteUserBtn = e.target.closest('[data-invite-user]');
    if (inviteUserBtn) {
      const userId = Number(inviteUserBtn.dataset.inviteUser);
      try {
        await createPoolInvite(state.poolId, { inviteeUserId: userId });
        showToastFn('Convite enviado — a pessoa verá ao entrar no site');
        await renderDetail(container);
      } catch (err) { showToastFn(err.message); }
      return;
    }

    const acceptInv = e.target.closest('[data-accept-invite]');
    if (acceptInv) {
      try {
        await respondToInvite(Number(acceptInv.dataset.acceptInvite), true);
        showToastFn('Convite aceito!');
        await renderList(container);
      } catch (err) { showToastFn(err.message); }
      return;
    }

    const declineInv = e.target.closest('[data-decline-invite]');
    if (declineInv) {
      try {
        await respondToInvite(Number(declineInv.dataset.declineInvite), false);
        showToastFn('Convite recusado');
        await renderList(container);
      } catch (err) { showToastFn(err.message); }
      return;
    }
  });

  container.addEventListener('submit', async (e) => {
    if (e.target.id === 'pool-create-form') {
      e.preventDefault();
      const fd = new FormData(e.target);
      const errEl = document.getElementById('pool-create-error');
      const submitBtn = e.target.querySelector('button[type="submit"]');
      errEl.hidden = true;
      if (submitBtn) submitBtn.disabled = true;
      try {
        const poolName = String(fd.get('name') ?? '').trim();
        const data = await createPool({
          name: poolName,
          description: fd.get('description'),
          visibility: fd.get('visibility'),
          allowPublicListing: fd.get('allowPublicListing') === 'on',
          matchIds: fd.getAll('matchIds'),
          status: 'open',
        });
        const poolId = await resolveCreatedPoolId(data, poolName);
        if (!poolId) {
          throw new Error('Bolão criado, mas não foi possível abrir. Veja em Meus bolões.');
        }
        showToastFn('Bolão criado!');
        state.createDraft = null;
        state.screen = 'detail';
        state.poolId = poolId;
        state.tab = 'predictions';
        await renderPoolApp(container, poolOpts());
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
      return;
    }

    if (e.target.id === 'pool-edit-form') {
      e.preventDefault();
      const fd = new FormData(e.target);
      const errEl = document.getElementById('pool-edit-error');
      errEl.hidden = true;
      try {
        await updatePool(state.poolId, {
          name: fd.get('name'),
          description: fd.get('description'),
          visibility: fd.get('visibility'),
          allowPublicListing: fd.get('allowPublicListing') === 'on',
          showParticipants: fd.get('showParticipants') === 'on',
          status: fd.get('status'),
        });
        showToastFn('Bolão atualizado');
        await renderDetail(container);
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      }
      return;
    }

    if (e.target.id === 'pool-predictions-form') {
      e.preventDefault();
      const rows = e.target.querySelectorAll('.pool-pred-inputs');
      const toSave = [];

      for (const row of rows) {
        const home = row.querySelector('[name="home"]')?.value ?? '';
        const away = row.querySelector('[name="away"]')?.value ?? '';
        if (home === '' && away === '') continue;
        if (home === '' || away === '') {
          showToastFn('Em cada jogo, preencha os dois placares ou deixe os dois vazios');
          return;
        }
        toSave.push({ matchId: row.dataset.matchId, home, away });
      }

      if (!toSave.length) {
        showToastFn('Nenhum palpite para salvar');
        return;
      }

      const btn = document.getElementById('pool-predictions-save-btn');
      if (btn) btn.disabled = true;

      try {
        await Promise.all(
          toSave.map((p) => savePrediction(state.poolId, p.matchId, p.home, p.away))
        );
        showToastFn(`${toSave.length} palpite(s) salvos`);
        await renderDetail(container);
      } catch (err) {
        showToastFn(err.message);
      } finally {
        if (btn) btn.disabled = false;
      }
      return;
    }
  });
}

export function resetPoolUI() {
  state.screen = 'list';
  state.poolId = null;
  state.tab = 'predictions';
  state.rankingPage = 1;
  state.createDraft = null;
  state.matchesMeta = [];
  state.adminCreatorId = null;
  state.adminCreatorName = null;
  state.adminView = false;
  state.detailReturn = 'list';
}

export function openPoolById(poolId, tab = 'predictions') {
  state.screen = 'detail';
  state.poolId = poolId;
  state.tab = tab;
  state.rankingPage = 1;
}
