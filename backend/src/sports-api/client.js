/**
 * Cliente central TheSportsDB — fila, rate limit, cache, retry, métricas e stale fallback.
 */
import { getSportsApiConfig } from './config.js';
import { cacheGet, cacheGetStale, cacheSet } from './cache.js';
import { recordRequest, getMetricsSnapshot } from './metrics.js';
import { RateLimiter } from './rate-limiter.js';
import {
  buildSeasonEventsUrl,
  buildTimelineUrl,
  buildSearchPlayersUrl,
  CACHE_KEYS,
} from './endpoints.js';

let backoffUntil = 0;
let limiter = null;

function getLimiter() {
  if (!limiter) {
    const cfg = getSportsApiConfig();
    limiter = new RateLimiter({
      minIntervalMs: cfg.minIntervalMs,
      maxPerMinute: cfg.maxPerMinute,
    });
  }
  return limiter;
}

export function isSportsDbRateLimited() {
  return Date.now() < backoffUntil;
}

export function markSportsDbRateLimited(minutes) {
  const cfg = getSportsApiConfig();
  backoffUntil = Date.now() + (minutes ?? cfg.backoffMinutes) * 60 * 1000;
}

export function getSportsDbRateLimitUntil() {
  return backoffUntil > Date.now() ? new Date(backoffUntil).toISOString() : null;
}

function logVerbose(...args) {
  const cfg = getSportsApiConfig();
  if (cfg.verboseLogs) console.log('[sports-api]', ...args);
}

async function fetchJsonOnce(url, timeout) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (res.status === 429) {
    markSportsDbRateLimited();
    return { ok: false, rateLimited: true, status: 429 };
  }
  if (!res.ok) {
    return { ok: false, error: `TheSportsDB HTTP ${res.status}`, status: res.status };
  }
  const text = await res.text();
  if (text.startsWith('<!')) {
    return { ok: false, error: 'TheSportsDB resposta inválida (HTML)' };
  }
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, error: 'TheSportsDB JSON inválido' };
  }
}

/**
 * Requisição genérica com cache, fila, retry e fallback stale.
 * @returns {{ ok: boolean, data?: object, rateLimited?: boolean, error?: string, fromCache?: boolean, stale?: boolean }}
 */
export async function sportsApiRequest(url, {
  cacheKey = null,
  cacheTtlMs = 0,
  timeout = null,
  allowStaleOnError = true,
} = {}) {
  const cfg = getSportsApiConfig();
  const t = timeout ?? cfg.defaultTimeout;

  if (cacheKey && cfg.cacheEnabled) {
    const cached = cacheGet(cacheKey);
    if (cached) {
      recordRequest({ url, latencyMs: 0, ok: true, fromCache: true });
      logVerbose('CACHE HIT', cacheKey);
      return { ok: true, data: cached, fromCache: true };
    }
  }

  if (isSportsDbRateLimited()) {
    const stale = allowStaleOnError && cacheKey ? cacheGetStale(cacheKey) : null;
    if (stale) {
      recordRequest({ url, latencyMs: 0, ok: true, stale: true, rateLimited: true });
      logVerbose('STALE FALLBACK (rate limit)', cacheKey);
      return { ok: true, data: stale, stale: true, rateLimited: true };
    }
    return { ok: false, rateLimited: true };
  }

  let lastError = null;
  let retried = false;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt += 1) {
    if (attempt > 0) retried = true;
    const started = Date.now();

    try {
      const result = await getLimiter().schedule(() => fetchJsonOnce(url, t));
      const latencyMs = Date.now() - started;

      if (result.rateLimited) {
        recordRequest({ url, latencyMs, ok: false, rateLimited: true, retried: attempt > 0 });
        const stale = allowStaleOnError && cacheKey ? cacheGetStale(cacheKey) : null;
        if (stale) {
          recordRequest({ url, latencyMs: 0, ok: true, stale: true, rateLimited: true });
          return { ok: true, data: stale, stale: true, rateLimited: true };
        }
        return result;
      }

      if (!result.ok) {
        lastError = result.error;
        recordRequest({ url, latencyMs, ok: false, retried: attempt > 0 });
        if (attempt < cfg.maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        break;
      }

      recordRequest({ url, latencyMs, ok: true, retried: attempt > 0 });
      if (cacheKey && cfg.cacheEnabled && cacheTtlMs > 0) {
        cacheSet(cacheKey, result.data, cacheTtlMs);
      }
      return { ok: true, data: result.data };
    } catch (err) {
      lastError = err.message;
      recordRequest({ url, latencyMs: Date.now() - started, ok: false, retried: attempt > 0 });
      if (attempt < cfg.maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }

  const stale = allowStaleOnError && cacheKey ? cacheGetStale(cacheKey) : null;
  if (stale) {
    recordRequest({ url, latencyMs: 0, ok: true, stale: true });
    logVerbose('STALE FALLBACK (error)', cacheKey, lastError);
    return { ok: true, data: stale, stale: true, error: lastError };
  }

  return { ok: false, error: lastError || 'TheSportsDB indisponível' };
}

/** Compatibilidade com código legado. */
export async function fetchSportsDbJson(url, options = {}) {
  return sportsApiRequest(url, {
    timeout: options.timeout,
    cacheKey: options.cacheKey ?? null,
    cacheTtlMs: options.cacheTtlMs ?? 0,
    allowStaleOnError: options.allowStaleOnError !== false,
  });
}

export async function getSeasonEvents() {
  const cfg = getSportsApiConfig();
  const url = buildSeasonEventsUrl(cfg);
  const result = await sportsApiRequest(url, {
    cacheKey: CACHE_KEYS.seasonEvents(cfg),
    cacheTtlMs: cfg.ttl.seasonEvents,
  });
  if (!result.ok) return result;
  return { ...result, events: result.data?.events ?? [] };
}

export async function getEventTimeline(idEvent, { isLive = false } = {}) {
  if (!idEvent) return { ok: false, events: [], error: 'no_event_id' };
  const cfg = getSportsApiConfig();
  const url = buildTimelineUrl(idEvent, cfg);
  const ttl = isLive ? cfg.ttl.timelineLive : cfg.ttl.timeline;
  const result = await sportsApiRequest(url, {
    cacheKey: CACHE_KEYS.timeline(idEvent),
    cacheTtlMs: ttl,
    timeout: 20000,
  });
  if (!result.ok) return { ...result, timeline: [] };
  return { ...result, timeline: result.data?.timeline ?? [] };
}

export async function searchPlayers(query) {
  if (!query?.trim()) return { ok: false, players: [] };
  const cfg = getSportsApiConfig();
  const url = buildSearchPlayersUrl(query.trim(), cfg);
  const result = await sportsApiRequest(url, {
    cacheKey: CACHE_KEYS.searchPlayers(query),
    cacheTtlMs: cfg.ttl.searchPlayers,
    timeout: 20000,
  });
  if (!result.ok) return { ...result, players: [] };
  return { ...result, players: result.data?.player ?? [] };
}

export function getSportsApiStatus() {
  const cfg = getSportsApiConfig();
  return {
    rateLimited: isSportsDbRateLimited(),
    rateLimitedUntil: getSportsDbRateLimitUntil(),
    cacheEnabled: cfg.cacheEnabled,
    limiter: getLimiter().getStats(),
    metrics: getMetricsSnapshot(cfg),
  };
}

export { getMetricsSnapshot } from './metrics.js';
export { cacheStats, cacheClear } from './cache.js';
