/** Métricas de observabilidade das chamadas à TheSportsDB. */
const state = {
  requests: 0,
  errors: 0,
  rateLimited: 0,
  cacheHits: 0,
  cacheMisses: 0,
  staleFallbacks: 0,
  retries: 0,
  totalLatencyMs: 0,
  byEndpoint: {},
  recent: [],
  startedAt: new Date().toISOString(),
};

const MAX_RECENT = 50;

function endpointKey(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.split('/').pop() || 'unknown';
    return path.replace('.php', '');
  } catch {
    return 'unknown';
  }
}

export function recordRequest({ url, latencyMs, ok, fromCache, stale, rateLimited, retried }) {
  const ep = endpointKey(url);
  if (!state.byEndpoint[ep]) {
    state.byEndpoint[ep] = { requests: 0, errors: 0, cacheHits: 0, avgLatencyMs: 0, totalLatencyMs: 0 };
  }
  const bucket = state.byEndpoint[ep];

  if (fromCache) {
    state.cacheHits += 1;
    bucket.cacheHits += 1;
    return;
  }

  state.requests += 1;
  state.cacheMisses += 1;
  bucket.requests += 1;
  bucket.totalLatencyMs += latencyMs;
  bucket.avgLatencyMs = Math.round(bucket.totalLatencyMs / bucket.requests);

  state.totalLatencyMs += latencyMs;
  if (!ok) state.errors += 1;
  if (rateLimited) state.rateLimited += 1;
  if (stale) state.staleFallbacks += 1;
  if (retried) state.retries += 1;
  if (!ok) bucket.errors += 1;

  state.recent.unshift({
    at: new Date().toISOString(),
    endpoint: ep,
    latencyMs,
    ok,
    stale: Boolean(stale),
    rateLimited: Boolean(rateLimited),
  });
  if (state.recent.length > MAX_RECENT) state.recent.length = MAX_RECENT;
}

export function getMetricsSnapshot(config) {
  const windowMs = 60_000;
  const cutoff = Date.now() - windowMs;
  const recentInWindow = state.recent.filter((r) => new Date(r.at).getTime() >= cutoff && !r.stale);
  const requestsLastMinute = recentInWindow.length;
  const maxPerMinute = config?.maxPerMinute ?? 28;

  return {
    ...state,
    avgLatencyMs: state.requests ? Math.round(state.totalLatencyMs / state.requests) : 0,
    requestsLastMinute,
    limitPerMinute: maxPerMinute,
    nearLimit: requestsLastMinute >= maxPerMinute * 0.8,
    utilizationPct: Math.round((requestsLastMinute / maxPerMinute) * 100),
  };
}

export function resetMetrics() {
  state.requests = 0;
  state.errors = 0;
  state.rateLimited = 0;
  state.cacheHits = 0;
  state.cacheMisses = 0;
  state.staleFallbacks = 0;
  state.retries = 0;
  state.totalLatencyMs = 0;
  state.byEndpoint = {};
  state.recent = [];
  state.startedAt = new Date().toISOString();
}
