import { Router } from 'express';
import { query } from '../db.js';
import { TOURNAMENT } from '../seed.js';
import { resolveMatchStatus, finalizeStaleLiveResults } from '../match-status.js';
import { getSyncStatus, setSyncEnabled, runScoreSync } from '../score-sync.js';
import { getSportsApiStatus } from '../sportsdb-fetch.js';
import { fetchTopScorersRows, backfillMissingGoals, importMissingResultsFromOpenFootball, purgeLegacyCorrectedGoals } from '../goal-sync.js';
import { authMiddleware, canWriteScores, requireAdmin } from '../auth.js';
import { recalculatePoolsForMatch } from '../pool/pool-ranking.js';
import { validateKnockoutFinish } from '../match-score.js';

const router = Router();
router.use(authMiddleware);

function mapMatchRow(row, mode = 'real') {
  const match = {
    id: row.id,
    phase: row.phase,
    group: row.group,
    matchday: row.matchday,
    date: row.match_date.toISOString().slice(0, 10),
    time: row.match_time.slice(0, 5),
    venue: row.venue,
    home: row.home_team,
    away: row.away_team,
    label: row.label,
    homeScore: row.home_score ?? null,
    awayScore: row.away_score ?? null,
    homePenalties: row.home_penalties ?? null,
    awayPenalties: row.away_penalties ?? null,
    resultDetail: row.result_detail ?? null,
    status: row.status ?? 'scheduled',
  };
  match.status = resolveMatchStatus(match, new Date(), {
    allowFutureFinished: mode === 'simulation',
  });
  return match;
}

/** GET /api/bootstrap?mode=real */
router.get('/bootstrap', async (req, res, next) => {
  try {
    let mode = req.query.mode === 'simulation' ? 'simulation' : 'real';
    if (mode === 'simulation' && !req.user) {
      mode = 'real';
    }

    if (mode === 'real') {
      const { matchIds } = await finalizeStaleLiveResults();
      for (const id of matchIds) {
        recalculatePoolsForMatch(id).catch((err) => console.error('Pool ranking recalc:', err.message));
      }
      await importMissingResultsFromOpenFootball().catch((err) => {
        console.warn('[bootstrap] openfootball placares:', err.message);
      });
      await purgeLegacyCorrectedGoals().catch((err) => {
        console.warn('[bootstrap] limpeza gols corrigidos:', err.message);
      });
      await backfillMissingGoals({
        maxMatches: Number(process.env.SYNC_GOAL_BACKFILL_MAX || 40),
      }).catch((err) => console.warn('[bootstrap] backfill gols:', err.message));
    }

    const [teamsRes, groupsRes, matchesRes, scorersRes, matchGoalsRes, squadRes, prefsRes] = await Promise.all([
      query(`SELECT id, name, flag, "group", confederation, coach, probable_formation FROM teams ORDER BY "group", name`),
      query(`
        SELECT g.id, g.name, COALESCE(json_agg(gt.team_id ORDER BY gt.team_id) FILTER (WHERE gt.team_id IS NOT NULL), '[]') AS teams
        FROM groups_meta g
        LEFT JOIN group_teams gt ON gt.group_id = g.id
        GROUP BY g.id, g.name ORDER BY g.id
      `),
      query(`
        SELECT m.*, r.home_score, r.away_score, r.home_penalties, r.away_penalties, r.result_detail,
          COALESCE(r.status, 'scheduled') AS status
        FROM matches m
        LEFT JOIN match_results r ON r.match_id = m.id AND r.mode = $1
        ORDER BY m.match_date, m.match_time, m.id
      `, [mode]),
      fetchTopScorersRows(),
      query(`
        SELECT
          mg.match_id AS "matchId",
          mg.player,
          mg.team_id AS team,
          mg.minute,
          mg.detail,
          mg.assist_player AS "assistPlayer",
          mg.is_own_goal AS "isOwnGoal",
          mg.counts_for_scorer AS "countsForScorer",
          mg.source
        FROM match_goals mg
        JOIN match_results r ON r.match_id = mg.match_id AND r.mode = 'real'
        WHERE r.status = 'finished'
        ORDER BY mg.match_id, mg.minute NULLS LAST, mg.id
      `),
      query(`
        SELECT
          team_id AS team,
          player,
          shirt_name AS "shirtName",
          shirt_number AS number,
          position,
          club,
          birth_date AS "birthDate",
          height_cm AS "heightCm",
          photo_url AS "photoUrl",
          bio,
          is_probable_starter AS "isProbableStarter",
          source
        FROM team_players
        ORDER BY team_id, is_probable_starter DESC, shirt_number NULLS LAST, player
      `),
      query(`SELECT theme, favorites, expanded_groups, active_mode, score_sync_enabled FROM app_preferences WHERE id = 1`),
    ]);

    const teams = teamsRes.rows;
    const groups = groupsRes.rows.map((g) => ({ id: g.id, name: g.name, teams: g.teams }));
    const matches = matchesRes.rows.map((row) => mapMatchRow(row, mode));

    res.json({
      tournament: TOURNAMENT,
      teams,
      groups,
      matches,
      stats: {
        topScorers: scorersRes,
        matchGoals: matchGoalsRes.rows,
        squads: squadRes.rows,
        meta: { timezone: 'America/Sao_Paulo' },
      },
      preferences: prefsRes.rows[0] ?? { theme: 'dark', favorites: [], expanded_groups: [], active_mode: 'real' },
      mode,
      user: req.user ? { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role } : null,
    });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/matches/:id/score */
router.put('/matches/:id/score', async (req, res, next) => {
  try {
    const { id } = req.params;
    const mode = req.body.mode === 'simulation' ? 'simulation' : 'real';

    if (!canWriteScores(req.user, mode)) {
      return res.status(403).json({
        error: mode === 'real'
          ? 'Modo Real é somente leitura. Apenas administradores podem editar.'
          : 'Faça login para editar placares na simulação.',
      });
    }
    const { homeScore, awayScore, homePenalties, awayPenalties, resultDetail } = req.body;

    const matchRes = await query(`SELECT id, phase FROM matches WHERE id = $1`, [id]);
    if (!matchRes.rows.length) return res.status(404).json({ error: 'Jogo não encontrado' });

    const phase = matchRes.rows[0].phase;
    const home = homeScore === '' || homeScore == null ? null : Number(homeScore);
    const away = awayScore === '' || awayScore == null ? null : Number(awayScore);
    const homePen = homePenalties === '' || homePenalties == null ? null : Number(homePenalties);
    const awayPen = awayPenalties === '' || awayPenalties == null ? null : Number(awayPenalties);
    const detail = ['ft', 'aet', 'pen'].includes(resultDetail) ? resultDetail : null;
    const finishRequested = req.body.finish === true || req.body.status === 'finished';
    let resultStatus = null;

    if (home != null && away != null) {
      const finishing = finishRequested || mode === 'simulation';
      const knockoutErr = validateKnockoutFinish(phase, {
        homeScore: home,
        awayScore: away,
        homePenalties: homePen,
        awayPenalties: awayPen,
      });
      if (knockoutErr && finishing) {
        return res.status(400).json({ error: knockoutErr });
      }

      if (mode === 'simulation') {
        resultStatus = 'finished';
      } else {
        const existing = await query(
          `SELECT status FROM match_results WHERE match_id = $1 AND mode = $2`,
          [id, mode]
        );
        const existingStatus = existing.rows[0]?.status;
        resultStatus = finishRequested || existingStatus === 'finished' ? 'finished' : 'live';
      }

      await query(
        `INSERT INTO match_results (
           match_id, mode, home_score, away_score, status,
           home_penalties, away_penalties, result_detail, updated_at
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT (match_id, mode) DO UPDATE SET
           home_score = EXCLUDED.home_score,
           away_score = EXCLUDED.away_score,
           status = EXCLUDED.status,
           home_penalties = EXCLUDED.home_penalties,
           away_penalties = EXCLUDED.away_penalties,
           result_detail = EXCLUDED.result_detail,
           updated_at = NOW()`,
        [id, mode, home, away, resultStatus, homePen, awayPen, detail]
      );
    } else {
      await query(`DELETE FROM match_results WHERE match_id = $1 AND mode = $2`, [id, mode]);
    }

    const { rows } = await query(`
      SELECT m.*, r.home_score, r.away_score, r.home_penalties, r.away_penalties, r.result_detail,
        COALESCE(r.status, 'scheduled') AS status
      FROM matches m
      LEFT JOIN match_results r ON r.match_id = m.id AND r.mode = $2
      WHERE m.id = $1
    `, [id, mode]);

    res.json(mapMatchRow(rows[0], mode));

    if (mode === 'real' && resultStatus === 'finished') {
      recalculatePoolsForMatch(id).catch((err) => console.error('Pool ranking recalc:', err.message));
    }
  } catch (err) {
    next(err);
  }
});

/** PUT /api/matches/:id/status — encerrar/reabrir manualmente (admin, modo real) */
router.put('/matches/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const mode = req.body.mode === 'simulation' ? 'simulation' : 'real';

    if (!canWriteScores(req.user, mode)) {
      return res.status(403).json({
        error: mode === 'real'
          ? 'Modo Real é somente leitura. Apenas administradores podem editar.'
          : 'Faça login para editar placares na simulação.',
      });
    }

    const status = req.body.status === 'finished' ? 'finished' : 'live';

    const matchRes = await query(`SELECT id, phase FROM matches WHERE id = $1`, [id]);
    if (!matchRes.rows.length) return res.status(404).json({ error: 'Jogo não encontrado' });

    const existing = await query(
      `SELECT home_score, away_score, home_penalties, away_penalties
       FROM match_results WHERE match_id = $1 AND mode = $2`,
      [id, mode]
    );
    const row0 = existing.rows[0];

    if (status === 'finished' && (!row0 || row0.home_score == null || row0.away_score == null)) {
      return res.status(400).json({ error: 'Defina o placar antes de encerrar a partida' });
    }
    if (status === 'finished') {
      const knockoutErr = validateKnockoutFinish(matchRes.rows[0].phase, {
        homeScore: row0.home_score,
        awayScore: row0.away_score,
        homePenalties: row0.home_penalties,
        awayPenalties: row0.away_penalties,
      });
      if (knockoutErr) return res.status(400).json({ error: knockoutErr });
    }
    if (status === 'live' && !row0) {
      return res.status(400).json({ error: 'Não há placar registrado para reabrir' });
    }

    await query(
      `UPDATE match_results SET status = $3, updated_at = NOW()
       WHERE match_id = $1 AND mode = $2`,
      [id, mode, status]
    );

    const { rows } = await query(`
      SELECT m.*, r.home_score, r.away_score, r.home_penalties, r.away_penalties, r.result_detail,
        COALESCE(r.status, 'scheduled') AS status
      FROM matches m
      LEFT JOIN match_results r ON r.match_id = m.id AND r.mode = $2
      WHERE m.id = $1
    `, [id, mode]);

    res.json(mapMatchRow(rows[0], mode));

    if (mode === 'real') {
      recalculatePoolsForMatch(id).catch((err) => console.error('Pool ranking recalc:', err.message));
    }
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/scores?mode=real */
router.delete('/scores', async (req, res, next) => {
  try {
    const mode = req.query.mode === 'simulation' ? 'simulation' : 'real';
    if (!canWriteScores(req.user, mode)) {
      return res.status(403).json({ error: 'Sem permissão para limpar placares neste modo' });
    }
    await query(`DELETE FROM match_results WHERE mode = $1`, [mode]);
    res.json({ ok: true, mode });
  } catch (err) {
    next(err);
  }
});

/** GET /api/scores/export?mode=real */
router.get('/scores/export', async (req, res, next) => {
  try {
    const mode = req.query.mode === 'simulation' ? 'simulation' : 'real';
    const { rows } = await query(`
      SELECT match_id, home_score, away_score, home_penalties, away_penalties, result_detail, status, updated_at
      FROM match_results WHERE mode = $1 ORDER BY updated_at
    `, [mode]);
    res.json({ mode, exportedAt: new Date().toISOString(), scores: rows });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/preferences */
router.put('/preferences', async (req, res, next) => {
  try {
    const { theme, favorites, expandedGroups, activeMode } = req.body;
    await query(
      `UPDATE app_preferences SET
         theme = COALESCE($1, theme),
         favorites = COALESCE($2::jsonb, favorites),
         expanded_groups = COALESCE($3::jsonb, expanded_groups),
         active_mode = COALESCE($4::match_mode, active_mode),
         updated_at = NOW()
       WHERE id = 1`,
      [
        theme ?? null,
        favorites ? JSON.stringify(favorites) : null,
        expandedGroups ? JSON.stringify(expandedGroups) : null,
        activeMode ?? null,
      ]
    );
    const { rows } = await query(`SELECT theme, favorites, expanded_groups, active_mode FROM app_preferences WHERE id = 1`);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

/** GET /api/sync/status */
router.get('/sync/status', async (_req, res, next) => {
  try {
    res.json(await getSyncStatus());
  } catch (err) {
    next(err);
  }
});

/** PUT /api/sync/toggle */
router.put('/sync/toggle', requireAdmin, async (req, res, next) => {
  try {
    const enabled = Boolean(req.body.enabled);
    await setSyncEnabled(enabled);
    if (enabled) {
      runScoreSync().catch(() => {});
    }
    res.json(await getSyncStatus());
  } catch (err) {
    next(err);
  }
});

/** POST /api/sync/run — sincronização manual */
router.post('/sync/run', requireAdmin, async (_req, res, next) => {
  try {
    const result = await runScoreSync();
    res.json({ ...result, ...(await getSyncStatus()) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/sync/goals — backfill de artilheiros (openfootball) */
router.post('/sync/goals', requireAdmin, async (_req, res, next) => {
  try {
    const result = await backfillMissingGoals({
      maxMatches: Number(process.env.SYNC_GOAL_BACKFILL_MAX || 40),
    });
    res.json({ ok: true, ...result, topScorers: await fetchTopScorersRows() });
  } catch (err) {
    next(err);
  }
});

/** GET /api/sync/metrics — observabilidade TheSportsDB (admin) */
router.get('/sync/metrics', requireAdmin, async (_req, res, next) => {
  try {
    res.json(getSportsApiStatus());
  } catch (err) {
    next(err);
  }
});

/** GET /api/health */
router.get('/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({
      ok: true,
      commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null,
      service: process.env.RENDER_SERVICE_NAME ?? null,
    });
  } catch {
    res.status(503).json({ ok: false });
  }
});

export default router;
