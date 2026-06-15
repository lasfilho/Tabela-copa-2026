/**
 * Cliente TheSportsDB com backoff global para HTTP 429 (rate limit).
 */
let backoffUntil = 0;

export function isSportsDbRateLimited() {
  return Date.now() < backoffUntil;
}

export function markSportsDbRateLimited(minutes = 15) {
  backoffUntil = Date.now() + minutes * 60 * 1000;
}

export function getSportsDbRateLimitUntil() {
  return backoffUntil > Date.now() ? new Date(backoffUntil).toISOString() : null;
}

export async function fetchSportsDbJson(url, options = {}) {
  if (isSportsDbRateLimited()) {
    return { ok: false, rateLimited: true };
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(options.timeout ?? 25000) });

  if (res.status === 429) {
    markSportsDbRateLimited(options.backoffMinutes ?? 15);
    return { ok: false, rateLimited: true };
  }

  if (!res.ok) {
    return { ok: false, error: `TheSportsDB HTTP ${res.status}`, status: res.status };
  }

  try {
    const text = await res.text();
    if (text.startsWith('<!')) {
      return { ok: false, error: 'TheSportsDB resposta inválida' };
    }
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, error: 'TheSportsDB JSON inválido' };
  }
}
