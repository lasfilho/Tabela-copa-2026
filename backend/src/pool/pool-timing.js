/**
 * Regras temporais do bolão — timezone America/Sao_Paulo (BRT, UTC-3).
 * Documentação: todos os prazos usam o horário de Brasília.
 */
const TZ_OFFSET = '-03:00';
export const JOIN_PREDICTION_BUFFER_MS = 30 * 60 * 1000; // 30 minutos

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

export function daysBeforeFirstMatch(firstKickoff, now = new Date()) {
  const firstDay = toBrtDateString(firstKickoff);
  const nowDay = toBrtDateString(now);
  const a = new Date(`${firstDay}T12:00:00${TZ_OFFSET}`);
  const b = new Date(`${nowDay}T12:00:00${TZ_OFFSET}`);
  return Math.floor((a - b) / (24 * 60 * 60 * 1000));
}

/** Bolão deve ser criado no mínimo no dia anterior à primeira partida. */
export function canCreatePoolWithMatches(matches, now = new Date()) {
  if (!matches?.length) return { ok: false, reason: 'Selecione ao menos uma partida' };
  const sorted = [...matches].sort((a, b) => matchKickoff(a) - matchKickoff(b));
  const first = sorted[0];
  const kickoff = matchKickoff(first);
  const days = daysBeforeFirstMatch(kickoff, now);
  if (days < 1) {
    return {
      ok: false,
      reason: 'O bolão deve ser criado até o dia anterior à primeira partida incluída',
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
  const ruleDeadline = new Date(firstKickoff.getTime() - JOIN_PREDICTION_BUFFER_MS);
  if (!customDeadline) return ruleDeadline;
  const custom = new Date(customDeadline);
  return custom < ruleDeadline ? custom : ruleDeadline;
}

export function canJoinPool(matches, joinDeadline, now = new Date()) {
  const deadline = joinDeadline ? new Date(joinDeadline) : joinDeadlineForMatches(matches);
  if (now > deadline) {
    return { ok: false, reason: 'Este bolão não aceita mais adesões' };
  }
  return { ok: true, deadline };
}

export function canEditPrediction(match, now = new Date()) {
  const kickoff = matchKickoff(match);
  const lockAt = new Date(kickoff.getTime() - JOIN_PREDICTION_BUFFER_MS);
  if (now >= kickoff) {
    return { ok: false, reason: 'Esta partida já começou — palpite bloqueado' };
  }
  if (now > lockAt) {
    return { ok: false, reason: 'Esta partida já ultrapassou o limite para palpites' };
  }
  if (match.status === 'live' || match.status === 'finished') {
    return { ok: false, reason: 'Palpite bloqueado — partida em andamento ou encerrada' };
  }
  return { ok: true, lockAt };
}

export function formatBrt(date) {
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
