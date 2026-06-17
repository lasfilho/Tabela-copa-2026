/** Cache em memória com suporte a stale fallback. */
const store = new Map();

export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) return null;
  return entry.data;
}

export function cacheGetStale(key) {
  const entry = store.get(key);
  return entry?.data ?? null;
}

export function cacheSet(key, data, ttlMs) {
  store.set(key, { data, expiresAt: Date.now() + ttlMs, storedAt: Date.now() });
}

export function cacheDelete(key) {
  store.delete(key);
}

export function cacheStats() {
  const now = Date.now();
  let valid = 0;
  let stale = 0;
  for (const entry of store.values()) {
    if (now <= entry.expiresAt) valid += 1;
    else stale += 1;
  }
  return { entries: store.size, valid, stale };
}

export function cacheClear() {
  store.clear();
}
