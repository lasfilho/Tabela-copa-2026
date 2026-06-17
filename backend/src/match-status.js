/**
 * Status efetivo do jogo com base no horário de Brasília (BRT).
 * finished → placar registrado | live → dentro da janela do jogo | scheduled → aguardando
 */
const TZ_OFFSET = '-03:00';

export function matchKickoff(match) {
  return new Date(`${match.date}T${match.time}:00${TZ_OFFSET}`);
}

export function resolveMatchStatus(match, now = new Date(), options = {}) {
  const { allowFutureFinished = false } = options;
  const kickoff = matchKickoff(match);

  // Encerramento é explícito: vem do sync da API (status finalizado) ou de
  // ação manual do admin. Não inferimos "encerrado" por tempo decorrido,
  // para o admin poder atualizar o placar durante o jogo sem encerrá-lo.
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

/**
 * Mantido por compatibilidade. O encerramento agora é explícito (sync da API
 * ou ação manual do admin), então não há finalização automática por tempo.
 */
export async function finalizeStaleLiveResults() {
  return { finalized: 0, matchIds: [] };
}
