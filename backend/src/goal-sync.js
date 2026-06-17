/**
 * Importa gols por jogo.
 * - openfootball/worldcup.json: grátis, artilheiros completos (Copa 2026).
 * - API-Football (fixtures/events): ao vivo, requer API_FOOTBALL_KEY.
 * - TheSportsDB (lookuptimeline.php): fallback gratuito, frequentemente incompleta.
 */
import { query } from './db.js';
import { recalculatePoolsForMatch } from './pool/pool-ranking.js';
import { teamIdFromSportsDb } from './sportsdb-team-map.js';
import { fetchWorldCupJsonGoals, fetchWorldCupJsonMatches } from './worldcup-json.js';
import { getEventTimeline } from './sportsdb-fetch.js';

function config() {
  return {
    sportsDbKey: process.env.SPORTS_API_KEY || '123',
    apiFootballKey: process.env.API_FOOTBALL_KEY || '',
  };
}

function cleanPlayerName(name) {
  if (!name || name === '0' || name === 'NULL') return null;
  return String(name).trim();
}

function parseMinute(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

function isOwnGoalDetail(detail) {
  return /own\s*goal/i.test(detail || '');
}

/** Time que recebe o gol no placar (considera gol contra). */
export function scoringTeamForGoal(goal, homeId, awayId) {
  if (goal.isOwnGoal) {
    return goal.teamId === homeId ? awayId : homeId;
  }
  return goal.teamId;
}

function countScoringTotals(goals, homeId, awayId) {
  let home = 0;
  let away = 0;
  for (const g of goals) {
    const scoringTeam = scoringTeamForGoal(g, homeId, awayId);
    if (scoringTeam === homeId) home += 1;
    else if (scoringTeam === awayId) away += 1;
  }
  return { home, away };
}

export async function fetchEventTimeline(idEvent, { isLive = false } = {}) {
  const result = await getEventTimeline(idEvent, { isLive });
  if (result.rateLimited || !result.ok) return [];
  return result.timeline ?? [];
}

function parseSportsDbGoals(timeline, homeId, awayId) {
  const goals = [];
  for (const item of timeline) {
    if (item.strTimeline !== 'Goal') continue;

    const player = cleanPlayerName(item.strPlayer);
    if (!player) continue;

    const ownGoal = isOwnGoalDetail(item.strTimelineDetail);
    const isHomeSide = item.strHome === 'Yes';
    const playerTeamId = ownGoal
      ? (isHomeSide ? awayId : homeId)
      : (isHomeSide ? homeId : awayId);

    goals.push({
      externalId: `tsdb-${item.idTimeline}`,
      player,
      teamId: playerTeamId,
      isOwnGoal: ownGoal,
      minute: parseMinute(item.intTime),
      detail: item.strTimelineDetail || null,
      assistPlayer: ownGoal ? null : cleanPlayerName(item.strAssist),
      countsForScorer: !ownGoal,
      source: 'sportsdb',
    });
  }
  return goals;
}

async function fetchApiFootballGoals(fixtureId, homeId, awayId) {
  const { apiFootballKey } = config();
  if (!apiFootballKey || !fixtureId) return [];

  const url = `https://v3.football.api-sports.io/fixtures/events?fixture=${fixtureId}&type=Goal`;
  const res = await fetch(url, {
    headers: { 'x-apisports-key': apiFootballKey },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`API-Football HTTP ${res.status}`);

  const data = await res.json();
  if (data.errors && Object.keys(data.errors).length) {
    throw new Error(`API-Football: ${Object.values(data.errors).join(', ')}`);
  }

  const goals = [];
  for (const item of data.response ?? []) {
    if (item.type !== 'Goal') continue;

    const player = cleanPlayerName(item.player?.name);
    if (!player) continue;

    const ownGoal = isOwnGoalDetail(item.detail);
    const playerTeamId = teamIdFromSportsDb(item.team?.name)
      || (ownGoal ? null : null);

    if (!playerTeamId) continue;

    const minute = parseMinute(item.time?.elapsed);
    const extra = parseMinute(item.time?.extra);
    const assistPlayer = ownGoal ? null : cleanPlayerName(item.assist?.name);

    goals.push({
      externalId: `apifb-${fixtureId}-${minute ?? 'x'}${extra ? `+${extra}` : ''}-${item.player?.id ?? player}`,
      player,
      teamId: playerTeamId,
      isOwnGoal: ownGoal,
      minute: extra != null && minute != null ? minute + extra : minute,
      detail: item.detail || null,
      assistPlayer,
      countsForScorer: !ownGoal,
      source: 'api-football',
    });
  }
  return goals;
}

function scoreGoalCandidate(goals, homeId, awayId, homeScore, awayScore) {
  let score = goals.filter((g) => g.player).length * 10;
  if (homeScore != null && awayScore != null) {
    const totals = countScoringTotals(goals, homeId, awayId);
    if (totals.home === homeScore && totals.away === awayScore) score += 100;
  }
  return score;
}

function pickBestGoalSource(candidates, homeId, awayId, homeScore, awayScore) {
  const withGoals = candidates.filter((c) => c.goals.length);
  if (!withGoals.length) return { goals: [], source: 'none' };

  let best = withGoals[0];
  let bestScore = scoreGoalCandidate(best.goals, homeId, awayId, homeScore, awayScore);

  for (const c of withGoals.slice(1)) {
    const s = scoreGoalCandidate(c.goals, homeId, awayId, homeScore, awayScore);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }

  return best;
}

function reconcileGoalsWithScore(goals, matchId, homeId, awayId, homeScore, awayScore) {
  if (homeScore == null || awayScore == null) return goals;

  const totals = countScoringTotals(goals, homeId, awayId);
  const missingHome = Math.max(0, homeScore - totals.home);
  const missingAway = Math.max(0, awayScore - totals.away);
  if (!missingHome && !missingAway) return goals;

  const reconciled = [...goals];
  let idx = 0;
  const addMissing = (teamId, count) => {
    for (let i = 0; i < count; i += 1) {
      idx += 1;
      reconciled.push({
        externalId: `${matchId}-missing-${teamId}-${idx}`,
        player: null,
        teamId,
        isOwnGoal: false,
        minute: null,
        detail: 'Não detalhado na API',
        assistPlayer: null,
        countsForScorer: false,
        source: 'reconciled',
      });
    }
  };

  addMissing(homeId, missingHome);
  addMissing(awayId, missingAway);
  return reconciled;
}

export async function countScoringGoalsForMatch(matchId, homeId, awayId, homeScore, awayScore) {
  const { rows } = await query(
    `SELECT team_id, is_own_goal FROM match_goals WHERE match_id = $1`,
    [matchId]
  );

  const totals = countScoringTotals(
    rows.map((row) => ({ teamId: row.team_id, isOwnGoal: row.is_own_goal })),
    homeId,
    awayId
  );

  return totals.home === homeScore && totals.away === awayScore;
}

export async function countNamedGoalsForMatch(matchId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM match_goals
     WHERE match_id = $1 AND player IS NOT NULL`,
    [matchId]
  );
  return rows[0].n;
}

export async function shouldResyncMatchGoals(matchId, homeId, awayId, homeScore, awayScore) {
  const totalGoals = (homeScore ?? 0) + (awayScore ?? 0);
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM match_goals WHERE match_id = $1`,
    [matchId]
  );
  if (rows[0].n === 0) return true;

  const scoreComplete = await countScoringGoalsForMatch(matchId, homeId, awayId, homeScore, awayScore);
  if (!scoreComplete) return true;

  const namedGoals = await countNamedGoalsForMatch(matchId);
  return namedGoals < totalGoals;
}

export async function syncMatchGoalsFromEvent(
  matchId,
  idEvent,
  homeId,
  awayId,
  homeScore = null,
  awayScore = null,
  idApiFootball = null,
  matchDate = null
) {
  if (!idEvent && !idApiFootball && !matchDate) return { ok: false, reason: 'no_event_id' };

  let sportsDbGoals = [];
  let timelineEvents = 0;
  if (idEvent) {
    const timeline = await fetchEventTimeline(idEvent);
    timelineEvents = timeline.length;
    sportsDbGoals = parseSportsDbGoals(timeline, homeId, awayId);
  }

  let apiFootballGoals = [];
  try {
    apiFootballGoals = await fetchApiFootballGoals(idApiFootball, homeId, awayId);
  } catch (err) {
    console.warn(`[goals] ${matchId}: API-Football indisponível — ${err.message}`);
  }

  const openFootballGoals = await fetchWorldCupJsonGoals(
    homeId, awayId, matchDate, homeScore, awayScore
  );

  const picked = pickBestGoalSource(
    [
      { goals: openFootballGoals, source: 'openfootball' },
      { goals: apiFootballGoals, source: 'api-football' },
      { goals: sportsDbGoals, source: 'sportsdb' },
    ],
    homeId,
    awayId,
    homeScore,
    awayScore
  );

  let goals = picked.goals;
  const sourceUsed = picked.source;
  goals = reconcileGoalsWithScore(goals, matchId, homeId, awayId, homeScore, awayScore);

  await query(`DELETE FROM match_goals WHERE match_id = $1`, [matchId]);

  for (const g of goals) {
    await query(
      `INSERT INTO match_goals (
         match_id, player, team_id, minute, detail, assist_player,
         is_own_goal, counts_for_scorer, external_id, source
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (match_id, external_id) DO UPDATE SET
         player = EXCLUDED.player,
         team_id = EXCLUDED.team_id,
         minute = EXCLUDED.minute,
         detail = EXCLUDED.detail,
         assist_player = EXCLUDED.assist_player,
         is_own_goal = EXCLUDED.is_own_goal,
         counts_for_scorer = EXCLUDED.counts_for_scorer,
         source = EXCLUDED.source`,
      [
        matchId,
        g.player,
        g.teamId,
        g.minute,
        g.detail,
        g.assistPlayer,
        g.isOwnGoal,
        g.countsForScorer,
        g.externalId,
        g.source,
      ]
    );
  }

  if (goals.length) {
    await recalculateTopScorersFromGoals();
  }

  const detailed = goals.filter((g) => g.player).length;
  const namedScorers = goals.filter((g) => g.countsForScorer && g.player).length;
  const reconciled = Math.max(
    0,
    goals.length - openFootballGoals.length - sportsDbGoals.length - apiFootballGoals.length
  );

  return {
    ok: true,
    goals: goals.length,
    detailedGoals: namedScorers,
    namedGoals: detailed,
    reconciledGoals: reconciled,
    timelineEvents,
    source: sourceUsed,
    usedApiFootball: sourceUsed === 'api-football',
    usedOpenFootball: sourceUsed === 'openfootball',
  };
}

export async function recalculateTopScorersFromGoals() {
  const { rows: countRows } = await query(`SELECT COUNT(*)::int AS n FROM match_goals`);
  if (countRows[0].n === 0) return { updated: false, reason: 'no_goals' };

  await query(`DELETE FROM top_scorers`);

  await query(`
    WITH goal_counts AS (
      SELECT player, team_id, COUNT(*)::smallint AS goals
      FROM match_goals
      WHERE team_id IS NOT NULL
        AND player IS NOT NULL
        AND counts_for_scorer = true
        AND is_own_goal = false
      GROUP BY player, team_id
    )
    INSERT INTO top_scorers (player, team_id, goals, assists)
    SELECT player, team_id, goals, 0
    FROM goal_counts
    WHERE goals > 0
    ORDER BY goals DESC, player
  `);

  const { rows } = await query(`SELECT COUNT(*)::int AS n FROM top_scorers`);
  return { updated: true, scorers: rows[0].n };
}

/** Artilheiros para exibição — calcula de match_goals quando houver importação real. */
export async function fetchTopScorersRows() {
  const { rows: countRows } = await query(`SELECT COUNT(*)::int AS n FROM match_goals`);
  if (countRows[0].n > 0) {
    const { rows } = await query(`
      SELECT g.player, g.team_id AS team, COUNT(*)::int AS goals
      FROM match_goals g
      INNER JOIN match_results r ON r.match_id = g.match_id AND r.mode = 'real'
      WHERE g.team_id IS NOT NULL
        AND g.player IS NOT NULL
        AND g.counts_for_scorer = true
        AND g.is_own_goal = false
      GROUP BY g.player, g.team_id
      HAVING COUNT(*) > 0
      ORDER BY goals DESC, g.player
    `);
    return rows;
  }

  const { rows } = await query(`
    SELECT player, team_id AS team, goals
    FROM top_scorers
    WHERE goals > 0
    ORDER BY goals DESC, player
  `);
  return rows;
}

function formatMatchDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/**
 * Importa placares finalizados do openfootball quando ainda não há resultado real no banco.
 * Cobre atrasos da TheSportsDB (ex.: jogos do dia anterior com artilheiros completos).
 */
export async function importMissingResultsFromOpenFootball() {
  const wcMatches = await fetchWorldCupJsonMatches();
  let imported = 0;

  for (const wc of wcMatches) {
    if (!wc.score?.ft || !wc.date) continue;

    const team1Id = teamIdFromSportsDb(wc.team1);
    const team2Id = teamIdFromSportsDb(wc.team2);
    if (!team1Id || !team2Id) continue;

    const { rows } = await query(
      `SELECT m.id, m.home_team, m.away_team FROM matches m
       WHERE ((m.home_team = $1 AND m.away_team = $2) OR (m.home_team = $2 AND m.away_team = $1))
         AND m.match_date BETWEEN ($3::date - INTERVAL '1 day') AND ($3::date + INTERVAL '1 day')
       ORDER BY ABS(m.match_date - $3::date)
       LIMIT 1`,
      [team1Id, team2Id, wc.date]
    );
    if (!rows.length) continue;

    const matchId = rows[0].id;
    const dbHome = rows[0].home_team;
    const { rows: existing } = await query(
      `SELECT home_score, status FROM match_results
       WHERE match_id = $1 AND mode = 'real'`,
      [matchId]
    );
    if (existing.length && existing[0].status === 'finished' && existing[0].home_score != null) {
      continue;
    }

    const [s1, s2] = wc.score.ft;
    const homeScore = dbHome === team1Id ? s1 : s2;
    const awayScore = dbHome === team1Id ? s2 : s1;

    await query(
      `INSERT INTO match_results (match_id, mode, home_score, away_score, status, updated_at)
       VALUES ($1, 'real', $2, $3, 'finished', NOW())
       ON CONFLICT (match_id, mode) DO UPDATE SET
         home_score = EXCLUDED.home_score,
         away_score = EXCLUDED.away_score,
         status = EXCLUDED.status,
         updated_at = NOW()`,
      [matchId, homeScore, awayScore]
    );
    imported += 1;
    console.log(`[openfootball] ${matchId}: ${homeScore}×${awayScore} [finished]`);
    recalculatePoolsForMatch(matchId).catch((err) => console.error('Pool ranking recalc:', err.message));
  }

  return { imported };
}

/** Jogos finalizados com placar mas artilheiros incompletos (prioriza os mais recentes). */
export async function listMatchesNeedingGoals(limit = 50) {
  const { rows } = await query(`
    SELECT
      m.id,
      m.home_team,
      m.away_team,
      m.match_date,
      r.home_score,
      r.away_score,
      (
        SELECT COUNT(*)::int FROM match_goals g
        WHERE g.match_id = m.id
          AND g.player IS NOT NULL
          AND g.counts_for_scorer = true
          AND g.is_own_goal = false
      ) AS named_goals
    FROM matches m
    JOIN match_results r ON r.match_id = m.id AND r.mode = 'real'
    WHERE r.status = 'finished'
      AND r.home_score IS NOT NULL
      AND r.away_score IS NOT NULL
      AND (COALESCE(r.home_score, 0) + COALESCE(r.away_score, 0)) > 0
    ORDER BY m.match_date DESC, m.id
  `);

  return rows
    .filter((row) => {
      const total = Number(row.home_score) + Number(row.away_score);
      return Number(row.named_goals) < total;
    })
    .slice(0, limit);
}

/**
 * Importa gols via openfootball (grátis, sem rate limit TheSportsDB).
 * Usado em backfill para não depender do orçamento de timeline.
 */
export async function backfillMissingGoals({ maxMatches = 40 } = {}) {
  const pending = await listMatchesNeedingGoals(maxMatches);
  let synced = 0;

  for (const m of pending) {
    try {
      const before = Number(m.named_goals);
      const result = await syncMatchGoalsFromEvent(
        m.id,
        null,
        m.home_team,
        m.away_team,
        m.home_score,
        m.away_score,
        null,
        formatMatchDate(m.match_date)
      );
      if (!result.ok) continue;

      const total = Number(m.home_score) + Number(m.away_score);
      const improved = result.detailedGoals > before;
      if (improved && result.detailedGoals > 0) {
        synced += 1;
        console.log(
          `[goals] backfill ${m.id}: ${result.detailedGoals}/${total} artilheiro(s) [${result.source}]`
        );
      }
    } catch (err) {
      console.warn(`[goals] backfill ${m.id}:`, err.message);
    }
  }

  if (synced > 0) {
    await recalculateTopScorersFromGoals();
  }

  return { pending: pending.length, synced };
}

export async function hasSyncedGoals() {
  const { rows } = await query(`SELECT COUNT(*)::int AS n FROM match_goals`);
  return rows[0].n > 0;
}
