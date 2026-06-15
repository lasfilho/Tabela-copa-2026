import { resolveMatchStatus } from '../match-status.js';
import {
  matchDateString,
  matchKickoff,
  matchTimeString,
  POOL_CREATE_BUFFER_MS,
} from './pool-timing.js';

/** Partida elegível: agendada e com início em mais de 1 hora (BRT). */
export function isMatchEligibleForPoolCreation(match, now = new Date()) {
  const kickoff = matchKickoff(match);
  if (Number.isNaN(kickoff.getTime())) {
    return { ok: false, reason: 'Data ou horário da partida inválido' };
  }

  const createDeadline = new Date(kickoff.getTime() - POOL_CREATE_BUFFER_MS);
  if (now > createDeadline) {
    return { ok: false, reason: 'Partida com menos de 1 hora para o início' };
  }

  const dateStr = matchDateString(match);
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
