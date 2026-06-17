/**
 * Orquestrador — modos Real/Simulação com persistência PostgreSQL.
 */
import { loadData } from './data-service.js';
import { computeKPIs, filterMatches, getStatusPhaseLabel } from './engine.js';
import { renderCharts } from './charts.js';
import { resolveKnockoutBracket } from './knockout-resolver.js';
import { applyStatuses } from './match-status.js';
import {
  saveMatchScore, setMatchStatus, savePreferences, clearAllScores,
  fetchSyncStatus, toggleScoreSync, runScoreSyncNow,
} from './api-client.js';
import { fetchCurrentUser, getStoredUser, getToken, logout } from './auth-client.js';
import { buildPermissions } from './permissions.js';
import {
  renderKPIs, renderCountdown, renderOverview, renderGroups,
  renderGroupsFilters, renderMatchesFilters, renderMatchesTable, renderKnockout,
  renderTeams, renderCompare, renderTeamDetail, renderCalendar,
  renderPerformanceRanking, renderTopScorersRanking, setFavToggleHandler, bindOverviewFavs,
  updatePhaseBadge, setScoreSaveHandler, bindScoreEditors, bindMatchActions, updateModeUI,
  openScoreModal, setPermissions,
} from './views.js';
import { renderTeamDetailCharts, destroyTeamCharts } from './team-charts.js';
import { renderPoolApp, initPoolUI, resetPoolUI, updatePoolContext } from './pool-ui.js?v=25';
import { initStickers, renderStickers, setStickersUser } from './stickers-ui.js?v=2';
import { renderAdminSettings, initAdminSettingsUI } from './admin-settings.js';
import { initAudit, renderAudit } from './audit-ui.js?v=1';

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
  selectedTeamId: null,
  offline: false,
  user: null,
  permissions: buildPermissions(null, 'real'),
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
  syncBodyLayoutState();
  applyTheme();
  applySidebarLayout();

  state.user = getStoredUser();
  try {
    const refreshed = await fetchCurrentUser();
    if (refreshed) state.user = refreshed;
  } catch { /* mantém usuário do localStorage se /me falhar */ }
  applyPermissions();

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
  initAuthUI();
  initAdminUI();
  initStickers(document.getElementById('stickers-content'), { showToast, currentUser: state.user });
  initAudit(document.getElementById('audit-content'), { showToast, currentUser: state.user });
  initScoreSync();
  startLiveStatusTicker();
  navigate(state.section);
}

function applyPermissions() {
  if (!state.user && (state.mode === 'simulation' || state.mode === 'pool')) {
    state.mode = 'real';
  }
  state.permissions = buildPermissions(state.user, state.mode);
  setPermissions(state.user, state.mode);
  applyAuthUI();
  updateModeUI(state.mode);
}

function applyAuthUI() {
  const p = state.permissions;
  document.querySelectorAll('.mode-btn--auth').forEach((btn) => {
    btn.hidden = !p.canAccessSimulation;
  });

  document.getElementById('auth-access-btn').hidden = p.isLoggedIn;
  document.getElementById('auth-logout-btn').hidden = !p.isLoggedIn;
  const userWrap = document.getElementById('sidebar-user-wrap');
  const userLabel = document.getElementById('auth-user-label');
  if (p.isLoggedIn) {
    userWrap.hidden = false;
    userLabel.textContent = p.isAdmin ? `${state.user.name} (admin)` : state.user.name;
    userLabel.title = userLabel.textContent;
  } else {
    userWrap.hidden = true;
    userLabel.textContent = '';
    userLabel.title = '';
  }

  document.querySelectorAll('.admin-only').forEach((el) => {
    el.hidden = !p.canManageSync;
  });

  const matchesAdminBar = document.getElementById('matches-admin-bar');
  if (matchesAdminBar) {
    matchesAdminBar.hidden = !p.canManageSync || state.mode !== 'real';
  }

  const matchesSubtitle = document.getElementById('matches-subtitle');
  if (matchesSubtitle) {
    matchesSubtitle.textContent = p.canManageSync && state.mode === 'real'
      ? 'Modo Real — sincronização automática ou edição manual de placares (admin)'
      : state.mode === 'simulation'
        ? 'Simulação — edite placares livremente'
        : 'Placares oficiais · atualização automática via TheSportsDB';
  }

  document.querySelectorAll('.admin-only-nav').forEach((el) => {
    el.hidden = !p.canAccessAdminSettings;
  });

  updateSimActionButtons();
}

function updateSimActionButtons() {
  const visible = state.mode === 'simulation' && state.permissions.canEditScores;
  document.getElementById('sim-test-fill-btn')?.toggleAttribute('hidden', !visible);
  document.getElementById('sim-clear-btn')?.toggleAttribute('hidden', !visible);
}

function initAuthUI() {
  document.getElementById('auth-logout-btn')?.addEventListener('click', logout);
}

async function reloadData() {
  const loadMode = state.mode === 'pool' ? 'real' : state.mode;
  const bundle = await loadData(loadMode);
  if (bundle.user) {
    state.user = bundle.user;
  } else if (!getToken()) {
    state.user = null;
  }
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
  applyPermissions();
}

function refreshComputedData() {
  const statusMode = state.mode === 'pool' ? 'real' : state.mode;
  baseData.matches = applyStatuses(baseData.matches, new Date(), statusMode);
  const matches = resolveKnockoutBracket({ ...baseData, matches: baseData.matches.map((m) => ({ ...m })) });
  data = { ...baseData, matches };
}

function startLiveStatusTicker() {
  if (liveStatusTimer) clearInterval(liveStatusTimer);
  liveStatusTimer = setInterval(() => {
    if (!baseData) return;
    refreshComputedData();
    if (state.mode === 'pool') return;
    renderAll();
  }, 30000);
}

function loadLocalUI() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    state.theme = saved.theme ?? 'dark';
    state.mode = saved.mode ?? 'real';
    if (saved.mode === 'simulation' || saved.mode === 'pool') {
      state.mode = 'real';
    }
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

let poolUIReady = false;
let adminUIReady = false;

function ensurePoolUI() {
  const container = document.getElementById('pool-content');
  if (!container || poolUIReady) return;
  initPoolUI(container, {
    teamMap: data?.teamMap ?? {},
    showToast,
    currentUser: state.user,
  });
  poolUIReady = true;
}

async function showPoolView() {
  ensurePoolUI();
  resetPoolUI();
  document.querySelectorAll('.view').forEach((v) => {
    v.hidden = true;
    v.classList.remove('active');
  });
  const pool = document.getElementById('view-pool');
  pool.hidden = false;
  pool.classList.add('active');
  await renderPoolApp(document.getElementById('pool-content'), {
    teamMap: data?.teamMap ?? {},
    showToast,
    currentUser: state.user,
  });
}
async function setMode(mode) {
  if ((mode === 'simulation' || mode === 'pool') && !state.permissions.canAccessSimulation) {
    showToast('Faça login para acessar Simulação e Bolão');
    window.location.href = '/auth.html';
    return;
  }

  state.mode = mode;
  applyPermissions();
  syncBodyLayoutState();
  applyTheme();
  updateModeUI(mode);

  if (mode === 'pool') {
    saveLocalUI();
    await showPoolView();
    return;
  }

  saveLocalUI();
  await reloadData();
  navigate(state.section);
  schedulePrefsSave();
  showToast(mode === 'real' ? 'Modo Real — visualização' : 'Modo Simulação — edite placares');
}

async function clearSimulationScores() {
  if (state.mode !== 'simulation' || !state.permissions.canEditScores) return;
  if (state.offline) {
    showToast('API offline — inicie o Docker');
    return;
  }

  const finished = data?.matches?.filter((m) => m.status === 'finished').length ?? 0;
  if (!finished) {
    showToast('Não há placares na simulação para limpar');
    return;
  }

  if (!window.confirm(`Apagar todos os ${finished} placar(es) da simulação? Esta ação não afeta o modo Real.`)) {
    return;
  }

  const btn = document.getElementById('sim-clear-btn');
  if (btn) btn.disabled = true;

  try {
    await clearAllScores('simulation');
    await reloadData();
    renderAll();
    showToast('Simulação reiniciada — todos os placares foram removidos');
  } catch (err) {
    showToast(err.message || 'Erro ao limpar simulação');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function fillGroupTestScores() {
  if (state.mode !== 'simulation' || !state.permissions.canEditScores) return;
  if (state.offline) {
    showToast('API offline — inicie o Docker');
    return;
  }
  if (!data?.matches?.length) return;

  const groupMatches = data.matches.filter((m) => m.phase === 'group');
  if (!groupMatches.length) {
    showToast('Nenhum jogo de fase de grupos encontrado');
    return;
  }

  const btn = document.getElementById('sim-test-fill-btn');
  if (btn) btn.disabled = true;
  showToast(`Gerando ${groupMatches.length} placares aleatórios...`);

  try {
    await Promise.all(groupMatches.map((m) => {
      const home = Math.floor(Math.random() * 5);
      const away = Math.floor(Math.random() * 5);
      return saveMatchScore('simulation', m.id, home, away);
    }));
    await reloadData();
    renderAll();
    showToast('Placares de teste da fase de grupos aplicados');
  } catch (err) {
    showToast(err.message || 'Erro ao gerar placares de teste');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function persistMatchScore(matchId, homeRaw, awayRaw, options = {}) {
  const { quiet = false } = options;
  if (!state.permissions.canEditScores) {
    if (!quiet) showToast('Somente leitura neste modo');
    return;
  }
  if (state.offline) {
    if (!quiet) showToast('API offline — inicie o Docker');
    return;
  }

  try {
    await saveMatchScore(state.mode, matchId, homeRaw, awayRaw);
    await reloadData();
    renderAll();
    if (!quiet) {
      showToast(state.mode === 'simulation'
        ? 'Placar salvo'
        : 'Placar atualizado — use "Encerrar" para finalizar o jogo');
    }
  } catch (err) {
    showToast(err.message);
  }
}

async function setMatchFinished(matchId, finished) {
  if (!state.permissions.canEditScores) {
    showToast('Somente leitura neste modo');
    return;
  }
  if (state.offline) {
    showToast('API offline — inicie o Docker');
    return;
  }
  try {
    await setMatchStatus(state.mode, matchId, finished ? 'finished' : 'live');
    await reloadData();
    renderAll();
    showToast(finished ? 'Jogo encerrado' : 'Jogo reaberto — em andamento');
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
  const collapseBtn = document.getElementById('sidebar-collapse-btn');

  if (collapseBtn) {
    if (mobile) {
      const open = document.body.classList.contains('sidebar-open');
      collapseBtn.setAttribute('aria-expanded', String(open));
      collapseBtn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      collapseBtn.title = open ? 'Fechar menu' : 'Abrir menu';
    } else {
      collapseBtn.setAttribute('aria-expanded', String(!collapsed));
      collapseBtn.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Retrair menu');
      collapseBtn.title = collapsed ? 'Expandir menu' : 'Retrair menu';
    }
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

function initAdminUI() {
  const container = document.getElementById('settings-content');
  if (!container || adminUIReady) return;
  initAdminSettingsUI(container, { showToast });
  adminUIReady = true;
}

function initNavigation() {
  document.querySelectorAll('.nav-link[data-section]').forEach((link) => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const section = link.dataset.section;
      if (!section) return;
      if (state.mode === 'pool') {
        state.mode = 'real';
        applyPermissions();
        applyTheme();
        updateModeUI('real');
        await reloadData();
      }
      if ((section === 'settings' || section === 'audit') && !state.permissions.canAccessAdminSettings) {
        showToast('Acesso restrito a administradores');
        return;
      }
      if (section === 'teams') state.selectedTeamId = null;
      navigate(section);
      if (isMobileSidebar()) setSidebarOpen(false);
    });
  });

  window.addEventListener('hashchange', () => {
    const sec = location.hash.replace('#', '');
    if (sec) navigate(sec, false);
  });
}

function navigate(section, pushHash = true) {
  if (state.mode === 'pool') return;

  if ((section === 'settings' || section === 'audit') && !state.permissions.canAccessAdminSettings) {
    section = 'overview';
  }

  if (section !== 'teams') {
    state.selectedTeamId = null;
    destroyTeamCharts();
  }

  state.section = section;
  if (pushHash) history.replaceState(null, '', `#${section}`);

  syncBodyLayoutState();
  updateStatusBarVisibility();

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

function syncBodyLayoutState() {
  document.body.dataset.section = state.mode === 'pool' ? 'pool' : state.section;
}

function updateStatusBarVisibility() {
  syncBodyLayoutState();
  const bar = document.getElementById('status-bar');
  if (!bar) return;
  const show = state.mode !== 'pool' && (state.section === 'overview' || state.section === 'matches');
  bar.hidden = !show;
}

function updateSyncUI(status) {
  const toggle = document.getElementById('sync-toggle');
  const label = document.getElementById('sync-toggle-label');
  const statusBar = document.getElementById('status-bar');
  const statusText = document.getElementById('sync-status-text');
  if (!toggle || !statusBar || !statusText) return;

  state.syncEnabled = Boolean(status?.enabled);
  toggle.classList.toggle('active', state.syncEnabled);
  const syncLabel = state.syncEnabled ? 'Sync ligado' : 'Sync desligado';
  if (label) label.textContent = syncLabel;
  toggle.setAttribute('aria-label', syncLabel);
  toggle.title = state.syncEnabled
    ? 'Desligar sync automático (TheSportsDB)'
    : 'Ligar sync automático — placares parciais e finais (TheSportsDB)';

  statusBar.classList.remove('status-bar--sync-on', 'status-bar--sync-off', 'status-bar--sync-error');

  if (status?.rateLimited) {
    statusBar.classList.add('status-bar--sync-on');
    const until = status.rateLimitedUntil ? formatSyncTime(status.rateLimitedUntil) : 'em breve';
    statusText.textContent = `Sync pausado — limite temporário da API (retoma ~${until})`;
  } else if (status?.lastError) {
    statusBar.classList.add('status-bar--sync-error');
    statusText.textContent = `Erro na sync: ${status.lastError}`;
  } else if (state.syncEnabled) {
    statusBar.classList.add('status-bar--sync-on');
    statusText.textContent = `Sync ativo · última: ${formatSyncTime(status.lastOkAt)}`;
  } else {
    statusBar.classList.add('status-bar--sync-off');
    statusText.textContent = 'Sync automático desligado';
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
      if (state.mode === 'pool') {
        updatePoolContext({ teamMap: data?.teamMap ?? {}, showToast, currentUser: state.user });
      } else {
        renderAll();
      }
      showToast(`${status.lastUpdated} placar(es) sincronizado(s) automaticamente`);
    }
  } catch { /* ignore */ }
}

function startSyncPoll() {
  if (syncPollTimer) clearInterval(syncPollTimer);
  syncPollTimer = setInterval(() => refreshSyncStatus(true), 60000);
}

function initScoreSync() {
  if (!state.permissions.canManageSync) return;
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
        if (state.mode === 'pool') {
          updatePoolContext({ teamMap: data?.teamMap ?? {}, showToast, currentUser: state.user });
        } else {
          renderAll();
        }
      }
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('sync-run-btn')?.addEventListener('click', () => runManualScoreSync());

  document.getElementById('matches-sync-btn')?.addEventListener('click', () => runManualScoreSync());
}

async function runManualScoreSync() {
  if (state.offline) {
    showToast('API offline — inicie o Docker');
    return;
  }
  if (!state.permissions.canManageSync) {
    showToast('Somente administradores podem sincronizar');
    return;
  }
  showToast('Sincronizando placares...');
  try {
    const result = await runScoreSyncNow();
    updateSyncUI(result);
    if (result.updated > 0) {
      await reloadData();
      if (state.mode === 'pool') {
        updatePoolContext({ teamMap: data?.teamMap ?? {}, showToast, currentUser: state.user });
      } else {
        renderAll();
      }
      showToast(`${result.updated} placar(es) atualizado(s)`);
    } else if (result.skipped) {
      showToast('Sync desligada — ligue no botão ⚡ da barra superior');
    } else if (result.reason === 'already_running') {
      showToast('Sync já em andamento');
    } else {
      showToast(result.error || 'Nenhum placar novo na API — use edição manual no jogo');
    }
  } catch (err) {
    showToast(err.message);
  }
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

  document.getElementById('sidebar-collapse-btn')?.addEventListener('click', toggleSidebar);

  document.body.addEventListener('click', (e) => {
    if (!document.body.classList.contains('sidebar-open')) return;
    if (e.target.closest('#sidebar') || e.target.closest('#sidebar-collapse-btn')) return;
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
    if (state.mode === 'pool') return;
    renderAll();
  });

  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
      setMode(btn.dataset.mode);
    });
  });

  document.getElementById('sim-test-fill-btn')?.addEventListener('click', fillGroupTestScores);
  document.getElementById('sim-clear-btn')?.addEventListener('click', clearSimulationScores);

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
  if (!state.permissions.canFavorite) return;
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
  if (!baseData) return;
  refreshComputedData();
  if (!data) return;
  if (state.mode === 'pool') {
    updateStatusBarVisibility();
    updatePoolContext({
      teamMap: data.teamMap ?? {},
      showToast,
      currentUser: state.user,
    });
    return;
  }

  updateStatusBarVisibility();
  updatePhaseBadge(getStatusPhaseLabel(data.matches, data.tournament));

  if (state.section === 'overview') {
    renderKPIs(data, document.getElementById('kpi-strip'));
    renderCountdown(data, document.getElementById('next-countdown'));
  }

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
      bindScoreEditors(document.getElementById('matches-table-wrap'), persistMatchScore, {
        autoSave: state.mode === 'simulation',
      });
      bindMatchActions(document.getElementById('matches-table-wrap'), {
        onFinish: (id) => setMatchFinished(id, true),
        onReopen: (id) => setMatchFinished(id, false),
      });
      break;
    case 'knockout':
      renderKnockout(data, state);
      bindScoreEditors(document.getElementById('bracket-wrap'), persistMatchScore, {
        autoSave: state.mode === 'simulation',
      });
      break;
    case 'teams':
      if (state.selectedTeamId) {
        renderTeamDetail(data, state, state.selectedTeamId, backToTeamsList);
        renderTeamDetailCharts(state.selectedTeamId, data);
      } else {
        destroyTeamCharts();
        renderTeams(data, state, openTeamDetail);
      }
      break;
    case 'stats':
      renderCharts(data);
      renderPerformanceRanking(data);
      renderTopScorersRanking(data);
      chartsRendered = true;
      break;
    case 'calendar':
      renderCalendar(data, state, openScoreModal);
      break;
    case 'stickers':
      setStickersUser(state.user);
      renderStickers({ currentUser: state.user, showToast });
      break;
    case 'settings':
      renderAdminSettings(document.getElementById('settings-content'), {
        showToast,
        currentUser: state.user,
      });
      break;
    case 'audit':
      renderAudit({ currentUser: state.user, showToast });
      break;
  }
}

function openTeamDetail(teamId) {
  state.selectedTeamId = teamId;
  renderAll();
}

function backToTeamsList() {
  state.selectedTeamId = null;
  destroyTeamCharts();
  renderAll();
}

async function exportCurrent() {
  const payload = {
    mode: state.mode,
    exportedAt: new Date().toISOString(),
    matches: filterMatches(data.matches, { ...state.matchFilters, search: state.search }, data.teamMap),
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
