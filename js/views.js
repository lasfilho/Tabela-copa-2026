/**
 * Renderização das views do dashboard.
 */
import { flagUrl } from './data-service.js';
import {
  computeGroupStandings, computeKPIs, aggregateStats, getNextMatch,
  getWinner, thirdPlaceRanking, filterMatches, teamStats,
  formatDate, formatDateShort, isToday, statusLabel, phaseLabel,
} from './engine.js';
import { groupProgress } from './knockout-resolver.js';

let onScoreSave = () => {};

export function setScoreSaveHandler(fn) {
  onScoreSave = fn;
}

export function updateModeUI(mode) {
  const banner = document.getElementById('mode-banner');
  const subtitle = document.getElementById('mode-subtitle');
  document.querySelectorAll('.mode-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  if (mode === 'simulation') {
    banner.className = 'mode-banner mode-banner--simulation';
    banner.textContent = 'Modo Simulação — cenários hipotéticos salvos no banco, separados do modo real';
    if (subtitle) subtitle.textContent = 'Simule resultados e acompanhe classificação e chaveamento projetados';
  } else {
    banner.className = 'mode-banner mode-banner--real';
    banner.textContent = 'Modo Real — placares salvos no PostgreSQL (persistem ao recarregar)';
    if (subtitle) subtitle.textContent = 'Placares reais salvos separadamente da simulação';
  }
}

export function scoreEditorHTML(match, compact = false) {
  const hs = match.homeScore ?? '';
  const as = match.awayScore ?? '';
  return `
    <div class="score-editor" data-match-id="${match.id}">
      <input type="number" min="0" max="20" inputmode="numeric" data-side="home" value="${hs}" aria-label="Gols mandante" />
      <span class="score-editor__sep">×</span>
      <input type="number" min="0" max="20" inputmode="numeric" data-side="away" value="${as}" aria-label="Gols visitante" />
      <button type="button" class="btn btn--primary btn--sm" data-save-score="${match.id}">${compact ? 'OK' : 'Salvar'}</button>
      ${match.status === 'finished' ? `<button type="button" class="btn btn--ghost btn--sm" data-clear-score="${match.id}">Limpar</button>` : ''}
    </div>`;
}

export function bindScoreEditors(root, handler) {
  if (!root) return;
  root.querySelectorAll('[data-save-score]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const wrap = btn.closest('.score-editor');
      const home = wrap.querySelector('[data-side="home"]').value;
      const away = wrap.querySelector('[data-side="away"]').value;
      handler(btn.dataset.saveScore, home, away);
    });
  });
  root.querySelectorAll('[data-clear-score]').forEach((btn) => {
    btn.addEventListener('click', () => handler(btn.dataset.clearScore, '', ''));
  });
  root.querySelectorAll('.score-editor input').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const wrap = input.closest('.score-editor');
        const id = wrap.dataset.matchId;
        const home = wrap.querySelector('[data-side="home"]').value;
        const away = wrap.querySelector('[data-side="away"]').value;
        handler(id, home, away);
      }
    });
  });
}

export function openScoreModal(data, matchId, handler) {
  const m = data.matches.find((x) => x.id === matchId);
  if (!m) return;
  document.getElementById('score-modal-title').textContent =
    `${teamName(data, m.home)} × ${teamName(data, m.away)}`;
  document.getElementById('score-modal-body').innerHTML = `
    <p style="color:var(--text-muted);font-size:0.85rem;margin-top:0">
      ${formatDate(m.date)} · ${m.time} · ${m.venue || phaseLabel(m.phase)}
    </p>
    <div style="margin:1rem 0;text-align:center">${scoreEditorHTML(m)}</div>
    <p style="font-size:0.78rem;color:var(--text-muted)">Enter para salvar · Limpar remove o resultado</p>`;
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
    { label: 'Fase atual', value: k.currentPhase, small: true },
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
      ${compact ? '' : `<div class="match-row__meta">${formatDate(m.date)} · ${m.time} BRT · ${m.venue || phaseLabel(m.phase)}${!editable ? ` · <button type="button" class="expand-btn" data-edit-match="${m.id}">Editar placar</button>` : ''}</div>`}
    </div>`;
}

export function renderOverview(data, state) {
  const liveNow = data.matches.filter((m) => m.status === 'live');

  const upcoming = data.matches
    .filter((m) => m.status === 'scheduled')
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .slice(0, 5);

  const recent = data.matches
    .filter((m) => m.status === 'finished')
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

  const agg = aggregateStats(data);
  document.getElementById('highlights').innerHTML = `
    <div class="highlight-item"><span>Média de gols/jogo</span><strong>${computeKPIs(data).avgGoals}</strong></div>
    <div class="highlight-item"><span>Total de empates</span><strong>${agg.draws}</strong></div>
    <div class="highlight-item"><span>Melhor ataque</span><strong>${agg.attack[0] ? teamName(data, agg.attack[0].id) + ' (' + agg.attack[0].gf + ')' : '—'}</strong></div>
    <div class="highlight-item"><span>Melhor defesa</span><strong>${agg.defense[0] ? teamName(data, agg.defense[0].id) + ' (' + agg.defense[0].ga + ' sofridos)' : '—'}</strong></div>
    <div class="highlight-item"><span>Grupo mais goleador</span><strong>${agg.groupStats.sort((a,b)=>b.goals-a.goals)[0]?.group ?? '—'}</strong></div>
  `;

  const scorers = data.stats.topScorers ?? [];
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

function favBtn(id, state) {
  const active = state.favorites.includes(id) ? 'active' : '';
  return `<button class="fav-star ${active}" data-fav="${id}" title="Favoritar">★</button>`;
}

function renderStandingsTable(data, groupId, standings, state, qualifiedThirds, mini = false, expanded = false, onToggle = null) {
  const progress = groupProgress(data, groupId);
  const groupMatches = data.matches
    .filter((m) => m.phase === 'group' && m.group === groupId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const matchesBlock = !mini && expanded ? `
    <div class="group-matches">
      ${groupMatches.map((m) => `
        <div class="group-match-item">
          <div class="group-match-item__team">
            <img class="flag" src="${flagUrl(data.teamMap[m.home])}" alt="" />
            ${teamName(data, m.home)}
          </div>
          ${scoreEditorHTML(m)}
          <div class="group-match-item__team away">
            <img class="flag" src="${flagUrl(data.teamMap[m.away])}" alt="" />
            ${teamName(data, m.away)}
          </div>
          <span class="status-pill status-pill--${m.status}">${statusLabel(m.status)}</span>
          <div class="group-match-item__meta">Rodada ${m.matchday} · ${formatDate(m.date)} · ${m.time} BRT</div>
        </div>`).join('')}
    </div>` : '';

  const toggleBtn = !mini ? `
    <button type="button" class="expand-btn" data-toggle-group="${groupId}">
      ${expanded ? '▾ Ocultar jogos' : '▸ Editar jogos'} (${progress.done}/${progress.total})
    </button>` : '';

  return `
    <div class="group-card card ${standings.some((s) => isHighlighted(data, state, s.code)) ? 'highlight' : ''}" data-group="${groupId}">
      <div class="card__header" style="padding:0.65rem 0.85rem">
        <h2 style="font-size:0.9rem;margin:0">Grupo ${groupId}</h2>
        <span class="group-card__progress">${progress.done}/${progress.total} jogos</span>
      </div>
      <div style="overflow-x:auto;padding:0 0.5rem 0.5rem">
        <table class="standings">
          <thead><tr>
            <th>Seleção</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th>
            ${mini ? '' : '<th>GP</th><th>GC</th>'}
            <th>SG</th><th>Pts</th>
          </tr></thead>
          <tbody>
            ${standings.map((s, i) => {
              const cls = i < 2 ? 'qualified' : i === 2 && qualifiedThirds?.has(s.code) ? 'third' : '';
              return `<tr class="${cls}">
                <td><div class="team-name">${favBtn(s.code, state)}<img class="flag" src="${flagUrl(data.teamMap[s.code])}" alt="" /><span>${teamName(data, s.code)}</span></div></td>
                <td>${i + 1}º</td><td>${s.played}</td><td>${s.won}</td><td>${s.drawn}</td><td>${s.lost}</td>
                ${mini ? '' : `<td>${s.gf}</td><td>${s.ga}</td>`}
                <td>${s.gd > 0 ? '+' + s.gd : s.gd}</td><td><strong>${s.pts}</strong></td>
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
  bindScoreEditors(document.getElementById('groups-grid'), onScoreSave);

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

function matchListCardHTML(data, state, m) {
  const hl = isHighlighted(data, state, m.home) || isHighlighted(data, state, m.away);
  const today = isToday(m.date);
  const groupLabel = m.group ? ` · Grupo ${m.group}` : '';

  return `
    <article class="match-list-card ${hl ? 'highlight' : ''} ${today ? 'today' : ''}" data-match="${m.id}">
      <div class="match-list-card__head">
        <span class="match-list-card__phase">${phaseLabel(m.phase)}${groupLabel}</span>
        <span class="status-pill status-pill--${m.status}">${statusLabel(m.status)}</span>
      </div>
      <div class="match-list-card__teams">
        <div class="match-list-card__team">
          ${m.home ? `<img class="flag" src="${flagUrl(data.teamMap[m.home])}" alt="" />` : ''}
          <span>${teamName(data, m.home)}</span>
        </div>
        <div class="match-list-card__score">${scoreEditorHTML(m, true)}</div>
        <div class="match-list-card__team away">
          ${m.away ? `<img class="flag" src="${flagUrl(data.teamMap[m.away])}" alt="" />` : ''}
          <span>${teamName(data, m.away)}</span>
        </div>
      </div>
      <div class="match-list-card__meta">
        ${formatDate(m.date)} · ${m.time} BRT${m.venue ? ` · ${m.venue}` : ''}
      </div>
    </article>`;
}

export function renderMatchesTable(data, state) {
  const filtered = filterMatches(data.matches, { ...state.matchFilters, search: state.search });
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
  const rounds = [
    { key: 'r32', title: 'Oitavas (32)' },
    { key: 'r16', title: 'Oitavas (16)' },
    { key: 'qf', title: 'Quartas' },
    { key: 'sf', title: 'Semifinais' },
    { key: 'bronze', title: '3º lugar' },
    { key: 'final', title: 'Final' },
  ];

  document.getElementById('bracket-wrap').innerHTML = `
    <p style="color:var(--text-muted);font-size:0.85rem;margin:0 0 1rem">
      Complete a fase de grupos para preencher confrontos · registre placares para avançar rodadas
    </p>
    <div class="bracket">
      ${rounds.map(({ key, title }) => {
        const ms = data.matches.filter((m) => m.phase === key);
        return `<div class="bracket-round">
          <h3>${title}</h3>
          ${ms.map((m) => {
            const w = getWinner(m);
            const renderT = (code) => {
              if (!code) return '<div class="bracket-team">—</div>';
              return `<div class="bracket-team ${w === code ? 'winner' : ''}"><img class="flag" src="${flagUrl(data.teamMap[code])}" alt="" /> ${teamName(data, code)}</div>`;
            };
            return `<div class="bracket-match">
              <div class="bracket-match__label">${m.label || m.id}</div>
              ${renderT(m.home)}${renderT(m.away)}
              <div class="bracket-score">${scoreEditorHTML(m, true)}</div>
              <div style="font-size:0.65rem;color:var(--text-muted);margin-top:0.25rem">${formatDate(m.date)} · ${m.time}</div>
            </div>`;
          }).join('')}
        </div>`;
      }).join('')}
    </div>`;
}

export function renderTeams(data, state, onTeamClick) {
  const q = state.search.toLowerCase();
  const teams = data.teams
    .filter((t) => !q || t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q))
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));

  document.getElementById('teams-grid').innerHTML = teams.map((t) => {
    const s = teamStats(t.id, data.matches);
    const standings = computeGroupStandings(t.group, data.matches, data.groups.find((g) => g.id === t.group).teams);
    const pos = standings.findIndex((x) => x.code === t.id) + 1;
    const fav = state.favorites.includes(t.id);
    const hl = isHighlighted(data, state, t.id);

    return `<article class="team-card ${fav ? 'favorite' : ''} ${hl ? 'highlight' : ''}" data-team="${t.id}">
      <div class="team-card__head">
        <img src="${flagUrl(t)}" alt="" />
        <div><h3>${t.name}</h3><div class="team-card__meta">Grupo ${t.group} · ${pos}º · ${t.confederation}</div></div>
        <button class="fav-star ${fav ? 'active' : ''}" data-fav="${t.id}">★</button>
      </div>
      <div class="team-stats-row">
        <div><strong>${s.pts}</strong>Pts</div>
        <div><strong>${s.played}</strong>J</div>
        <div><strong>${s.gf}-${s.ga}</strong>Gols</div>
        <div><strong>${s.aproveitamento}%</strong>Aprov.</div>
      </div>
    </article>`;
  }).join('');

  document.getElementById('teams-grid').querySelectorAll('.team-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-fav]')) return;
      onTeamClick(card.dataset.team);
    });
  });

  bindFavButtons(document.getElementById('teams-grid'), state, onFavToggle);

  const selA = document.getElementById('compare-a');
  const selB = document.getElementById('compare-b');
  if (selA.options.length <= 1) {
    data.teams.forEach((t) => {
      selA.add(new Option(t.name, t.id));
      selB.add(new Option(t.name, t.id));
    });
  }
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

export function renderTeamModal(data, teamId) {
  const t = data.teamMap[teamId];
  const s = teamStats(teamId, data.matches);
  const standings = computeGroupStandings(t.group, data.matches, data.groups.find((g) => g.id === t.group).teams);
  const pos = standings.findIndex((x) => x.code === teamId) + 1;
  const teamMatches = data.matches.filter((m) => m.home === teamId || m.away === teamId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  const upcoming = teamMatches.filter((m) => m.status === 'scheduled').reverse();
  const past = teamMatches.filter((m) => m.status === 'finished');

  document.getElementById('modal-team-name').textContent = t.name;
  document.getElementById('modal-team-body').innerHTML = `
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem">
      <img src="${flagUrl(t)}" style="width:56px;height:38px;border-radius:4px" alt="" />
      <div>
        <div>Grupo ${t.group} · ${pos}º lugar · ${t.confederation}</div>
        <div style="color:var(--text-muted);font-size:0.85rem">${s.played} jogos · ${s.pts} pts · SG ${s.gd > 0 ? '+' + s.gd : s.gd}</div>
      </div>
    </div>
    <div class="modal-section"><h4>Próximos jogos</h4>
      ${upcoming.length ? upcoming.slice(0, 3).map((m) => matchRowHTML(data, m, { search: '', favorites: [] }, true)).join('') : '<div class="empty" style="padding:0.5rem">Sem jogos pendentes</div>'}
    </div>
    <div class="modal-section"><h4>Últimos jogos</h4>
      ${past.length ? past.slice(0, 3).map((m) => matchRowHTML(data, m, { search: '', favorites: [] }, true)).join('') : '<div class="empty" style="padding:0.5rem">Sem resultados</div>'}
    </div>`;
}

export function renderCalendar(data, state, onEditMatch) {
  const matches = filterMatches(data.matches, { ...state.matchFilters, search: state.search, phase: 'all', group: 'all', team: 'all', status: 'all', date: '' });
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
  document.getElementById('phase-badge').textContent = text;
}
