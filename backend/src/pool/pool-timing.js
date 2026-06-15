/**
 * Regras temporais do bolão — timezone America/Sao_Paulo (BRT, UTC-3).
 * Documentação: todos os prazos usam o horário de Brasília.
 */
const TZ_OFFSET = '-03:00';

/** Criar bolão: até 1h antes da primeira partida. */
export const POOL_CREATE_BUFFER_MS = 60 * 60 * 1000;

/** Adesão e palpites: até 10 min antes do apito inicial. */
export const PREDICTION_LOCK_MS = 10 * 60 * 1000;

/** @deprecated use POOL_CREATE_BUFFER_MS */
export const POOL_DEADLINE_BUFFER_MS = POOL_CREATE_BUFFER_MS;

/** @deprecated use PREDICTION_LOCK_MS */
export const JOIN_PREDICTION_BUFFER_MS = PREDICTION_LOCK_MS;

export function matchDateString(match) {
  const d = match.match_date ?? match.date;
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

export function matchTimeString(match) {
  const t = match.match_time ?? match.time ?? '00:00';
  if (typeof t === 'string') return t.slice(0, 5);
  return String(t).slice(0, 5);
}

export function matchKickoff(match) {
  const date = matchDateString(match);
  const time = matchTimeString(match);
  if (!date) return new Date(Number.NaN);
  return new Date(`${date}T${time}:00${TZ_OFFSET}`);
}

export function toBrtDateString(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/** Bolão pode ser criado até 1 hora antes da primeira partida selecionada. */
export function canCreatePoolWithMatches(matches, now = new Date()) {
  if (!matches?.length) return { ok: false, reason: 'Selecione ao menos uma partida' };
  const sorted = [...matches].sort((a, b) => matchKickoff(a) - matchKickoff(b));
  const kickoff = matchKickoff(sorted[0]);
  if (Number.isNaN(kickoff.getTime())) {
    return { ok: false, reason: 'Data da primeira partida inválida' };
  }
  const createDeadline = new Date(kickoff.getTime() - POOL_CREATE_BUFFER_MS);
  if (now > createDeadline) {
    return {
      ok: false,
      reason: 'O bolão deve ser criado até 1 hora antes da primeira partida incluída',
    };
  }
  return { ok: true, firstKickoff: kickoff };
}

export function joinDeadlineForMatches(matches, customDeadline = null) {
  const sorted = [...matches].sort((a, b) => matchKickoff(a) - matchKickoff(b));
  const firstKickoff = matchKickoff(sorted[0]);
  if (Number.isNaN(firstKickoff.getTime())) {
    throw Object.assign(new Error('Não foi possível calcular o prazo do bolão — data da partida inválida'), { status: 400 });
  }
  const ruleDeadline = new Date(firstKickoff.getTime() - PREDICTION_LOCK_MS);
  if (!customDeadline) return ruleDeadline;
  const custom = new Date(customDeadline);
  return custom < ruleDeadline ? custom : ruleDeadline;
}

export function canJoinPool(matches, joinDeadline, now = new Date()) {
  const deadline = joinDeadline ? new Date(joinDeadline) : joinDeadlineForMatches(matches);
  if (now > deadline) {
    return { ok: false, reason: 'Adesões encerram 10 minutos antes da primeira partida' };
  }
  return { ok: true, deadline };
}

export function canEditPrediction(match, now = new Date()) {
  const kickoff = matchKickoff(match);
  const lockAt = new Date(kickoff.getTime() - PREDICTION_LOCK_MS);
  if (now >= kickoff) {
    return { ok: false, reason: 'Esta partida já começou — palpite bloqueado' };
  }
  if (now > lockAt) {
    return { ok: false, reason: 'Palpites encerram 10 minutos antes do início da partida' };
  }
  if (match.status === 'live' || match.status === 'finished') {
    return { ok: false, reason: 'Palpite bloqueado — partida em andamento ou encerrada' };
  }
  return { ok: true, lockAt };
}

export function formatBrt(date) {
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
