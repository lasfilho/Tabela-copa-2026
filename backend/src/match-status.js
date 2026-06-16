/**
 * Status efetivo do jogo com base no horário de Brasília (BRT).
 * finished → placar registrado | live → dentro da janela do jogo | scheduled → aguardando
 */
import { query } from './db.js';

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

/** Atualiza no banco jogos com placar completo e mais de 90 min do apito. */
export async function finalizeStaleLiveResults(now = new Date()) {
  const { rows } = await query(
    `SELECT mr.match_id, mr.home_score, mr.away_score, mr.status,
            m.match_date, m.match_time
     FROM match_results mr
     JOIN matches m ON m.id = mr.match_id
     WHERE mr.mode = 'real'
       AND mr.status <> 'finished'
       AND mr.home_score IS NOT NULL
       AND mr.away_score IS NOT NULL`
  );

  const matchIds = [];
  for (const row of rows) {
    const match = {
      date: row.match_date.toISOString().slice(0, 10),
      time: row.match_time.slice(0, 5),
      homeScore: row.home_score,
      awayScore: row.away_score,
      status: row.status,
    };
    if (resolveMatchStatus(match, now) !== 'finished') continue;

    await query(
      `UPDATE match_results SET status = 'finished', updated_at = NOW()
       WHERE match_id = $1 AND mode = 'real' AND status <> 'finished'`,
      [row.match_id]
    );
    matchIds.push(row.match_id);
  }

  return { finalized: matchIds.length, matchIds };
}
