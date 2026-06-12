/**
 * Carrega dados da API (PostgreSQL) com fallback local embutido.
 */
import { fetchBootstrap, checkHealth } from './api-client.js';

export async function loadData(mode = 'real') {
  const online = await checkHealth();
  if (online) {
    return fetchBootstrap(mode);
  }

  // Fallback offline (sem Docker)
  if (!window.COPA_EMBEDDED) {
    throw new Error('API indisponível. Inicie com: docker compose up');
  }
  const raw = window.COPA_EMBEDDED;
  const teamMap = Object.fromEntries(raw.teams.map((t) => [t.id, t]));
  return {
    tournament: raw.tournament,
    teams: raw.teams,
    teamMap,
    groups: raw.groups,
    matches: raw.matches.map((m) => ({ ...m, homeScore: null, awayScore: null, status: 'scheduled' })),
    stats: raw.stats,
    preferences: { theme: 'dark', favorites: [], expandedGroups: [], activeMode: 'real' },
    mode,
    offline: true,
  };
}

export function flagUrl(team) {
  const t = typeof team === 'object' ? team : null;
  const f = t?.flag ?? 'un';
  return `https://flagcdn.com/w40/${f}.png`;
}
