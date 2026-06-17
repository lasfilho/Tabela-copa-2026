/** Configuração central da integração TheSportsDB. */
export function getSportsApiConfig() {
  return {
    apiKey: process.env.SPORTS_API_KEY || '123',
    leagueId: process.env.SPORTSDB_LEAGUE_ID || '4429',
    season: process.env.SPORTSDB_SEASON || '2026',
    baseUrl: 'https://www.thesportsdb.com/api/v1/json',
    minIntervalMs: Number(process.env.SPORTS_API_MIN_INTERVAL_MS || 500),
    maxPerMinute: Number(process.env.SPORTS_API_MAX_PER_MINUTE || 28),
    cacheEnabled: process.env.SPORTS_API_CACHE !== 'false',
    verboseLogs: process.env.SPORTS_API_VERBOSE === 'true',
    defaultTimeout: Number(process.env.SPORTS_API_TIMEOUT_MS || 25000),
    backoffMinutes: Number(process.env.SPORTS_API_BACKOFF_MINUTES || 15),
    maxRetries: Number(process.env.SPORTS_API_MAX_RETRIES || 2),
    ttl: {
      seasonEvents: Number(process.env.SPORTS_CACHE_TTL_SEASON_MS || 4 * 60 * 1000),
      timeline: Number(process.env.SPORTS_CACHE_TTL_TIMELINE_MS || 30 * 60 * 1000),
      timelineLive: Number(process.env.SPORTS_CACHE_TTL_TIMELINE_LIVE_MS || 2 * 60 * 1000),
      searchPlayers: Number(process.env.SPORTS_CACHE_TTL_SEARCH_MS || 24 * 60 * 60 * 1000),
    },
  };
}
