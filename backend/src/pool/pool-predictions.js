import { query } from '../db.js';
import {
  getPoolById, fetchPoolMatches, isParticipant, audit,
} from './pool-service.js';
import { canEditPrediction } from './pool-timing.js';
import { resolveMatchStatus } from '../match-status.js';

function mapMatchWithStatus(row) {
  const match = {
    id: row.id,
    date: row.match_date?.toISOString?.()?.slice(0, 10) ?? row.match_date,
    time: row.match_time?.slice?.(0, 5) ?? row.match_time,
    match_date: row.match_date,
    match_time: row.match_time,
    status: row.status ?? 'scheduled',
    homeScore: row.home_score,
    awayScore: row.away_score,
  };
  match.status = resolveMatchStatus(match);
  return match;
}

export async function listPredictions(poolId, userId) {
  const participantId = await isParticipant(poolId, userId);
  if (!participantId) throw Object.assign(new Error('Participe do bolão para ver palpites'), { status: 403 });

  const matches = await fetchPoolMatches(poolId);
  const { rows: preds } = await query(
    `SELECT * FROM pool_predictions WHERE participant_id = $1`,
    [participantId]
  );
  const predMap = Object.fromEntries(preds.map((p) => [p.match_id, p]));

  const { rows: results } = await query(
    `SELECT mr.match_id, mr.home_score, mr.away_score, mr.status
     FROM match_results mr
     JOIN pool_matches pm ON pm.match_id = mr.match_id
     WHERE pm.pool_id = $1 AND mr.mode = 'real'`,
    [poolId]
  );
  const resultMap = Object.fromEntries(results.map((r) => [r.match_id, r]));

  return matches.map((m) => {
    const statusMatch = mapMatchWithStatus({ ...m, ...resultMap[m.id] });
    const pred = predMap[m.id];
    const editCheck = canEditPrediction(statusMatch);
    return {
      matchId: m.id,
      label: m.label,
      phase: m.phase,
      group: m.group,
      date: m.match_date,
      time: m.match_time?.slice?.(0, 5),
      homeTeam: m.home_team,
      awayTeam: m.away_team,
      homeName: m.home_name,
      awayName: m.away_name,
      homeFlag: m.home_flag,
      awayFlag: m.away_flag,
      prediction: pred ? {
        id: pred.id,
        homeScore: pred.home_score,
        awayScore: pred.away_score,
        pointsEarned: pred.points_earned,
        lockedAt: pred.locked_at,
        updatedAt: pred.updated_at,
      } : null,
      actual: resultMap[m.id] ? {
        homeScore: resultMap[m.id].home_score,
        awayScore: resultMap[m.id].away_score,
        status: resultMap[m.id].status,
      } : null,
      canEdit: editCheck.ok,
      editBlockedReason: editCheck.ok ? null : editCheck.reason,
    };
  });
}

export async function upsertPrediction(poolId, userId, matchId, homeScore, awayScore) {
  const pool = await getPoolById(poolId);
  if (!pool) throw Object.assign(new Error('Bolão não encontrado'), { status: 404 });
  if (['closed', 'archived'].includes(pool.status)) {
    throw Object.assign(new Error('Bolão encerrado'), { status: 400 });
  }

  const participantId = await isParticipant(poolId, userId);
  if (!participantId) throw Object.assign(new Error('Participe do bolão para palpitar'), { status: 403 });

  const { rows: pmRows } = await query(
    `SELECT 1 FROM pool_matches WHERE pool_id = $1 AND match_id = $2`,
    [poolId, matchId]
  );
  if (!pmRows.length) throw Object.assign(new Error('Partida não faz parte deste bolão'), { status: 400 });

  const { rows: matchRows } = await query(`SELECT * FROM matches WHERE id = $1`, [matchId]);
  const { rows: resultRows } = await query(
    `SELECT status FROM match_results WHERE match_id = $1 AND mode = 'real'`,
    [matchId]
  );
  const match = mapMatchWithStatus({ ...matchRows[0], status: resultRows[0]?.status ?? 'scheduled' });

  const editCheck = canEditPrediction(match);
  if (!editCheck.ok) throw Object.assign(new Error(editCheck.reason), { status: 400 });

  const h = Number(homeScore);
  const a = Number(awayScore);
  if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a > 20 || a < 0 || h > 20) {
    throw Object.assign(new Error('Placar inválido'), { status: 400 });
  }

  const { rows } = await query(
    `INSERT INTO pool_predictions (pool_id, participant_id, match_id, home_score, away_score)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (participant_id, match_id) DO UPDATE SET
       home_score = EXCLUDED.home_score,
       away_score = EXCLUDED.away_score,
       updated_at = NOW()
     RETURNING *`,
    [poolId, participantId, matchId, h, a]
  );

  await audit(poolId, userId, 'prediction.upsert', { matchId, homeScore: h, awayScore: a });
  return rows[0];
}

export async function getParticipantDetail(poolId, participantId, requesterId, opts = {}) {
  const pool = await getPoolById(poolId);
  if (!pool) throw Object.assign(new Error('Bolão não encontrado'), { status: 404 });

  const isPublic = pool.visibility === 'public' && pool.allowPublicListing;
  const isMember = requesterId ? await isParticipant(poolId, requesterId) : null;
  if (!pool.showParticipants && !isMember && !isPublic && !opts.isAdmin) {
    throw Object.assign(new Error('Detalhes do participante não disponíveis'), { status: 403 });
  }

  const { rows: partRows } = await query(
    `SELECT pp.*, u.name, u.email FROM pool_participants pp
     JOIN users u ON u.id = pp.user_id WHERE pp.id = $1 AND pp.pool_id = $2`,
    [participantId, poolId]
  );
  if (!partRows.length) throw Object.assign(new Error('Participante não encontrado'), { status: 404 });

  const { rows: preds } = await query(
    `SELECT pp.*, m.label, m.match_date, m.match_time, m.home_team, m.away_team,
            ht.name AS home_name, ht.flag AS home_flag,
            at.name AS away_name, at.flag AS away_flag
     FROM pool_predictions pp
     JOIN matches m ON m.id = pp.match_id
     LEFT JOIN teams ht ON ht.id = m.home_team
     LEFT JOIN teams at ON at.id = m.away_team
     WHERE pp.participant_id = $1 ORDER BY m.match_date, m.match_time`,
    [participantId]
  );

  return {
    participant: {
      id: partRows[0].id,
      name: partRows[0].name,
      totalPoints: partRows[0].total_points,
      exactHits: partRows[0].exact_hits,
      resultHits: partRows[0].result_hits,
      rankPosition: partRows[0].rank_position,
      joinedAt: partRows[0].joined_at,
    },
    predictions: preds.map((p) => ({
      matchId: p.match_id,
      label: p.label,
      homeTeam: p.home_team,
      awayTeam: p.away_team,
      homeName: p.home_name,
      awayName: p.away_name,
      homeFlag: p.home_flag,
      awayFlag: p.away_flag,
      homeScore: p.home_score,
      awayScore: p.away_score,
      pointsEarned: p.points_earned,
    })),
  };
}
