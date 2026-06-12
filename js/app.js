/**
 * Orquestrador — modos Real/Simulação com persistência PostgreSQL.
 */
import { loadData } from './data-service.js';
import { computeKPIs, filterMatches } from './engine.js';
import { renderCharts } from './charts.js';
import { resolveKnockoutBracket } from './knockout-resolver.js';
import { applyStatuses } from './match-status.js';
import {
  saveMatchScore, clearAllScores, savePreferences,
  fetchSyncStatus, toggleScoreSync, runScoreSyncNow,
} from './api-client.js';
import {
  renderKPIs, renderCountdown, renderOverview, renderGroups,
  renderGroupsFilters, renderMatchesFilters, renderMatchesTable, renderKnockout,
  renderTeams, renderCompare, renderTeamModal, renderCalendar,
  renderPerformanceRanking, setFavToggleHandler, bindOverviewFavs,
  updatePhaseBadge, setScoreSaveHandler, bindScoreEditors, updateModeUI,
  openScoreModal,
} from './views.js';

const STORAGE_KEY = 'copa2026-ui-cache';

const state = {
  section: 'overview',
  mode: 'real',
  theme: 'dark',
  search: '',
  favorites: [],
  expandedGroups: [],
  sidebarCollapsed: false,
  syncEnabled: false,
  groupFilter: 'all',
  groupFavsOnly: false,
  matchFilters: { phase: 'all', group: 'all', team: 'all', date: '', status: 'all' },
  offline: false,
};

let baseData = null;
let data = null;
let chartsRendered = false;
let prefsTimer = null;
let liveStatusTimer = null;
let syncPollTimer = null;
let lastSyncOkAt = null;

async function init() {
  loadLocalUI();
  applyTheme();
  applySidebarLayout();

  try {
    await reloadData();
  } catch (err) {
    document.getElementById('content').innerHTML = `
      <div class="empty" style="padding:3rem">
        <h2>Não foi possível conectar</h2>
        <p>${err.message}</p>
        <p>Inicie o sistema: <code>docker compose up --build</code></p>
        <p>Acesse: <code>http://localhost:3000</code></p>
      </div>`;
    return;
  }

  initNavigation();
  initUI();
  initScoreSync();
  startLiveStatusTicker();
  navigate(state.section);
}

async function reloadData() {
  const bundle = await loadData(state.mode);
  baseData = {
    tournament: bundle.tournament,
    teams: bundle.teams,
    teamMap: bundle.teamMap,
    groups: bundle.groups,
    matches: bundle.matches.map((m) => ({ ...m })),
    stats: bundle.stats,
  };
  state.offline = bundle.offline ?? false;

  if (bundle.preferences) {
    if (bundle.preferences.favorites?.length) state.favorites = bundle.preferences.favorites;
    if (bundle.preferences.expandedGroups?.length) state.expandedGroups = bundle.preferences.expandedGroups;
  }

  refreshComputedData();
}

function refreshComputedData() {
  baseData.matches = applyStatuses(baseData.matches);
  const matches = resolveKnockoutBracket({ ...baseData, matches: baseData.matches.map((m) => ({ ...m })) });
  data = { ...baseData, matches };
}

function startLiveStatusTicker() {
  if (liveStatusTimer) clearInterval(liveStatusTimer);
  liveStatusTimer = setInterval(() => {
    if (!baseData) return;
    refreshComputedData();
    renderAll();
  }, 30000);
}

function loadLocalUI() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    state.theme = saved.theme ?? 'dark';
    state.mode = saved.mode ?? 'real';
    state.section = location.hash.replace('#', '') || saved.section || 'overview';
    state.sidebarCollapsed = saved.sidebarCollapsed ?? false;
  } catch { /* ignore */ }
}

function schedulePrefsSave() {
  if (state.offline) return;
  clearTimeout(prefsTimer);
  prefsTimer = setTimeout(() => {
    savePreferences({
      theme: state.theme,
      favorites: state.favorites,
      expandedGroups: state.expandedGroups,
      mode: state.mode,
    }).catch(() => {});
  }, 400);
}

function saveLocalUI() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    theme: state.theme,
    mode: state.mode,
    section: state.section,
    sidebarCollapsed: state.sidebarCollapsed,
  }));
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  document.body.setAttribute('data-active-mode', state.mode);
  document.querySelector('.theme-toggle__icon').textContent = state.theme === 'dark' ? '☀' : '🌙';
}

async function setMode(mode) {
  state.mode = mode;
  applyTheme();
  updateModeUI(mode);
  saveLocalUI();
  await reloadData();
  renderAll();
  schedulePrefsSave();
  showToast(mode === 'real' ? 'Modo Real — dados do PostgreSQL' : 'Modo Simulação — cenários separados');
}

async function persistMatchScore(matchId, homeRaw, awayRaw) {
  if (state.offline) {
    showToast('API offline — inicie o Docker');
    return;
  }

  try {
    await saveMatchScore(state.mode, matchId, homeRaw, awayRaw);
    await reloadData();
    renderAll();
    showToast('Placar salvo no banco de dados');
  } catch (err) {
    showToast(err.message);
  }
}

function isMobileSidebar() {
  return window.innerWidth <= 900;
}

function setSidebarOpen(open) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  sidebar.classList.toggle('open', open);
  document.body.classList.toggle('sidebar-open', open);
  document.body.style.overflow = open && isMobileSidebar() ? 'hidden' : '';
  updateSidebarToggleLabels();
}

function setSidebarCollapsed(collapsed) {
  state.sidebarCollapsed = collapsed;
  applySidebarLayout();
  saveLocalUI();
}

function applySidebarLayout() {
  if (isMobileSidebar()) {
    document.body.classList.remove('sidebar-collapsed');
  } else {
    document.body.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
    setSidebarOpen(false);
  }
  updateSidebarToggleLabels();
}

function updateSidebarToggleLabels() {
  const collapsed = document.body.classList.contains('sidebar-collapsed');
  const mobile = isMobileSidebar();
  const menuBtn = document.getElementById('menu-btn');
  const collapseBtn = document.getElementById('sidebar-collapse-btn');

  if (menuBtn) {
    if (mobile) {
      const open = document.body.classList.contains('sidebar-open');
      menuBtn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      menuBtn.title = open ? 'Fechar menu' : 'Abrir menu';
    } else {
      menuBtn.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Retrair menu');
      menuBtn.title = collapsed ? 'Expandir menu' : 'Retrair menu';
    }
  }

  if (collapseBtn) {
    collapseBtn.setAttribute('aria-expanded', String(!collapsed));
    collapseBtn.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Retrair menu');
    collapseBtn.title = collapsed ? 'Expandir menu' : 'Retrair menu';
    const label = collapseBtn.querySelector('.nav-label');
    if (label) label.textContent = collapsed ? 'Expandir menu' : 'Retrair menu';
  }
}

function toggleSidebar() {
  if (isMobileSidebar()) {
    const sidebar = document.getElementById('sidebar');
    setSidebarOpen(!sidebar.classList.contains('open'));
  } else {
    setSidebarCollapsed(!state.sidebarCollapsed);
  }
}

function initNavigation() {
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(link.dataset.section);
      if (isMobileSidebar()) setSidebarOpen(false);
    });
  });

  window.addEventListener('hashchange', () => {
    const sec = location.hash.replace('#', '');
    if (sec) navigate(sec, false);
  });
}

function navigate(section, pushHash = true) {
  state.section = section;
  if (pushHash) history.replaceState(null, '', `#${section}`);

  document.querySelectorAll('.nav-link').forEach((l) => {
    l.classList.toggle('active', l.dataset.section === section);
  });

  document.querySelectorAll('.view').forEach((v) => {
    const active = v.dataset.view === section;
    v.classList.toggle('active', active);
    v.hidden = !active;
  });

  renderAll();
  saveLocalUI();
}

function formatSyncTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

function updateSyncUI(status) {
  const toggle = document.getElementById('sync-toggle');
  const label = document.getElementById('sync-toggle-label');
  const banner = document.getElementById('sync-banner');
  const bannerText = document.getElementById('sync-banner-text');
  if (!toggle || !label || !banner || !bannerText) return;

  state.syncEnabled = Boolean(status?.enabled);
  toggle.classList.toggle('active', state.syncEnabled);
  label.textContent = state.syncEnabled ? 'Sync on' : 'Sync off';
  toggle.title = state.syncEnabled
    ? 'Desligar sync (placares parciais e finais)'
    : 'Ligar sync automático — parciais quando a API enviar (TheSportsDB)';

  banner.hidden = false;
  banner.classList.remove('sync-banner--on', 'sync-banner--off', 'sync-banner--error');

  if (status?.lastError) {
    banner.classList.add('sync-banner--error');
    bannerText.textContent = `Erro na sync: ${status.lastError}`;
  } else if (state.syncEnabled) {
    banner.classList.add('sync-banner--on');
    const updated = status.lastUpdated ? ` · ${status.lastUpdated} atualizado(s)` : '';
    const live = status.lastLive ? ` (${status.lastLive} ao vivo)` : '';
    bannerText.textContent = `Sync ativo — placares parciais e finais a cada ${status.intervalMinutes ?? 5} min (TheSportsDB) · última: ${formatSyncTime(status.lastOkAt)}${updated}${live}`;
  } else {
    banner.classList.add('sync-banner--off');
    bannerText.textContent = 'Sync automático desligado — placares só entram manualmente no modo Real';
  }
}

async function refreshSyncStatus(reloadIfUpdated = false) {
  if (state.offline) return;
  try {
    const status = await fetchSyncStatus();
    const prevOk = lastSyncOkAt;
    lastSyncOkAt = status.lastOkAt ?? null;
    updateSyncUI(status);
    if (reloadIfUpdated && status.lastOkAt && status.lastOkAt !== prevOk && status.lastUpdated > 0) {
      await reloadData();
      renderAll();
      showToast(`${status.lastUpdated} placar(es) sincronizado(s) automaticamente`);
    }
  } catch { /* ignore */ }
}

function startSyncPoll() {
  if (syncPollTimer) clearInterval(syncPollTimer);
  syncPollTimer = setInterval(() => refreshSyncStatus(true), 60000);
}

function initScoreSync() {
  refreshSyncStatus(false);
  startSyncPoll();

  document.getElementById('sync-toggle')?.addEventListener('click', async () => {
    if (state.offline) {
      showToast('API offline — inicie o Docker');
      return;
    }
    try {
      const next = !state.syncEnabled;
      const status = await toggleScoreSync(next);
      updateSyncUI(status);
      showToast(next ? 'Sync automático ligado' : 'Sync automático desligado');
      if (next && status.lastUpdated > 0) {
        await reloadData();
        renderAll();
      }
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('sync-run-btn')?.addEventListener('click', async () => {
    if (state.offline) {
      showToast('API offline — inicie o Docker');
      return;
    }
    showToast('Sincronizando placares...');
    try {
      const result = await runScoreSyncNow();
      updateSyncUI(result);
      if (result.updated > 0) {
        await reloadData();
        renderAll();
        showToast(`${result.updated} placar(es) atualizado(s)`);
      } else if (result.skipped) {
        showToast('Sync desligada');
      } else {
        showToast(result.error || 'Nenhum placar novo para importar');
      }
    } catch (err) {
      showToast(err.message);
    }
  });
}

function initUI() {
  updateModeUI(state.mode);
  document.querySelectorAll('.mode-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === state.mode);
  });

  document.getElementById('theme-toggle').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    saveLocalUI();
    schedulePrefsSave();
    if (state.section === 'stats' && chartsRendered) renderCharts(data);
  });

  document.getElementById('menu-btn').addEventListener('click', toggleSidebar);

  document.getElementById('sidebar-collapse-btn')?.addEventListener('click', () => {
    if (!isMobileSidebar()) setSidebarCollapsed(!state.sidebarCollapsed);
  });

  document.body.addEventListener('click', (e) => {
    if (!document.body.classList.contains('sidebar-open')) return;
    if (e.target.closest('#sidebar') || e.target.closest('#menu-btn')) return;
    setSidebarOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.body.classList.contains('sidebar-open')) setSidebarOpen(false);
    }
  });

  window.addEventListener('resize', () => {
    applySidebarLayout();
  });

  document.getElementById('global-search').addEventListener('input', (e) => {
    state.search = e.target.value.trim();
    renderAll();
  });

  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
      setMode(btn.dataset.mode);
    });
  });

  document.getElementById('reset-scores-btn').addEventListener('click', async () => {
    const label = state.mode === 'real' ? 'Real' : 'Simulação';
    if (!confirm(`Limpar TODOS os placares do modo ${label} no banco de dados?`)) return;
    try {
      await clearAllScores(state.mode);
      await reloadData();
      renderAll();
      showToast(`Placares do modo ${label} apagados`);
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('export-btn').addEventListener('click', exportCurrent);

  document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('team-modal').close();
  });

  document.getElementById('score-modal-close').addEventListener('click', () => {
    document.getElementById('score-modal').close();
  });

  document.getElementById('compare-btn').addEventListener('click', () => {
    renderCompare(data, document.getElementById('compare-a').value, document.getElementById('compare-b').value);
  });

  document.querySelectorAll('.card__toggle').forEach((btn) => {
    btn.addEventListener('click', () => btn.closest('.collapsible').classList.toggle('open'));
  });

  setFavToggleHandler(toggleFavorite);
  setScoreSaveHandler(persistMatchScore);
}

function toggleFavorite(teamId) {
  const idx = state.favorites.indexOf(teamId);
  if (idx >= 0) state.favorites.splice(idx, 1);
  else state.favorites.push(teamId);
  schedulePrefsSave();
  showToast(state.favorites.includes(teamId) ? `${data.teamMap[teamId].name} favoritada` : 'Favorito removido');
  renderAll();
}

function toggleGroupExpand(groupId) {
  const idx = state.expandedGroups.indexOf(groupId);
  if (idx >= 0) state.expandedGroups.splice(idx, 1);
  else state.expandedGroups.push(groupId);
  schedulePrefsSave();
  renderGroups(data, state, toggleGroupExpand);
}

function renderAll() {
  if (!data) return;

  renderKPIs(data, document.getElementById('kpi-strip'));
  updatePhaseBadge(computeKPIs(data).currentPhase);
  renderCountdown(data, document.getElementById('next-countdown'));

  switch (state.section) {
    case 'overview':
      renderOverview(data, state);
      bindOverviewFavs(state, toggleFavorite);
      break;
    case 'groups':
      renderGroupsFilters(data, state, () => renderGroups(data, state, toggleGroupExpand));
      renderGroups(data, state, toggleGroupExpand);
      break;
    case 'matches':
      renderMatchesFilters(data, state, () => renderMatchesTable(data, state));
      renderMatchesTable(data, state);
      bindScoreEditors(document.getElementById('matches-table-wrap'), persistMatchScore);
      break;
    case 'knockout':
      renderKnockout(data, state);
      bindScoreEditors(document.getElementById('bracket-wrap'), persistMatchScore);
      break;
    case 'teams':
      renderTeams(data, state, openTeamModal);
      break;
    case 'stats':
      renderCharts(data);
      renderPerformanceRanking(data);
      chartsRendered = true;
      break;
    case 'calendar':
      renderCalendar(data, state, openScoreModal);
      break;
  }
}

function openTeamModal(teamId) {
  renderTeamModal(data, teamId);
  document.getElementById('team-modal').showModal();
}

async function exportCurrent() {
  const payload = {
    mode: state.mode,
    exportedAt: new Date().toISOString(),
    matches: filterMatches(data.matches, { ...state.matchFilters, search: state.search }),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `copa2026-${state.mode}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Exportado');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

init();
