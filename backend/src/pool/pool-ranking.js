import { query, withTransaction } from '../db.js';
import {
  getPoolById, fetchPoolMatches, getPoolScoreRules, updatePoolStatusAuto,
  getPoolsContainingMatch,
} from './pool-service.js';
import { calculatePredictionPoints, normalizeRules } from './pool-rules.js';
import { canEditPrediction, matchKickoff } from './pool-timing.js';
import { resolveMatchStatus } from '../match-status.js';

/** Recalcula pontos e ranking de um bolão — idempotente. */
export async function recalculatePoolRanking(poolId) {
  const pool = await getPoolById(poolId);
  if (!pool) return;

  const rulesRow = await getPoolScoreRules(poolId);
  const rules = normalizeRules(rulesRow?.rules);

  const matches = await fetchPoolMatches(poolId);
  const { rows: results } = await query(
    `SELECT mr.match_id, mr.home_score, mr.away_score, mr.status
     FROM match_results mr
     JOIN pool_matches pm ON pm.match_id = mr.match_id
     WHERE pm.pool_id = $1 AND mr.mode = 'real'`,
    [poolId]
  );
  const resultMap = Object.fromEntries(results.map((r) => [r.match_id, r]));

  const now = new Date();

  await withTransaction(async (client) => {
    const { rows: participants } = await client.query(
      `SELECT id FROM pool_participants WHERE pool_id = $1`,
      [poolId]
    );

    for (const part of participants) {
      const { rows: preds } = await client.query(
        `SELECT * FROM pool_predictions WHERE participant_id = $1`,
        [part.id]
      );

      let totalPoints = 0;
      let exactHits = 0;
      let resultHits = 0;
      let predictionsCount = preds.length;

      for (const pred of preds) {
        const matchRow = matches.find((m) => m.id === pred.match_id);
        const kickoff = matchKickoff(matchRow);
        const result = resultMap[pred.match_id];
        const status = resolveMatchStatus({
          date: matchRow.match_date,
          time: matchRow.match_time?.slice?.(0, 5),
          status: result?.status ?? 'scheduled',
        });

        const editCheck = canEditPrediction({
          match_date: matchRow.match_date,
          match_time: matchRow.match_time,
          status,
        }, now);

        if (!editCheck.ok && now >= kickoff) {
          await client.query(
            `UPDATE pool_predictions SET locked_at = COALESCE(locked_at, NOW()) WHERE id = $1`,
            [pred.id]
          );
        }

        let points = 0;
        let exact = false;
        let resultHit = false;

        if (result && result.home_score != null && result.away_score != null && status === 'finished') {
          const calc = calculatePredictionPoints(
            { home_score: pred.home_score, away_score: pred.away_score },
            { homeScore: result.home_score, awayScore: result.away_score, phase: matchRow.phase },
            rules
          );
          points = calc.points;
          exact = calc.exact;
          resultHit = calc.resultHit;
        }

        await client.query(
          `UPDATE pool_predictions SET points_earned = $2 WHERE id = $1`,
          [pred.id, points]
        );

        totalPoints += points;
        if (exact) exactHits += 1;
        if (resultHit) resultHits += 1;
      }

      await client.query(
        `UPDATE pool_participants SET
           total_points = $2, exact_hits = $3, result_hits = $4,
           predictions_count = $5, ranking_updated_at = NOW()
         WHERE id = $1`,
        [part.id, totalPoints, exactHits, resultHits, predictionsCount]
      );
    }

    const { rows: ranked } = await client.query(
      `SELECT id FROM pool_participants
       WHERE pool_id = $1
       ORDER BY total_points DESC, exact_hits DESC, result_hits DESC,
                predictions_count DESC, joined_at ASC`,
      [poolId]
    );

    for (let i = 0; i < ranked.length; i++) {
      await client.query(
        `UPDATE pool_participants SET rank_position = $2 WHERE id = $1`,
        [ranked[i].id, i + 1]
      );
    }
  });

  await updatePoolStatusAuto(poolId);
}

export async function recalculatePoolsForMatch(matchId) {
  const poolIds = await getPoolsContainingMatch(matchId);
  for (const poolId of poolIds) {
    await recalculatePoolRanking(poolId);
  }
}

export async function recalculateAllPools() {
  const { rows } = await query(`SELECT id FROM pools WHERE status != 'archived'`);
  for (const row of rows) {
    await recalculatePoolRanking(row.id);
  }
}

export async function getPoolRanking(poolId, { page = 1, limit = 50 } = {}) {
  const pool = await getPoolById(poolId);
  if (!pool) throw Object.assign(new Error('Bolão não encontrado'), { status: 404 });

  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT pp.id, pp.rank_position, pp.total_points, pp.exact_hits, pp.result_hits,
            pp.predictions_count, pp.joined_at, pp.ranking_updated_at,
            u.name, u.id AS user_id
     FROM pool_participants pp
     JOIN users u ON u.id = pp.user_id
     WHERE pp.pool_id = $1
     ORDER BY pp.rank_position NULLS LAST, pp.total_points DESC
     LIMIT $2 OFFSET $3`,
    [poolId, limit, offset]
  );

  const count = await query(
    `SELECT COUNT(*)::int AS n FROM pool_participants WHERE pool_id = $1`,
    [poolId]
  );

  return {
    pool: { id: pool.id, name: pool.name, slug: pool.slug, status: pool.status },
    items: rows.map((r) => ({
      participantId: r.id,
      rank: r.rank_position,
      name: r.name,
      userId: r.user_id,
      totalPoints: r.total_points,
      exactHits: r.exact_hits,
      resultHits: r.result_hits,
      predictionsCount: r.predictions_count,
      joinedAt: r.joined_at,
      rankingUpdatedAt: r.ranking_updated_at,
    })),
    total: count.rows[0].n,
    page,
    limit,
    updatedAt: rows[0]?.ranking_updated_at ?? null,
  };
}

export async function getRankingEvolution(poolId, participantId) {
  const { rows: preds } = await query(
    `SELECT pp.points_earned, pp.match_id, m.match_date, m.phase, m.label
     FROM pool_predictions pp
     JOIN matches m ON m.id = pp.match_id
     WHERE pp.participant_id = $1 AND pp.pool_id = $2
     ORDER BY m.match_date, m.match_time`,
    [participantId, poolId]
  );

  let cumulative = 0;
  return preds.map((p) => {
    cumulative += p.points_earned ?? 0;
    return {
      matchId: p.match_id,
      label: p.label,
      phase: p.phase,
      date: p.match_date,
      points: p.points_earned ?? 0,
      cumulative,
    };
  });
}
