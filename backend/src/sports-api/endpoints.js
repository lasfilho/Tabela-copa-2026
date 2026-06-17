import { getSportsApiConfig } from './config.js';

export function buildSeasonEventsUrl(cfg = getSportsApiConfig()) {
  return `${cfg.baseUrl}/${cfg.apiKey}/eventsseason.php?id=${cfg.leagueId}&s=${cfg.season}`;
}

export function buildTimelineUrl(idEvent, cfg = getSportsApiConfig()) {
  return `${cfg.baseUrl}/${cfg.apiKey}/lookuptimeline.php?id=${idEvent}`;
}

export function buildSearchPlayersUrl(query, cfg = getSportsApiConfig()) {
  return `${cfg.baseUrl}/${cfg.apiKey}/searchplayers.php?p=${encodeURIComponent(query)}`;
}

export const CACHE_KEYS = {
  seasonEvents: (cfg) => `season:${cfg.leagueId}:${cfg.season}`,
  timeline: (idEvent) => `timeline:${idEvent}`,
  searchPlayers: (query) => `search:${query.toLowerCase().trim()}`,
};
