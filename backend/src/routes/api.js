import { Router } from 'express';
import { query } from '../db.js';
import { TOURNAMENT } from '../seed.js';
import { resolveMatchStatus } from '../match-status.js';
import { getSyncStatus, setSyncEnabled, runScoreSync } from '../score-sync.js';
import { authMiddleware, canWriteScores, requireAdmin } from '../auth.js';
import { recalculatePoolsForMatch } from '../pool/pool-ranking.js';

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

    const [teamsRes, groupsRes, matchesRes, scorersRes, matchGoalsRes, squadRes, prefsRes] = await Promise.all([
      query(`SELECT id, name, flag, "group", confederation, coach, probable_formation FROM teams ORDER BY "group", name`),
      query(`
        SELECT g.id, g.name, COALESCE(json_agg(gt.team_id ORDER BY gt.team_id) FILTER (WHERE gt.team_id IS NOT NULL), '[]') AS teams
        FROM groups_meta g
        LEFT JOIN group_teams gt ON gt.group_id = g.id
        GROUP BY g.id, g.name ORDER BY g.id
      `),
      query(`
        SELECT m.*, r.home_score, r.away_score, COALESCE(r.status, 'scheduled') AS status
        FROM matches m
        LEFT JOIN match_results r ON r.match_id = m.id AND r.mode = $1
        ORDER BY m.match_date, m.match_time, m.id
      `, [mode]),
      query(`
        SELECT ts.player, ts.team_id AS team, ts.goals, ts.assists
        FROM top_scorers ts ORDER BY ts.goals DESC, ts.player
      `),
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
        topScorers: scorersRes.rows,
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
    const { homeScore, awayScore } = req.body;

    const matchRes = await query(`SELECT id, phase FROM matches WHERE id = $1`, [id]);
    if (!matchRes.rows.length) return res.status(404).json({ error: 'Jogo não encontrado' });

    const phase = matchRes.rows[0].phase;
    const home = homeScore === '' || homeScore == null ? null : Number(homeScore);
    const away = awayScore === '' || awayScore == null ? null : Number(awayScore);

    if (home != null && away != null) {
      if (phase !== 'group' && home === away) {
        return res.status(400).json({ error: 'No mata-mata é necessário um vencedor (placares diferentes)' });
      }
      await query(
        `INSERT INTO match_results (match_id, mode, home_score, away_score, status, updated_at)
         VALUES ($1,$2,$3,$4,'finished',NOW())
         ON CONFLICT (match_id, mode) DO UPDATE SET
           home_score = EXCLUDED.home_score,
           away_score = EXCLUDED.away_score,
           status = 'finished',
           updated_at = NOW()`,
        [id, mode, home, away]
      );
    } else {
      await query(`DELETE FROM match_results WHERE match_id = $1 AND mode = $2`, [id, mode]);
    }

    const { rows } = await query(`
      SELECT m.*, r.home_score, r.away_score, COALESCE(r.status, 'scheduled') AS status
      FROM matches m
      LEFT JOIN match_results r ON r.match_id = m.id AND r.mode = $2
      WHERE m.id = $1
    `, [id, mode]);

    res.json(mapMatchRow(rows[0], mode));

    if (mode === 'real' && home != null && away != null) {
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
      SELECT match_id, home_score, away_score, status, updated_at
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

/** GET /api/health */
router.get('/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

export default router;
