/**
 * Status efetivo do jogo com base no horário de Brasília (BRT).
 */
const TZ_OFFSET = '-03:00';

export function matchKickoff(match) {
  return new Date(`${match.date}T${match.time}:00${TZ_OFFSET}`);
}

export function resolveMatchStatus(match, now = new Date(), options = {}) {
  const { allowFutureFinished = false } = options;
  const kickoff = matchKickoff(match);

  // Encerramento é explícito (sync da API ao finalizar ou admin manualmente).
  if (match.status === 'finished') return 'finished';

  if (now < kickoff && !allowFutureFinished) {
    return 'scheduled';
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
