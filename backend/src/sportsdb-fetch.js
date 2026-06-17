/**
 * Re-export do cliente central TheSportsDB (compatibilidade).
 * @see sports-api/client.js
 */
export {
  fetchSportsDbJson,
  isSportsDbRateLimited,
  markSportsDbRateLimited,
  getSportsDbRateLimitUntil,
  getSeasonEvents,
  getEventTimeline,
  searchPlayers,
  getSportsApiStatus,
  getMetricsSnapshot,
} from './sports-api/client.js';
