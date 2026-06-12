/**
 * Cliente HTTP — persistência no PostgreSQL via API.
 */
const API = '/api';

async function request(url, options = {}) {
  const res = await fetch(`${API}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchBootstrap(mode = 'real') {
  const raw = await request(`/bootstrap?mode=${mode}`);
  const teamMap = Object.fromEntries(raw.teams.map((t) => [t.id, t]));
  return {
    tournament: raw.tournament,
    teams: raw.teams,
    teamMap,
    groups: raw.groups,
    matches: raw.matches,
    stats: raw.stats,
    preferences: {
      theme: raw.preferences?.theme ?? 'dark',
      favorites: raw.preferences?.favorites ?? [],
      expandedGroups: raw.preferences?.expanded_groups ?? [],
      activeMode: raw.preferences?.active_mode ?? 'real',
    },
    mode: raw.mode,
  };
}

export async function saveMatchScore(mode, matchId, homeScore, awayScore) {
  return request(`/matches/${matchId}/score`, {
    method: 'PUT',
    body: JSON.stringify({ mode, homeScore, awayScore }),
  });
}

export async function clearAllScores(mode) {
  return request(`/scores?mode=${mode}`, { method: 'DELETE' });
}

export async function exportScores(mode) {
  return request(`/scores/export?mode=${mode}`);
}

export async function savePreferences(prefs) {
  return request('/preferences', {
    method: 'PUT',
    body: JSON.stringify({
      theme: prefs.theme,
      favorites: prefs.favorites,
      expandedGroups: prefs.expandedGroups,
      activeMode: prefs.mode,
    }),
  });
}

export async function checkHealth() {
  try {
    const r = await request('/health');
    return r.ok;
  } catch {
    return false;
  }
}

export async function fetchSyncStatus() {
  return request('/sync/status');
}

export async function toggleScoreSync(enabled) {
  return request('/sync/toggle', {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  });
}

export async function runScoreSyncNow() {
  return request('/sync/run', { method: 'POST' });
}
