/**
 * Renderização das views do dashboard.
 */
import { flagUrl } from './data-service.js';
import {
  computeGroupStandings, computeKPIs, aggregateStats, getNextMatch,
  getWinner, thirdPlaceRanking, filterMatches, teamStats, teamDetailedStats,
  teamGoalContributions,
  teamScorers, normalizeScorers,
  formatDate, formatDateShort, formatMatchTime, isToday, statusLabel, phaseLabel,
} from './engine.js';
import { groupProgress, isBracketProjected, getThirdPlaceBracketSlots } from './knockout-resolver.js';
import { matchKickoff } from './match-status.js';
import { renderKnockoutBracket } from './bracket-view.js';
import { buildPermissions } from './permissions.js';
import { teamShortLabelHTML } from './team-names.js';
import { renderTeamLineupInfographic, bindLineupPlayerTooltips } from './team-lineup.js';
import {
  isKnockoutPhase, formatMatchScore, readScoreEditor, scoreEditorKey, knockoutExtraFieldsHTML,
} from './match-score.js';

let onScoreSave = () => {};
let perms = buildPermissions(null, 'real');

export function setPermissions(user, mode) {
  perms = buildPermissions(user, mode);
  document.body.classList.toggle('read-only', perms.readOnly);
  document.body.classList.toggle('score-autosave', mode === 'simulation');
  document.body.dataset.userRole = perms.role;
}

export function getPermissions() {
  return perms;
}

export function setScoreSaveHandler(fn) {
  onScoreSave = fn;
}

export function updateModeUI(mode) {
  const subtitle = document.getElementById('mode-subtitle');
  document.querySelectorAll('.mode-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  if (mode === 'simulation') {
    if (subtitle) subtitle.textContent = 'Simule resultados e acompanhe classificação e chaveamento projetados';
  } else if (mode === 'pool') {
    if (subtitle) subtitle.textContent = 'Funcionalidade em desenvolvimento';
  } else {
    if (subtitle) subtitle.textContent = perms.readOnly
      ? 'Acompanhe os resultados oficiais da Copa'
      : 'Registre placares oficiais conforme os jogos terminam';
  }
}

export function scoreDisplayHTML(match) {
  return `<span class="score-readonly">${formatMatchScore(match)}</span>`;
}

export function scoreEditorHTML(match, compact = false) {
  if (!perms.canEditScores) return scoreDisplayHTML(match);
  const autoSave = perms.mode === 'simulation';
  const hs = match.homeScore ?? '';
  const as = match.awayScore ?? '';
  const knockout = isKnockoutPhase(match.phase);
  const actions = autoSave
    ? ''
    : `<button type="button" class="btn btn--primary btn--sm" data-save-score="${match.id}">${compact ? 'OK' : 'Salvar'}</button>`;
  return `
    <div class="score-editor${autoSave ? ' score-editor--autosave' : ''}" data-match-id="${match.id}" data-phase="${match.phase || ''}">
      <input type="number" min="0" max="20" inputmode="numeric" data-side="home" value="${hs}" aria-label="Gols mandante" />
      <span class="score-editor__sep">×</span>
      <input type="number" min="0" max="20" inputmode="numeric" data-side="away" value="${as}" aria-label="Gols visitante" />
      ${knockout ? knockoutExtraFieldsHTML(match, { compact: true }) : ''}
      ${actions}
    </div>`;
}

export function bindScoreEditors(root, handler, options = {}) {
  if (!root) return;
  const autoSave = options.autoSave ?? Boolean(root.querySelector('.score-editor--autosave'));
  const lastSaved = new Map();

  const commit = (wrap, { quiet = autoSave, force = false } = {}) => {
    if (!wrap?.dataset.matchId) return;
    const {
      id, home, away, homePenalties, awayPenalties, resultDetail,
    } = readScoreEditor(wrap);
    const homeEmpty = home === '';
    const awayEmpty = away === '';

    if (homeEmpty || awayEmpty) {
      if (homeEmpty && awayEmpty && lastSaved.has(id) && lastSaved.get(id) !== '|') {
        Promise.resolve(handler(id, '', '', { quiet }))
          .then(() => lastSaved.set(id, '|'))
          .catch(() => {});
      }
      return;
    }

    const key = scoreEditorKey({ home, away, homePenalties, awayPenalties, resultDetail });
    if (!force && lastSaved.get(id) === key) return;

    Promise.resolve(handler(id, home, away, {
      quiet, homePenalties, awayPenalties, resultDetail,
    }))
      .then(() => lastSaved.set(id, key))
      .catch(() => {});
  };

  if (!autoSave) {
    root.querySelectorAll('[data-save-score]').forEach((btn) => {
      btn.addEventListener('click', () => {
        commit(btn.closest('.score-editor'), { quiet: false, force: true });
      });
    });
  }

  root.querySelectorAll('.score-editor').forEach((wrap) => {
    const inputs = wrap.querySelectorAll('input[data-side], select[data-result-detail]');
    if (!inputs.length) return;

    if (autoSave) {
      const {
        id, home, away, homePenalties, awayPenalties, resultDetail,
      } = readScoreEditor(wrap);
      if (id && home !== '' && away !== '') {
        lastSaved.set(id, scoreEditorKey({ home, away, homePenalties, awayPenalties, resultDetail }));
      }
    }

    if (autoSave) {
      let timer;
      const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(() => commit(wrap, { quiet: true }), 500);
      };
      inputs.forEach((input) => {
        input.addEventListener('input', schedule);
        input.addEventListener('change', () => commit(wrap, { quiet: true }));
      });
      wrap.addEventListener('focusout', (e) => {
        if (!wrap.contains(e.relatedTarget)) commit(wrap, { quiet: true });
      });
    } else {
      inputs.forEach((input) => {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') commit(wrap, { quiet: false });
        });
      });
    }
  });
}

export function openScoreModal(data, matchId, handler) {
  const m = data.matches.find((x) => x.id === matchId);
  if (!m) return;
  document.getElementById('score-modal-title').textContent =
    `${teamName(data, m.home)} × ${teamName(data, m.away)}`;
  document.getElementById('score-modal-body').innerHTML = `
    <p style="color:var(--text-muted);font-size:0.85rem;margin-top:0">
      ${formatDate(m.date)} · ${formatMatchTime(m.time)} · ${m.venue || phaseLabel(m.phase)}
    </p>
    <div style="margin:1rem 0;text-align:center">${scoreEditorHTML(m)}</div>
    <p style="font-size:0.78rem;color:var(--text-muted)">${perms.mode === 'simulation' ? 'Placar salvo automaticamente ao editar' : 'Enter para salvar · Limpar remove o resultado'}</p>`;
  bindScoreEditors(document.getElementById('score-modal-body'), handler);
  document.getElementById('score-modal').showModal();
}

export function renderKPIs(data, container) {
  const k = computeKPIs(data);
  const items = [
    { label: 'Seleções', value: k.totalTeams },
    { label: 'Jogos', value: k.totalMatches },
    { label: 'Concluídos', value: k.finished },
    { label: 'Pendentes', value: k.pending },
    { label: 'Gols', value: k.totalGoals },
    { label: 'Média gols/jogo', value: k.avgGoals },
    { label: 'Empates', value: k.draws },
  ];

  container.innerHTML = items.map((i) => `
    <div class="kpi">
      <div class="kpi__label">${i.label}</div>
      <div class="kpi__value">${i.value}${i.small ? '' : ''}</div>
    </div>
  `).join('');
}

export function renderCountdown(data, container) {
  const next = getNextMatch(data.matches);
  if (!next) {
    container.innerHTML = '<span>Nenhum jogo pendente</span>';
    return;
  }

  // Horários do calendário estão em Brasília (BRT, UTC-3)
  const target = new Date(`${next.date}T${next.time}:00-03:00`);
  const tick = () => {
    if (next.status === 'live') {
      container.innerHTML = `<strong>AO VIVO:</strong> ${teamName(data, next.home)} vs ${teamName(data, next.away)} · ${next.time} BRT`;
      return;
    }
    const diff = target - Date.now();
    if (diff <= 0) {
      container.innerHTML = `<strong>Próximo:</strong> ${teamName(data, next.home)} vs ${teamName(data, next.away)} — em breve!`;
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    container.innerHTML = `<strong>Próximo jogo (${next.time} BRT):</strong> ${d}d ${h}h ${m}m ${s}s · ${teamName(data, next.home)} vs ${teamName(data, next.away)}`;
  };
  tick();
  if (container._interval) clearInterval(container._interval);
  container._interval = setInterval(tick, 1000);
}

function teamName(data, id) {
  if (!id) return 'A definir';
  return data.teamMap[id]?.name ?? id;
}

function isHighlighted(data, state, id) {
  if (!id) return false;
  const q = state.search.toLowerCase();
  const fav = state.favorites.includes(id);
  if (fav) return true;
  if (!q) return false;
  const name = teamName(data, id).toLowerCase();
  return name.includes(q) || id.toLowerCase().includes(q);
}

function matchRowHTML(data, m, state, compact = false, editable = false) {
  const hl = isHighlighted(data, state, m.home) || isHighlighted(data, state, m.away);
  const today = isToday(m.date);
  const scoreBlock = editable
    ? scoreEditorHTML(m, true)
    : `<span class="status-pill status-pill--${m.status}">${statusLabel(m.status)}</span>
       <div>${m.status === 'finished' || m.status === 'live' ? `${m.homeScore ?? '–'} × ${m.awayScore ?? '–'}` : 'vs'}</div>`;

  return `
    <div class="match-row ${hl ? 'highlight' : ''} ${today ? 'today' : ''} ${editable ? 'match-row--editable' : ''}" data-match="${m.id}">
      <div class="match-row__team">
        ${m.home ? `<img class="flag" src="${flagUrl(data.teamMap[m.home])}" alt="" />` : ''}
        <span>${teamName(data, m.home)}</span>
      </div>
      <div class="match-row__score">${scoreBlock}</div>
      <div class="match-row__team away">
        ${m.away ? `<img class="flag" src="${flagUrl(data.teamMap[m.away])}" alt="" />` : ''}
        <span>${teamName(data, m.away)}</span>
      </div>
      ${compact ? '' : `<div class="match-row__meta">${formatDate(m.date)} · ${formatMatchTime(m.time)} BRT · ${m.venue || phaseLabel(m.phase)}${perms.canEditScores && !editable ? ` · <button type="button" class="expand-btn" data-edit-match="${m.id}">Editar placar</button>` : ''}</div>`}
    </div>`;
}

export function renderOverview(data, state) {
  const liveNow = data.matches.filter((m) => m.status === 'live');

  const upcoming = data.matches
    .filter((m) => m.status === 'scheduled')
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .slice(0, 5);

  const now = new Date();
  const recent = data.matches
    .filter((m) => m.status === 'finished' && matchKickoff(m) <= now)
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
    .slice(0, 5);

  document.getElementById('next-matches').innerHTML = liveNow.length
    ? liveNow.map((m) => matchRowHTML(data, m, state, true)).join('')
      + (upcoming.length ? `<div style="margin-top:0.75rem;font-size:0.75rem;color:var(--text-muted)">Próximos:</div>${upcoming.slice(0, 3).map((m) => matchRowHTML(data, m, state, true)).join('')}` : '')
    : upcoming.length
    ? upcoming.map((m) => matchRowHTML(data, m, state, true)).join('')
    : '<div class="empty">Sem jogos pendentes</div>';

  document.getElementById('recent-results').innerHTML = recent.length
    ? recent.map((m) => matchRowHTML(data, m, state, true)).join('')
    : '<div class="empty">Nenhum resultado ainda</div>';

  renderOverviewThirdPlaces(data, state);

  const agg = aggregateStats(data);
  document.getElementById('highlights').innerHTML = `
    <div class="highlight-item"><span>Média de gols/jogo</span><strong>${computeKPIs(data).avgGoals}</strong></div>
    <div class="highlight-item"><span>Total de empates</span><strong>${agg.draws}</strong></div>
    <div class="highlight-item"><span>Melhor ataque</span><strong>${agg.attack[0] ? teamName(data, agg.attack[0].id) + ' (' + agg.attack[0].gf + ')' : '—'}</strong></div>
    <div class="highlight-item"><span>Melhor defesa</span><strong>${agg.defense[0] ? teamName(data, agg.defense[0].id) + ' (' + agg.defense[0].ga + ' sofridos)' : '—'}</strong></div>
    <div class="highlight-item"><span>Grupo mais goleador</span><strong>${agg.groupStats.sort((a,b)=>b.goals-a.goals)[0]?.group ?? '—'}</strong></div>
  `;

  const scorers = normalizeScorers(data.stats?.topScorers ?? []);
  document.getElementById('top-scorers-mini').innerHTML = scorers.length
    ? scorers.slice(0, 5).map((s, i) => `
      <div class="scorer-row">
        <span class="scorer-rank">${i + 1}</span>
        <img class="flag" src="${flagUrl(data.teamMap[s.team])}" alt="" />
        <span>${s.player} <small style="color:var(--text-muted)">(${teamName(data, s.team)})</small></span>
        <span class="scorer-goals">${s.goals}</span>
      </div>`).join('')
    : '<div class="empty">Sem dados de artilheiros</div>';

  const thirds = thirdPlaceRanking(data);
  const qualifiedThirds = new Set(thirds.slice(0, 8).map((t) => t.code));

  document.getElementById('overview-groups').innerHTML = data.groups.map((g) => {
    const standings = computeGroupStandings(g.id, data.matches, g.teams);
    return renderStandingsTable(data, g.id, standings, state, qualifiedThirds, true);
  }).join('');
}

function renderOverviewThirdPlaces(data, state) {
  const el = document.getElementById('overview-third-places');
  if (!el) return;

  const thirds = thirdPlaceRanking(data);
  const slots = getThirdPlaceBracketSlots(data);

  if (!thirds.length) {
    el.innerHTML = '<div class="empty">Sem dados dos grupos</div>';
    return;
  }

  const rows = thirds.map((t, i) => {
    const qualified = i < 8;
    const slot = slots[t.code];
    const hl = isHighlighted(data, state, t.code);
    const gd = t.gd > 0 ? `+${t.gd}` : String(t.gd);
    const name = teamName(data, t.code);
    const dest = slot?.opponent
      ? ` · 16 avos vs ${teamName(data, slot.opponent)}`
      : '';
    const tip = `3º do Grupo ${t.group}${dest}`.replace(/"/g, '&quot;');
    const cutoff = i === 7 ? '<tr class="tpr-cutoff" aria-hidden="true"><td colspan="9"><span class="tpr-cutoff__line"></span></td></tr>' : '';
    return `
      <tr class="tpr-row ${qualified ? 'tpr-row--qualified' : ''} ${hl ? 'tpr-row--highlight' : ''}" title="${tip}">
        <td class="tpr-rank">${i + 1}</td>
        <td class="tpr-flag"><img class="flag" src="${flagUrl(data.teamMap[t.code])}" alt="" /></td>
        <td class="tpr-team">${name}</td>
        <td class="tpr-num">${t.played}</td>
        <td class="tpr-num">${t.won}</td>
        <td class="tpr-num">${t.drawn}</td>
        <td class="tpr-num">${t.lost}</td>
        <td class="tpr-num tpr-num--sg">${gd}</td>
        <td class="tpr-pts"><span class="tpr-pts__badge">${t.pts}</span></td>
      </tr>${cutoff}`;
  }).join('');

  el.innerHTML = `
    <div class="tpr-card">
      <div class="tpr-card__frame">
        <div class="tpr-card__inner">
          <header class="tpr-header">
            <span class="tpr-header__icon" aria-hidden="true">🏆</span>
            <h3 class="tpr-header__title">Ranking de 3º lugar</h3>
          </header>
          <div class="tpr-table-wrap">
            <table class="tpr-table">
              <thead>
                <tr>
                  <th class="tpr-th tpr-th--rank" scope="col"><span class="visually-hidden">Posição</span></th>
                  <th class="tpr-th tpr-th--flag" scope="col"><span class="visually-hidden">Bandeira</span></th>
                  <th class="tpr-th tpr-th--team" scope="col"><span class="visually-hidden">Seleção</span></th>
                  <th class="tpr-th tpr-stat" scope="col">J</th>
                  <th class="tpr-th tpr-stat" scope="col">V</th>
                  <th class="tpr-th tpr-stat" scope="col">E</th>
                  <th class="tpr-th tpr-stat" scope="col">D</th>
                  <th class="tpr-th tpr-stat" scope="col">SG</th>
                  <th class="tpr-th tpr-stat tpr-stat--pts" scope="col">PTS</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <footer class="tpr-footer">FIFA WORLD CUP 2026™</footer>
        </div>
      </div>
    </div>`;
}

function favBtn(id, state) {
  const active = state.favorites.includes(id) ? 'active' : '';
  if (!perms.canFavorite) {
    return active ? '<span class="fav-star fav-star--readonly active" aria-hidden="true">★</span>' : '';
  }
  return `<button class="fav-star ${active}" data-fav="${id}" title="Favoritar">★</button>`;
}

function renderStandingsTable(data, groupId, standings, state, qualifiedThirds, mini = false, expanded = false, onToggle = null) {
  const progress = groupProgress(data, groupId);
  const groupMatches = data.matches
    .filter((m) => m.phase === 'group' && m.group === groupId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const labelTeam = (id) => (mini ? teamName(data, id) : teamShortLabelHTML(data, id));

  const matchesBlock = !mini && expanded ? `
    <div class="group-matches">
      ${groupMatches.map((m) => `
        <div class="group-match-item">
          <div class="group-match-item__team">
            <img class="flag" src="${flagUrl(data.teamMap[m.home])}" alt="" />
            ${labelTeam(m.home)}
          </div>
          ${scoreEditorHTML(m)}
          <div class="group-match-item__team away">
            <img class="flag" src="${flagUrl(data.teamMap[m.away])}" alt="" />
            ${labelTeam(m.away)}
          </div>
          <span class="status-pill status-pill--${m.status}">${statusLabel(m.status)}</span>
          <div class="group-match-item__meta">Rodada ${m.matchday} · ${formatDate(m.date)} · ${formatMatchTime(m.time)} BRT</div>
        </div>`).join('')}
    </div>` : '';

  const toggleBtn = !mini ? `
    <div class="group-card__actions">
      <button type="button" class="expand-btn" data-toggle-group="${groupId}">
        ${expanded ? '▾ Ocultar jogos' : '▸ Editar jogos'} (${progress.done}/${progress.total})
      </button>
    </div>` : '';

  return `
    <div class="group-card card ${mini ? '' : 'group-card--full'} ${standings.some((s) => isHighlighted(data, state, s.code)) ? 'highlight' : ''}" data-group="${groupId}">
      <div class="card__header group-card__header">
        <h2>Grupo ${groupId}</h2>
        <span class="group-card__progress">${progress.done}/${progress.total} jogos</span>
      </div>
      <div class="group-card__table-wrap">
        <table class="standings ${mini ? '' : 'standings--compact-names'}">
          <thead><tr>
            <th>Seleção</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th>
            ${mini ? '' : '<th>GP</th><th>GC</th>'}
            <th>SG</th><th>Pts</th>
          </tr></thead>
          <tbody>
            ${standings.map((s, i) => {
              const cls = i < 2 ? 'qualified' : i === 2 && qualifiedThirds?.has(s.code) ? 'third' : '';
              return `<tr class="${cls}">
                <td><div class="team-name">${favBtn(s.code, state)}<img class="flag" src="${flagUrl(data.teamMap[s.code])}" alt="" />${mini ? `<span>${teamName(data, s.code)}</span>` : teamShortLabelHTML(data, s.code)}</div></td>
                <td>${i + 1}º</td><td>${s.played}</td><td>${s.won}</td><td>${s.drawn}</td><td>${s.lost}</td>
                ${mini ? '' : `<td>${s.gf}</td><td>${s.ga}</td>`}
                <td>${s.gd > 0 ? '+' + s.gd : s.gd}</td><td><span class="standings__pts">${s.pts}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      ${toggleBtn}
      ${matchesBlock}
    </div>`;
}

export function renderGroupsFilters(data, state, onChange) {
  const el = document.getElementById('groups-filters');
  el.innerHTML = `
    <select id="gf-group">
      <option value="all">Todos os grupos</option>
      ${data.groups.map((g) => `<option value="${g.id}" ${state.groupFilter === g.id ? 'selected' : ''}>Grupo ${g.id}</option>`).join('')}
    </select>
    <label><input type="checkbox" id="gf-favs" ${state.groupFavsOnly ? 'checked' : ''} /> Só grupos com favoritos</label>
  `;
  el.querySelector('#gf-group').addEventListener('change', (e) => {
    state.groupFilter = e.target.value;
    onChange();
  });
  el.querySelector('#gf-favs').addEventListener('change', (e) => {
    state.groupFavsOnly = e.target.checked;
    onChange();
  });
}

export function renderGroups(data, state, onToggleGroup) {
  const thirds = thirdPlaceRanking(data);
  const qualifiedThirds = new Set(thirds.slice(0, 8).map((t) => t.code));
  const filter = state.groupFilter || 'all';

  document.getElementById('groups-grid').innerHTML = data.groups
    .filter((g) => {
      if (filter !== 'all' && g.id !== filter) return false;
      if (state.groupFavsOnly) return g.teams.some((t) => state.favorites.includes(t));
      return true;
    })
    .map((g) => {
      const standings = computeGroupStandings(g.id, data.matches, g.teams);
      const expanded = state.expandedGroups?.includes(g.id);
      return renderStandingsTable(data, g.id, standings, state, qualifiedThirds, false, expanded);
    }).join('');

  bindFavButtons(document.getElementById('groups-grid'), state, onFavToggle);
  bindScoreEditors(document.getElementById('groups-grid'), onScoreSave, {
    autoSave: perms.mode === 'simulation',
  });

  document.getElementById('groups-grid').querySelectorAll('[data-toggle-group]').forEach((btn) => {
    btn.addEventListener('click', () => onToggleGroup?.(btn.dataset.toggleGroup));
  });
}

export function renderMatchesFilters(data, state, onChange) {
  const el = document.getElementById('matches-filters');
  const phases = ['all', 'group', 'r32', 'r16', 'qf', 'sf', 'bronze', 'final'];
  el.innerHTML = `
    <select id="mf-phase">${phases.map((p) => `<option value="${p}" ${state.matchFilters.phase === p ? 'selected' : ''}>${p === 'all' ? 'Todas fases' : phaseLabel(p)}</option>`).join('')}</select>
    <select id="mf-group"><option value="all">Todos grupos</option>${data.groups.map((g) => `<option value="${g.id}" ${state.matchFilters.group === g.id ? 'selected' : ''}>Grupo ${g.id}</option>`).join('')}</select>
    <select id="mf-team"><option value="all">Todas seleções</option>${data.teams.map((t) => `<option value="${t.id}" ${state.matchFilters.team === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}</select>
    <input type="date" id="mf-date" value="${state.matchFilters.date || ''}" />
    <select id="mf-status">
      <option value="all">Todos status</option>
      <option value="scheduled" ${state.matchFilters.status === 'scheduled' ? 'selected' : ''}>Agendado</option>
      <option value="live" ${state.matchFilters.status === 'live' ? 'selected' : ''}>Em andamento</option>
      <option value="finished" ${state.matchFilters.status === 'finished' ? 'selected' : ''}>Encerrado</option>
    </select>
    <button type="button" class="btn btn--ghost btn--sm" id="mf-clear">Limpar filtros</button>
  `;

  ['mf-phase', 'mf-group', 'mf-team', 'mf-date', 'mf-status'].forEach((id) => {
    el.querySelector(`#${id}`).addEventListener('change', () => {
      state.matchFilters = {
        phase: el.querySelector('#mf-phase').value,
        group: el.querySelector('#mf-group').value,
        team: el.querySelector('#mf-team').value,
        date: el.querySelector('#mf-date').value,
        status: el.querySelector('#mf-status').value,
        search: state.search,
      };
      onChange();
    });
  });

  el.querySelector('#mf-clear').addEventListener('click', () => {
    state.matchFilters = { phase: 'all', group: 'all', team: 'all', date: '', status: 'all', search: state.search };
    renderMatchesFilters(data, state, onChange);
    onChange();
  });
}

function matchMetaLineHTML(m) {
  const parts = [
    phaseLabel(m.phase),
    m.group ? `Grupo ${m.group}` : null,
    formatDate(m.date),
    `${formatMatchTime(m.time)} BRT`,
    m.venue || null,
  ].filter(Boolean);

  return parts
    .map((text, i) => `${i ? '<span class="match-list-card__meta-sep" aria-hidden="true">·</span>' : ''}<span>${text}</span>`)
    .join('');
}

function matchListCardHTML(data, state, m) {
  const hl = isHighlighted(data, state, m.home) || isHighlighted(data, state, m.away);
  const today = isToday(m.date);
  const homeLabel = m.home ? teamShortLabelHTML(data, m.home) : '<span class="team-name__text">—</span>';
  const awayLabel = m.away ? teamShortLabelHTML(data, m.away) : '<span class="team-name__text">—</span>';

  return `
    <article class="match-list-card ${hl ? 'highlight' : ''} ${today ? 'today' : ''}" data-match="${m.id}">
      <div class="match-list-card__meta">${matchMetaLineHTML(m)}</div>
      <div class="match-list-card__fixture">
        <div class="match-list-card__team">
          ${m.home ? `<img class="flag" src="${flagUrl(data.teamMap[m.home])}" alt="" />` : ''}
          ${homeLabel}
        </div>
        <div class="match-list-card__score">${scoreEditorHTML(m, true)}</div>
        <div class="match-list-card__team away">
          ${awayLabel}
          ${m.away ? `<img class="flag" src="${flagUrl(data.teamMap[m.away])}" alt="" />` : ''}
        </div>
        <div class="match-list-card__status">
          <span class="status-pill status-pill--${m.status}">${statusLabel(m.status)}</span>
          ${matchStatusActionHTML(m)}
        </div>
      </div>
    </article>`;
}

function matchStatusActionHTML(m) {
  if (!perms.canEditScores || perms.mode !== 'real') return '';
  return m.status === 'finished'
    ? `<button type="button" class="btn btn--ghost btn--sm match-status-btn" data-reopen-match="${m.id}" title="Reabrir como em andamento">Reabrir</button>`
    : `<button type="button" class="btn btn--ghost btn--sm match-status-btn" data-finish-match="${m.id}" title="Encerrar partida manualmente">Encerrar</button>`;
}

export function bindMatchActions(root, { onFinish, onReopen } = {}) {
  if (!root) return;
  root.querySelectorAll('[data-finish-match]').forEach((btn) => {
    btn.addEventListener('click', () => onFinish?.(btn.dataset.finishMatch));
  });
  root.querySelectorAll('[data-reopen-match]').forEach((btn) => {
    btn.addEventListener('click', () => onReopen?.(btn.dataset.reopenMatch));
  });
}

export function renderMatchesTable(data, state) {
  const filtered = filterMatches(data.matches, { ...state.matchFilters, search: state.search }, data.teamMap);
  const wrap = document.getElementById('matches-table-wrap');

  if (!filtered.length) {
    wrap.innerHTML = '<div class="empty">Nenhum jogo encontrado.</div>';
    return;
  }

  const cards = filtered.map((m) => matchListCardHTML(data, state, m)).join('');

  wrap.innerHTML = `
    <div class="matches-list">${cards}</div>
    <p class="matches-view__count">${filtered.length} jogo(s) exibido(s)</p>`;
}

export function renderKnockout(data, state) {
  document.getElementById('bracket-wrap').innerHTML = renderKnockoutBracket(data, {
    canEditScores: perms.canEditScores,
    autoSaveScores: perms.mode === 'simulation',
  }, { projected: isBracketProjected(data) });
}

export function renderTeams(data, state, onTeamClick) {
  const listPanel = document.getElementById('teams-list-panel');
  const detailPanel = document.getElementById('team-detail-panel');
  if (listPanel) listPanel.hidden = false;
  if (detailPanel) detailPanel.hidden = true;

  const q = state.search.toLowerCase();
  const teams = data.teams
    .filter((t) => !q || t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q))
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));

  document.getElementById('teams-grid').innerHTML = teams.map((t) => {
    const hl = isHighlighted(data, state, t.id);
    return `<button type="button" class="team-card team-card--simple ${hl ? 'highlight' : ''}" data-team="${t.id}">
      <img class="team-card__flag" src="${flagUrl(t)}" alt="" />
      <span class="team-card__name">${t.name}</span>
    </button>`;
  }).join('');

  document.getElementById('teams-grid').querySelectorAll('[data-team]').forEach((card) => {
    card.addEventListener('click', () => onTeamClick(card.dataset.team));
  });

  const selA = document.getElementById('compare-a');
  const selB = document.getElementById('compare-b');
  if (selA && selA.options.length <= 1) {
    data.teams.forEach((t) => {
      selA.add(new Option(t.name, t.id));
      selB.add(new Option(t.name, t.id));
    });
  }
}

function rankLabel(rank, total) {
  if (!rank || !total) return '—';
  return `${rank}º de ${total}`;
}

function scorerRowHTML(s) {
  return `<div class="scorer-row">
    <span>${s.player}</span>
    <span class="scorer-goals">${s.goals} gol${s.goals !== 1 ? 's' : ''}</span>
  </div>`;
}

function teamGoalContributionRowHTML(item) {
  if (item.kind === 'own') {
    const min = item.minute != null ? ` (${item.minute}')` : '';
    return `<div class="scorer-row scorer-row--own">
      <span>${item.player}</span>
      <span class="scorer-goals">gol contra${min}</span>
    </div>`;
  }
  if (item.kind === 'unknown') {
    return `<div class="scorer-row scorer-row--unknown">
      <span>Gol${item.count !== 1 ? 's' : ''} não identificado${item.count !== 1 ? 's' : ''} na API</span>
      <span class="scorer-goals">${item.count} gol${item.count !== 1 ? 's' : ''}</span>
    </div>`;
  }
  return scorerRowHTML(item);
}

function teamScorersBlockHTML(data, teamId, teamGF = 0) {
  const contributions = teamGoalContributions(data, teamId);
  if (contributions.length) {
    return contributions.map(teamGoalContributionRowHTML).join('');
  }

  const scorers = teamScorers(data, teamId);
  if (scorers.length) {
    return scorers.map(scorerRowHTML).join('');
  }
  if (teamGF > 0) {
    return `<div class="team-detail-scorers-fallback">
      <p>A seleção marcou <strong>${teamGF} gols</strong> no torneio.</p>
      <p class="team-detail-scorers-fallback__hint">Nenhum artilheiro individual cadastrado para esta seleção.</p>
    </div>`;
  }
  return '<div class="empty">Nenhum gol registrado para esta seleção ainda</div>';
}

function teamDetailMatchHTML(data, m, teamId) {
  const isHome = m.home === teamId;
  const oppId = isHome ? m.away : m.home;
  const opp = data.teamMap[oppId];
  const gf = isHome ? m.homeScore : m.awayScore;
  const ga = isHome ? m.awayScore : m.homeScore;
  const scoreText = m.status === 'finished' || m.status === 'live'
    ? `${gf ?? '–'} × ${ga ?? '–'}`
    : '– × –';
  let result = '';
  if (m.status === 'finished' && gf != null && ga != null) {
    if (gf > ga) result = 'team-detail-match--win';
    else if (gf < ga) result = 'team-detail-match--loss';
    else result = 'team-detail-match--draw';
  }

  const venueLabel = isHome ? 'Casa' : 'Fora';
  const oppHTML = opp
    ? `<div class="team-name team-detail-match__opp-name">
        <img class="flag" src="${flagUrl(opp)}" alt="" />
        ${teamShortLabelHTML(data, oppId)}
      </div>`
    : '<span class="team-detail-match__opp-name">—</span>';

  return `<div class="team-detail-match ${result}">
    <span class="team-detail-match__meta">${formatDateShort(m.date)} · ${phaseLabel(m.phase)}${m.group ? ` · Grp ${m.group}` : ''} · ${venueLabel}</span>
    <span class="team-detail-match__opp">${oppHTML}</span>
    <span class="team-detail-match__score">${scoreText}</span>
    <span class="status-pill status-pill--${m.status}">${statusLabel(m.status)}</span>
  </div>`;
}

function teamLineupSubtitle(data, teamId) {
  const t = data.teamMap[teamId];
  const formation = t?.probable_formation || '4-4-2';
  const coach = t?.coach ? ` · ${t.coach}` : '';
  return `${formation}${coach}`;
}

export function renderTeamDetail(data, state, teamId, onBack) {
  const t = data.teamMap[teamId];
  if (!t) {
    onBack?.();
    return;
  }

  const listPanel = document.getElementById('teams-list-panel');
  const detailPanel = document.getElementById('team-detail-panel');
  if (listPanel) listPanel.hidden = true;
  if (detailPanel) detailPanel.hidden = false;

  const stats = teamDetailedStats(teamId, data);

  detailPanel.innerHTML = `
    <div class="team-detail">
      <button type="button" class="btn btn--ghost btn--sm team-detail__back" id="team-detail-back">← Voltar às seleções</button>

      <header class="team-detail__hero">
        <img class="team-detail__flag" src="${flagUrl(t)}" alt="" />
        <div class="team-detail__hero-text">
          <h1>${t.name}</h1>
          <p class="team-detail__subtitle">
            Grupo ${t.group} · ${t.confederation}
            ${stats.groupPos ? ` · ${stats.groupPos}º no grupo` : ''}
          </p>
        </div>
      </header>

      <div class="team-detail-kpis">
        <div class="team-detail-kpi"><span class="team-detail-kpi__val">${stats.pts}</span><span class="team-detail-kpi__lbl">Pts</span></div>
        <div class="team-detail-kpi"><span class="team-detail-kpi__val">${stats.played}</span><span class="team-detail-kpi__lbl">Jogos</span></div>
        <div class="team-detail-kpi"><span class="team-detail-kpi__val">${stats.won}-${stats.drawn}-${stats.lost}</span><span class="team-detail-kpi__lbl">V-E-D</span></div>
        <div class="team-detail-kpi"><span class="team-detail-kpi__val">${stats.gf}</span><span class="team-detail-kpi__lbl">Gols</span></div>
        <div class="team-detail-kpi"><span class="team-detail-kpi__val">${stats.ga}</span><span class="team-detail-kpi__lbl">Sofridos</span></div>
        <div class="team-detail-kpi"><span class="team-detail-kpi__val">${stats.gd > 0 ? '+' + stats.gd : stats.gd}</span><span class="team-detail-kpi__lbl">Saldo</span></div>
        <div class="team-detail-kpi"><span class="team-detail-kpi__val">${stats.aproveitamento}%</span><span class="team-detail-kpi__lbl">Aprov.</span></div>
        <div class="team-detail-kpi"><span class="team-detail-kpi__val">${stats.cleanSheets}</span><span class="team-detail-kpi__lbl">Clean sheets</span></div>
      </div>

      <div class="team-detail-ranks card">
        <div class="card__header"><h2>Comparativo no torneio</h2></div>
        <div class="card__body team-detail-ranks__grid">
          <div><span class="team-detail-ranks__label">Pontos</span><strong>${rankLabel(stats.ranks.pts, stats.ranks.total)}</strong></div>
          <div><span class="team-detail-ranks__label">Ataque (gols)</span><strong>${rankLabel(stats.ranks.gf, stats.ranks.total)}</strong></div>
          <div><span class="team-detail-ranks__label">Defesa (sofridos)</span><strong>${rankLabel(stats.ranks.ga, stats.ranks.total)}</strong></div>
          <div><span class="team-detail-ranks__label">Saldo de gols</span><strong>${rankLabel(stats.ranks.gd, stats.ranks.total)}</strong></div>
          <div><span class="team-detail-ranks__label">Média gols/jogo</span><strong>${stats.avgGF}</strong></div>
          <div><span class="team-detail-ranks__label">Média sofridos/jogo</span><strong>${stats.avgGA}</strong></div>
        </div>
      </div>

      <div class="team-detail-charts charts-grid">
        <article class="card card--wide team-detail-lineup-card">
          <div class="card__header">
            <h2>Escalação provável</h2>
            <span class="card__subtitle">${teamLineupSubtitle(data, teamId)}</span>
          </div>
          <div class="card__body">
            ${renderTeamLineupInfographic(data, teamId)}
          </div>
        </article>
        <article class="card"><div class="card__header"><h2>Gols por fase</h2></div><div class="card__body chart-wrap"><canvas id="team-chart-goals-phase"></canvas></div></article>
        <article class="card"><div class="card__header"><h2>Distribuição de resultados</h2></div><div class="card__body chart-wrap"><canvas id="team-chart-results"></canvas></div></article>
        <article class="card card--wide"><div class="card__header"><h2>vs média do torneio</h2></div><div class="card__body chart-wrap"><canvas id="team-chart-compare"></canvas></div></article>
      </div>

      <div class="team-detail-grid">
        <article class="card">
          <div class="card__header"><h2>Classificação — Grupo ${t.group}</h2></div>
          <div class="card__body">
            <table class="standings standings--compact-names">
              <thead><tr><th>Seleção</th><th>P</th><th>J</th><th>SG</th><th>Pts</th></tr></thead>
              <tbody>
                ${stats.standings.map((s, i) => `<tr class="${s.code === teamId ? 'qualified' : ''}">
                  <td><div class="team-name"><img class="flag" src="${flagUrl(data.teamMap[s.code])}" alt="" />${teamShortLabelHTML(data, s.code)}</div></td>
                  <td>${i + 1}º</td><td>${s.played}</td><td>${s.gd > 0 ? '+' + s.gd : s.gd}</td><td><span class="standings__pts">${s.pts}</span></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </article>

        <article class="card">
          <div class="card__header"><h2>Artilheiros</h2></div>
          <div class="card__body">
            ${teamScorersBlockHTML(data, teamId, stats.gf)}
          </div>
        </article>
      </div>

      <article class="card">
        <div class="card__header"><h2>Jogos da seleção</h2></div>
        <div class="card__body team-detail-matches">
          ${stats.teamMatches.length
            ? stats.teamMatches.map((m) => teamDetailMatchHTML(data, m, teamId)).join('')
            : '<div class="empty">Nenhum jogo encontrado</div>'}
        </div>
      </article>
    </div>`;

  document.getElementById('team-detail-back')?.addEventListener('click', () => onBack?.());
  bindLineupPlayerTooltips(detailPanel);
}

export function renderCompare(data, idA, idB) {
  const el = document.getElementById('compare-result');
  if (!idA || !idB || idA === idB) {
    el.classList.remove('visible');
    return;
  }
  const sa = teamStats(idA, data.matches);
  const sb = teamStats(idB, data.matches);
  const ta = data.teamMap[idA];
  const tb = data.teamMap[idB];

  const metric = (label, a, b) => `<div class="compare-metric">${label}: <strong>${a}</strong> vs <strong>${b}</strong></div>`;

  el.classList.add('visible');
  el.innerHTML = `
    <div class="compare-col">
      <img class="flag" style="width:48px;height:32px" src="${flagUrl(ta)}" alt="" />
      <h3>${ta.name}</h3>
      ${metric('Pontos', sa.pts, sb.pts)}
      ${metric('Vitórias', sa.won, sb.won)}
      ${metric('Gols marcados', sa.gf, sb.gf)}
      ${metric('Gols sofridos', sa.ga, sb.ga)}
      ${metric('Aproveitamento', sa.aproveitamento + '%', sb.aproveitamento + '%')}
    </div>
    <div class="compare-vs">VS</div>
    <div class="compare-col">
      <img class="flag" style="width:48px;height:32px" src="${flagUrl(tb)}" alt="" />
      <h3>${tb.name}</h3>
      ${metric('Pontos', sb.pts, sa.pts)}
      ${metric('Vitórias', sb.won, sa.won)}
      ${metric('Gols marcados', sb.gf, sa.gf)}
      ${metric('Gols sofridos', sb.ga, sa.ga)}
      ${metric('Aproveitamento', sb.aproveitamento + '%', sa.aproveitamento + '%')}
    </div>`;
}

export function renderCalendar(data, state, onEditMatch) {
  const matches = filterMatches(data.matches, { ...state.matchFilters, search: state.search, phase: 'all', group: 'all', team: 'all', status: 'all', date: '' }, data.teamMap);
  const byDate = {};
  matches.forEach((m) => { (byDate[m.date] ??= []).push(m); });

  document.getElementById('calendar-view').innerHTML = Object.keys(byDate).sort().map((date) => {
    const today = isToday(date);
    return `<div class="cal-day ${today ? 'today' : ''}">
      <div class="cal-day__head">
        <span>${formatDateShort(date)}</span>
        ${today ? '<span class="badge-today">Hoje</span>' : ''}
      </div>
      <div class="cal-day__body">
        ${byDate[date].map((m) => matchRowHTML(data, m, state)).join('')}
      </div>
    </div>`;
  }).join('') || '<div class="empty">Nenhum jogo no calendário.</div>';

  if (onEditMatch) {
    document.getElementById('calendar-view').querySelectorAll('[data-edit-match]').forEach((btn) => {
      btn.addEventListener('click', () => onEditMatch(data, btn.dataset.editMatch, onScoreSave));
    });
  }
}

export function renderPerformanceRanking(data) {
  const perf = aggregateStats(data).teamPerformance.filter((t) => t.played > 0).slice(0, 10);
  document.getElementById('performance-ranking').innerHTML = `
    <table class="standings">
      <thead><tr><th>#</th><th>Seleção</th><th>Pts</th><th>J</th><th>SG</th><th>Aprov.</th></tr></thead>
      <tbody>
        ${perf.map((t, i) => `<tr>
          <td>${i + 1}</td>
          <td><div class="team-name"><img class="flag" src="${flagUrl(t)}" alt="" /><span>${t.name}</span></div></td>
          <td><strong>${t.pts}</strong></td><td>${t.played}</td><td>${t.gd > 0 ? '+' + t.gd : t.gd}</td><td>${t.aproveitamento}%</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

export function renderTopScorersRanking(data) {
  const el = document.getElementById('top-scorers-ranking');
  if (!el) return;

  const scorers = normalizeScorers(data.stats?.topScorers ?? [])
    .filter((s) => s.goals > 0);

  if (!scorers.length) {
    el.innerHTML = '<div class="empty">Nenhum gol registrado ainda</div>';
    return;
  }

  el.innerHTML = `
    <table class="standings standings--compact-names">
      <thead>
        <tr><th>#</th><th>Jogador</th><th>Seleção</th><th>Gols</th></tr>
      </thead>
      <tbody>
        ${scorers.map((s, i) => {
          const team = data.teamMap[s.team];
          return `<tr>
            <td>${i + 1}</td>
            <td><strong>${s.player}</strong></td>
            <td>
              <div class="team-name">
                ${team ? `<img class="flag" src="${flagUrl(team)}" alt="" />` : ''}
                ${teamShortLabelHTML(data, s.team)}
              </div>
            </td>
            <td><span class="standings__pts">${s.goals}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function bindFavButtons(root, state, callback) {
  root.querySelectorAll('[data-fav]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      callback(btn.dataset.fav, state);
    });
  });
}

let onFavToggle = () => {};

export function setFavToggleHandler(fn) {
  onFavToggle = fn;
}

export function bindOverviewFavs(state, callback) {
  bindFavButtons(document.getElementById('overview-groups'), state, callback);
}

export function updatePhaseBadge(text) {
  const el = document.getElementById('status-phase-text');
  if (el) el.textContent = text;
}

export function renderPool() {
  const el = document.getElementById('pool-content');
  if (!el) return;
  el.innerHTML = `
    <div class="pool-placeholder">
      <div class="pool-placeholder__icon" aria-hidden="true">🎯</div>
      <h2>Bolão Copa 2026</h2>
      <p>Em breve você poderá criar palpites, acompanhar sua pontuação e competir com amigos.</p>
      <ul class="pool-placeholder__list">
        <li>Palpites por rodada</li>
        <li>Ranking entre participantes</li>
        <li>Comparativo com resultados reais</li>
      </ul>
      <p class="pool-placeholder__note">Enquanto isso, use o <strong>modo Simulação</strong> para testar cenários.</p>
    </div>`;
}
