/**
 * Status efetivo do jogo com base no horário de Brasília (BRT).
 */
const TZ_OFFSET = '-03:00';
/** Após ~90 min do apito, placar completo no banco = jogo encerrado. */
const MATCH_DURATION_MS = 90 * 60 * 1000;

export function matchKickoff(match) {
  return new Date(`${match.date}T${match.time}:00${TZ_OFFSET}`);
}

function hasFullScore(match) {
  return match.homeScore != null && match.awayScore != null;
}

export function resolveMatchStatus(match, now = new Date(), options = {}) {
  const { allowFutureFinished = false } = options;
  const kickoff = matchKickoff(match);

  if (now < kickoff && !allowFutureFinished) {
    return 'scheduled';
  }

  if (match.status === 'finished') return 'finished';

  if (hasFullScore(match) && now.getTime() >= kickoff.getTime() + MATCH_DURATION_MS) {
    return 'finished';
  }

  if (match.status === 'live') return 'live';
  if (now >= kickoff) return 'live';
  return 'scheduled';
}

export function applyStatuses(matches, now = new Date(), mode = 'real') {
  const allowFutureFinished = mode === 'simulation';
  return matches.map((m) => ({
    ...m,
    status: resolveMatchStatus(m, now, { allowFutureFinished }),
  }));
}
