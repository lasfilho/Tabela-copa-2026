import { Router } from 'express';
import {
  listPublicPools, getPoolBySlug, fetchPoolMatches, getPoolScoreRules,
  RECREATIONAL_DISCLAIMER,
} from '../pool/pool-service.js';
import { getPoolRanking } from '../pool/pool-ranking.js';
import { buildScoringRulesHtml, normalizeRules } from '../pool/pool-rules.js';
import { getInvitePreview } from '../pool/pool-join.js';

const router = Router();

/** GET /api/public/invite-preview?token= */
router.get('/invite-preview', async (req, res, next) => {
  try {
    const preview = await getInvitePreview(req.query.token);
    res.json({ ...preview, disclaimer: RECREATIONAL_DISCLAIMER });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

/** GET /api/public/pools */
router.get('/pools', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const data = await listPublicPools({ page, limit });
    res.json({ ...data, disclaimer: RECREATIONAL_DISCLAIMER });
  } catch (err) { next(err); }
});

/** GET /api/public/pools/:slug */
router.get('/pools/:slug', async (req, res, next) => {
  try {
    const pool = await getPoolBySlug(req.params.slug);
    if (!pool) return res.status(404).json({ error: 'Bolão não encontrado' });
    if (pool.visibility !== 'public' || !pool.allowPublicListing) {
      return res.status(404).json({ error: 'Bolão não disponível publicamente' });
    }
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

/** GET /api/public/pools/:slug/ranking */
router.get('/pools/:slug/ranking', async (req, res, next) => {
  try {
    const pool = await getPoolBySlug(req.params.slug);
    if (!pool || pool.visibility !== 'public' || !pool.allowPublicListing) {
      return res.status(404).json({ error: 'Bolão não encontrado' });
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const ranking = await getPoolRanking(pool.id, { page, limit });
    res.json({ ...ranking, disclaimer: RECREATIONAL_DISCLAIMER });
  } catch (err) { next(err); }
});

/** GET /api/public/pools/:slug/rules */
router.get('/pools/:slug/rules', async (req, res, next) => {
  try {
    const pool = await getPoolBySlug(req.params.slug);
    if (!pool || pool.visibility !== 'public' || !pool.allowPublicListing) {
      return res.status(404).json({ error: 'Bolão não encontrado' });
    }
    const rules = await getPoolScoreRules(pool.id);
    const normalized = normalizeRules(rules?.rules);
    res.json({
      rules: normalized,
      rulesHtml: buildScoringRulesHtml(normalized),
      disclaimer: RECREATIONAL_DISCLAIMER,
    });
  } catch (err) { next(err); }
});

export default router;
