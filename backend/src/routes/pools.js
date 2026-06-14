import { Router } from 'express';
import { authMiddleware, requireAuth } from '../auth.js';
import {
  listPoolsForUser, createPool, updatePool, deletePool, getPoolById, checkNameAvailable,
  fetchPoolMatches, getPoolScoreRules, RECREATIONAL_DISCLAIMER, fetchEligiblePoolMatches,
} from '../pool/pool-service.js';
import { joinPool, createInvite, respondInvite, listInvitesForPool, listMyInvites, joinByInviteToken } from '../pool/pool-join.js';
import { listPredictions, upsertPrediction, getParticipantDetail } from '../pool/pool-predictions.js';
import { getPoolRanking, recalculatePoolRanking, getRankingEvolution } from '../pool/pool-ranking.js';
import { buildScoringRulesHtml, normalizeRules } from '../pool/pool-rules.js';

const router = Router();
router.use(authMiddleware);

function handleError(err, res, next) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  next(err);
}

/** GET /api/pools/check-name?name= */
router.get('/check-name', async (req, res, next) => {
  try {
    const name = req.query.name?.trim();
    if (!name) return res.status(400).json({ error: 'Informe um nome' });
    const excludeId = req.query.excludeId ? Number(req.query.excludeId) : null;
    const available = await checkNameAvailable(name, excludeId);
    res.json({ available, name });
  } catch (err) { next(err); }
});

/** GET /api/pools — meus bolões */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const items = await listPoolsForUser(req.user.id);
    res.json({ items, disclaimer: RECREATIONAL_DISCLAIMER });
  } catch (err) { next(err); }
});

/** GET /api/pools/invites/mine */
router.get('/invites/mine', requireAuth, async (req, res, next) => {
  try {
    res.json({ items: await listMyInvites(req.user.id) });
  } catch (err) { next(err); }
});

/** POST /api/pools */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const pool = await createPool(req.user.id, req.body);
    res.status(201).json({ pool, disclaimer: RECREATIONAL_DISCLAIMER });
  } catch (err) { handleError(err, res, next); }
});

/** POST /api/pools/join-by-token */
router.post('/join-by-token', requireAuth, async (req, res, next) => {
  try {
    const { token } = req.body ?? {};
    const result = await joinByInviteToken(req.user.id, token);
    res.json({ ...result, disclaimer: RECREATIONAL_DISCLAIMER });
  } catch (err) { handleError(err, res, next); }
});

/** GET /api/pools/meta/matches — partidas elegíveis para criar bolão */
router.get('/meta/matches', requireAuth, async (req, res, next) => {
  try {
    const items = await fetchEligiblePoolMatches();
    res.json({
      items,
      creator: req.user ? { id: req.user.id, name: req.user.name, email: req.user.email } : null,
      disclaimer: RECREATIONAL_DISCLAIMER,
      filterNote: 'Somente jogos agendados com data posterior a hoje (horário de Brasília)',
    });
  } catch (err) { next(err); }
});

/** POST /api/pools/invites/:inviteId/respond */
router.post('/invites/:inviteId/respond', requireAuth, async (req, res, next) => {
  try {
    const accept = req.body?.accept === true;
    const result = await respondInvite(Number(req.params.inviteId), req.user.id, accept);
    res.json(result);
  } catch (err) { handleError(err, res, next); }
});

/** GET /api/pools/:id */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPoolById(Number(req.params.id));
    if (!pool) return res.status(404).json({ error: 'Bolão não encontrado' });
    const matches = await fetchPoolMatches(pool.id);
    const rules = await getPoolScoreRules(pool.id);
    const normalized = normalizeRules(rules?.rules);
    res.json({
      pool,
      matches,
      rules: normalized,
      rulesHtml: buildScoringRulesHtml(normalized),
      disclaimer: RECREATIONAL_DISCLAIMER,
    });
  } catch (err) { next(err); }
});

/** DELETE /api/pools/:id — somente criador */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    await deletePool(Number(req.params.id), req.user.id);
    res.json({ ok: true });
  } catch (err) { handleError(err, res, next); }
});

/** PATCH /api/pools/:id */
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const pool = await updatePool(Number(req.params.id), req.user.id, req.body);
    res.json({ pool });
  } catch (err) { handleError(err, res, next); }
});

/** POST /api/pools/:id/join */
router.post('/:id/join', requireAuth, async (req, res, next) => {
  try {
    const pool = await joinPool(Number(req.params.id), req.user.id, req.body);
    res.json({ pool });
  } catch (err) { handleError(err, res, next); }
});

/** POST /api/pools/:id/invites */
router.post('/:id/invites', requireAuth, async (req, res, next) => {
  try {
    const invite = await createInvite(Number(req.params.id), req.user.id, req.body);
    res.status(201).json({ invite, disclaimer: RECREATIONAL_DISCLAIMER });
  } catch (err) { handleError(err, res, next); }
});

/** GET /api/pools/:id/invites */
router.get('/:id/invites', requireAuth, async (req, res, next) => {
  try {
    res.json({ items: await listInvitesForPool(Number(req.params.id), req.user.id) });
  } catch (err) { handleError(err, res, next); }
});


/** GET /api/pools/:id/predictions */
router.get('/:id/predictions', requireAuth, async (req, res, next) => {
  try {
    const items = await listPredictions(Number(req.params.id), req.user.id);
    res.json({ items, disclaimer: RECREATIONAL_DISCLAIMER });
  } catch (err) { handleError(err, res, next); }
});

/** POST /api/pools/:id/predictions */
router.post('/:id/predictions', requireAuth, async (req, res, next) => {
  try {
    const { matchId, homeScore, awayScore } = req.body ?? {};
    const pred = await upsertPrediction(
      Number(req.params.id), req.user.id, matchId, homeScore, awayScore
    );
    await recalculatePoolRanking(Number(req.params.id));
    res.json({ prediction: pred });
  } catch (err) { handleError(err, res, next); }
});

/** GET /api/pools/:id/ranking */
router.get('/:id/ranking', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const ranking = await getPoolRanking(Number(req.params.id), { page, limit });
    res.json({ ...ranking, disclaimer: RECREATIONAL_DISCLAIMER });
  } catch (err) { handleError(err, res, next); }
});

/** GET /api/pools/:id/participants/:participantId */
router.get('/:id/participants/:participantId', async (req, res, next) => {
  try {
    const detail = await getParticipantDetail(
      Number(req.params.id),
      Number(req.params.participantId),
      req.user?.id
    );
    res.json(detail);
  } catch (err) { handleError(err, res, next); }
});

/** GET /api/pools/:id/rules */
router.get('/:id/rules', async (req, res, next) => {
  try {
    const rules = await getPoolScoreRules(Number(req.params.id));
    const normalized = normalizeRules(rules?.rules);
    res.json({
      rules: normalized,
      rulesHtml: buildScoringRulesHtml(normalized),
      disclaimer: RECREATIONAL_DISCLAIMER,
    });
  } catch (err) { next(err); }
});

/** POST /api/pools/:id/recalculate */
router.post('/:id/recalculate', requireAuth, async (req, res, next) => {
  try {
    const pool = await getPoolById(Number(req.params.id));
    if (!pool) return res.status(404).json({ error: 'Bolão não encontrado' });
    if (pool.creatorId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Sem permissão' });
    }
    await recalculatePoolRanking(pool.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
