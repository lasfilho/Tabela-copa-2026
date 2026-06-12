/**
 * Status efetivo do jogo com base no horário de Brasília (BRT).
 * finished → placar registrado | live → dentro da janela do jogo | scheduled → aguardando
 */
const TZ_OFFSET = '-03:00';
const MATCH_WINDOW_MS = 135 * 60 * 1000; // ~90 min + intervalo + acréscimos

export function matchKickoff(match) {
  return new Date(`${match.date}T${match.time}:00${TZ_OFFSET}`);
}

export function resolveMatchStatus(match, now = new Date()) {
  if (match.status === 'finished') return 'finished';
  if (match.status === 'live') return 'live';

  const kickoff = matchKickoff(match);
  const endWindow = new Date(kickoff.getTime() + MATCH_WINDOW_MS);

  if (now >= kickoff && now < endWindow) return 'live';
  return 'scheduled';
}

export function applyStatuses(matches, now = new Date()) {
  return matches.map((m) => ({ ...m, status: resolveMatchStatus(m, now) }));
}
