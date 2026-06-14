import { resolveMatchStatus } from '../match-status.js';
import { matchDateString, matchTimeString, toBrtDateString } from './pool-timing.js';

/** Partida elegível: status agendado e data posterior a hoje (BRT). */
export function isMatchEligibleForPoolCreation(match, now = new Date()) {
  const dateStr = matchDateString(match);
  const todayBrt = toBrtDateString(now);

  if (!dateStr || dateStr <= todayBrt) {
    return { ok: false, reason: 'Partidas do dia de hoje ou anteriores não podem entrar no bolão' };
  }

  const time = matchTimeString(match);
  const status = resolveMatchStatus(
    { date: dateStr, time, status: match.status ?? 'scheduled' },
    now
  );
  if (status !== 'scheduled') {
    return { ok: false, reason: 'Somente partidas com status agendado são permitidas' };
  }

  return { ok: true };
}

export function filterEligiblePoolMatches(matches, now = new Date()) {
  return matches.filter((m) => isMatchEligibleForPoolCreation(m, now).ok);
}

export function validatePoolMatchIds(matches, now = new Date()) {
  if (!matches?.length) {
    return { ok: false, reason: 'Selecione ao menos uma partida elegível' };
  }
  for (const m of matches) {
    const check = isMatchEligibleForPoolCreation(m, now);
    if (!check.ok) {
      return {
        ok: false,
        reason: `${m.label || m.id}: ${check.reason}`,
      };
    }
  }
  return { ok: true };
}
