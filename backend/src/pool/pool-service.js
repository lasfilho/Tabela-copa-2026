import crypto from 'crypto';
import { query, withTransaction } from '../db.js';
import {
  canCreatePoolWithMatches, joinDeadlineForMatches, canJoinPool, matchKickoff,
} from './pool-timing.js';
import { validatePoolMatchIds, filterEligiblePoolMatches } from './pool-match-eligibility.js';
import { DEFAULT_SCORE_RULES, RECREATIONAL_DISCLAIMER } from './pool-rules.js';

export { RECREATIONAL_DISCLAIMER };

export function slugify(name) {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `${base || 'bolao'}-${crypto.randomBytes(4).toString('hex')}`;
}

export async function audit(poolId, userId, action, details = {}) {
  await query(
    `INSERT INTO pool_audit_events (pool_id, user_id, action, details) VALUES ($1, $2, $3, $4)`,
    [poolId, userId ?? null, action, JSON.stringify(details)]
  );
}

export async function getDefaultScoreRulesId() {
  const { rows } = await query(
    `SELECT id FROM pool_score_rules WHERE is_default = true LIMIT 1`
  );
  if (rows[0]) return rows[0].id;
  const ins = await query(
    `INSERT INTO pool_score_rules (name, description, rules, is_default)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (name) DO UPDATE SET is_default = true
     RETURNING id`,
    ['Padrão Copa 2026', 'Regras padrão de pontuação recreativa', JSON.stringify(DEFAULT_SCORE_RULES)]
  );
  return ins.rows[0].id;
}

export async function fetchMatchesByIds(matchIds) {
  if (!matchIds?.length) return [];
  const { rows } = await query(
    `SELECT m.id, m.phase, m."group", m.match_date, m.match_time, m.venue,
            m.home_team, m.away_team, m.label,
            ht.name AS home_name, ht.flag AS home_flag,
            at.name AS away_name, at.flag AS away_flag,
            COALESCE(r.status, 'scheduled') AS status
     FROM matches m
     LEFT JOIN teams ht ON ht.id = m.home_team
     LEFT JOIN teams at ON at.id = m.away_team
     LEFT JOIN match_results r ON r.match_id = m.id AND r.mode = 'real'
     WHERE m.id = ANY($1::varchar[])`,
    [matchIds]
  );
  return rows;
}

export async function fetchEligiblePoolMatches() {
  const { rows } = await query(
    `SELECT m.id, m.phase, m."group", m.match_date, m.match_time, m.label,
            m.home_team, m.away_team,
            ht.name AS home_name, ht.flag AS home_flag,
            at.name AS away_name, at.flag AS away_flag,
            COALESCE(r.status, 'scheduled') AS status
     FROM matches m
     LEFT JOIN teams ht ON ht.id = m.home_team
     LEFT JOIN teams at ON at.id = m.away_team
     LEFT JOIN match_results r ON r.match_id = m.id AND r.mode = 'real'
     ORDER BY m.match_date, m.match_time`
  );
  return filterEligiblePoolMatches(rows);
}

export async function fetchPoolMatches(poolId) {
  const { rows } = await query(
    `SELECT m.id, m.phase, m."group", m.match_date, m.match_time, m.venue,
            m.home_team, m.away_team, m.label, pm.sort_order,
            ht.name AS home_name, ht.flag AS home_flag,
            at.name AS away_name, at.flag AS away_flag
     FROM pool_matches pm
     JOIN matches m ON m.id = pm.match_id
     LEFT JOIN teams ht ON ht.id = m.home_team
     LEFT JOIN teams at ON at.id = m.away_team
     WHERE pm.pool_id = $1
     ORDER BY m.match_date, m.match_time, pm.sort_order`,
    [poolId]
  );
  return rows;
}

function mapPoolRow(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    creatorId: row.creator_id,
    creatorName: row.creator_name ?? null,
    visibility: row.visibility,
    status: row.status,
    scoreRulesId: row.score_rules_id,
    joinDeadline: row.join_deadline,
    inviteToken: row.invite_token,
    allowPublicListing: row.allow_public_listing,
    showParticipants: row.show_participants,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    participantCount: row.participant_count != null ? Number(row.participant_count) : undefined,
    matchCount: row.match_count != null ? Number(row.match_count) : undefined,
  };
}

export async function listPoolsForUser(userId) {
  const { rows } = await query(
    `SELECT p.*, u.name AS creator_name,
            (SELECT COUNT(*)::int FROM pool_participants pp WHERE pp.pool_id = p.id) AS participant_count,
            (SELECT COUNT(*)::int FROM pool_matches pm WHERE pm.pool_id = p.id) AS match_count
     FROM pools p
     JOIN users u ON u.id = p.creator_id
     WHERE p.creator_id = $1
        OR EXISTS (SELECT 1 FROM pool_participants pp WHERE pp.pool_id = p.id AND pp.user_id = $1)
     ORDER BY p.updated_at DESC`,
    [userId]
  );
  return rows.map(mapPoolRow);
}

export async function listPublicPools({ page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT p.*, u.name AS creator_name,
            (SELECT COUNT(*)::int FROM pool_participants pp WHERE pp.pool_id = p.id) AS participant_count,
            (SELECT COUNT(*)::int FROM pool_matches pm WHERE pm.pool_id = p.id) AS match_count
     FROM pools p
     JOIN users u ON u.id = p.creator_id
     WHERE p.visibility = 'public' AND p.allow_public_listing = true
       AND p.status NOT IN ('draft', 'archived')
     ORDER BY p.updated_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  const count = await query(
    `SELECT COUNT(*)::int AS n FROM pools
     WHERE visibility = 'public' AND allow_public_listing = true AND status NOT IN ('draft', 'archived')`
  );
  return { items: rows.map(mapPoolRow), total: count.rows[0].n, page, limit };
}

export async function getPoolById(id) {
  const { rows } = await query(
    `SELECT p.*, u.name AS creator_name,
            (SELECT COUNT(*)::int FROM pool_participants pp WHERE pp.pool_id = p.id) AS participant_count,
            (SELECT COUNT(*)::int FROM pool_matches pm WHERE pm.pool_id = p.id) AS match_count
     FROM pools p JOIN users u ON u.id = p.creator_id WHERE p.id = $1`,
    [id]
  );
  return rows[0] ? mapPoolRow(rows[0]) : null;
}

export async function getPoolBySlug(slug) {
  const { rows } = await query(
    `SELECT p.*, u.name AS creator_name,
            (SELECT COUNT(*)::int FROM pool_participants pp WHERE pp.pool_id = p.id) AS participant_count,
            (SELECT COUNT(*)::int FROM pool_matches pm WHERE pm.pool_id = p.id) AS match_count
     FROM pools p JOIN users u ON u.id = p.creator_id WHERE p.slug = $1`,
    [slug]
  );
  return rows[0] ? mapPoolRow(rows[0]) : null;
}

export async function checkNameAvailable(name, excludeId = null) {
  const { rows } = await query(
    `SELECT id FROM pools WHERE LOWER(name) = LOWER($1) AND ($2::int IS NULL OR id != $2)`,
    [name.trim(), excludeId]
  );
  return rows.length === 0;
}

export async function createPool(userId, payload) {
  const {
    name, description, visibility = 'private', matchIds = [],
    joinDeadline = null, allowPublicListing = false, showParticipants = true,
    status = 'open', scoreRulesId = null,
  } = payload;

  if (!name?.trim()) throw Object.assign(new Error('Nome do bolão é obrigatório'), { status: 400 });
  if (name.trim().length < 3) throw Object.assign(new Error('Nome deve ter pelo menos 3 caracteres'), { status: 400 });
  if (!(await checkNameAvailable(name))) {
    throw Object.assign(new Error('Nome de bolão já existente — escolha outro nome'), { status: 409 });
  }
  if (!matchIds.length) throw Object.assign(new Error('Selecione ao menos uma partida'), { status: 400 });

  const matches = await fetchMatchesByIds(matchIds);
  if (matches.length !== matchIds.length) {
    throw Object.assign(new Error('Uma ou mais partidas são inválidas'), { status: 400 });
  }

  const eligibilityCheck = validatePoolMatchIds(matches);
  if (!eligibilityCheck.ok) throw Object.assign(new Error(eligibilityCheck.reason), { status: 400 });

  const creationCheck = canCreatePoolWithMatches(matches);
  if (!creationCheck.ok) throw Object.assign(new Error(creationCheck.reason), { status: 400 });

  const deadline = joinDeadlineForMatches(matches, joinDeadline);
  const rulesId = scoreRulesId ?? await getDefaultScoreRulesId();
  const slug = slugify(name);
  const inviteToken = visibility === 'link' ? crypto.randomBytes(24).toString('hex') : null;
  const publicListing = visibility === 'public' ? allowPublicListing : false;

  return withTransaction(async (client) => {
    const ins = await client.query(
      `INSERT INTO pools (name, slug, description, creator_id, visibility, status, score_rules_id,
                          join_deadline, invite_token, allow_public_listing, show_participants)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [name.trim(), slug, description?.trim() || null, userId, visibility, status, rulesId,
        deadline, inviteToken, publicListing, showParticipants]
    );
    const poolId = ins.rows[0].id;

    for (let i = 0; i < matchIds.length; i++) {
      await client.query(
        `INSERT INTO pool_matches (pool_id, match_id, sort_order) VALUES ($1, $2, $3)`,
        [poolId, matchIds[i], i]
      );
    }

    await client.query(
      `INSERT INTO pool_participants (pool_id, user_id) VALUES ($1, $2)`,
      [poolId, userId]
    );

    await client.query(
      `INSERT INTO pool_audit_events (pool_id, user_id, action, details) VALUES ($1, $2, 'pool.created', $3)`,
      [poolId, userId, JSON.stringify({ name, matchCount: matchIds.length })]
    );

    return getPoolById(poolId);
  });
}

export async function updatePool(poolId, userId, payload) {
  const pool = await getPoolById(poolId);
  if (!pool) throw Object.assign(new Error('Bolão não encontrado'), { status: 404 });
  if (pool.creatorId !== userId) {
    throw Object.assign(new Error('Somente o criador pode editar o bolão'), { status: 403 });
  }
  if (['closed', 'archived'].includes(pool.status)) {
    throw Object.assign(new Error('Bolão encerrado — edição não permitida'), { status: 400 });
  }

  const { name, description, visibility, allowPublicListing, showParticipants, status } = payload;

  if (name && name.trim() !== pool.name) {
    if (!(await checkNameAvailable(name, poolId))) {
      throw Object.assign(new Error('Nome de bolão já existente'), { status: 409 });
    }
  }

  const matches = await fetchPoolMatches(poolId);
  if (pool.status === 'in_progress' && payload.matchIds) {
    throw Object.assign(new Error('Não é permitido alterar partidas após o bolão iniciar'), { status: 400 });
  }

  let inviteToken = pool.inviteToken;
  if (visibility === 'link' && !inviteToken) {
    inviteToken = crypto.randomBytes(24).toString('hex');
  }

  await query(
    `UPDATE pools SET
       name = COALESCE($2, name),
       description = COALESCE($3, description),
       visibility = COALESCE($4, visibility),
       allow_public_listing = COALESCE($5, allow_public_listing),
       show_participants = COALESCE($6, show_participants),
       status = COALESCE($7, status),
       invite_token = $8,
       updated_at = NOW()
     WHERE id = $1`,
    [poolId, name?.trim(), description?.trim(), visibility,
      visibility === 'public' ? allowPublicListing : false,
      showParticipants, status, inviteToken]
  );

  await audit(poolId, userId, 'pool.updated', payload);
  return getPoolById(poolId);
}

export async function deletePool(poolId, userId) {
  const pool = await getPoolById(poolId);
  if (!pool) throw Object.assign(new Error('Bolão não encontrado'), { status: 404 });
  if (pool.creatorId !== userId) {
    throw Object.assign(new Error('Somente o criador pode excluir o bolão'), { status: 403 });
  }

  await audit(poolId, userId, 'pool.deleted', { name: pool.name });
  await query(`DELETE FROM pools WHERE id = $1`, [poolId]);
  return { ok: true };
}

export async function getPoolScoreRules(poolId) {
  const { rows } = await query(
    `SELECT sr.id, sr.name, sr.description, sr.rules
     FROM pools p JOIN pool_score_rules sr ON sr.id = p.score_rules_id WHERE p.id = $1`,
    [poolId]
  );
  return rows[0] ?? null;
}

export async function isParticipant(poolId, userId) {
  const { rows } = await query(
    `SELECT id FROM pool_participants WHERE pool_id = $1 AND user_id = $2`,
    [poolId, userId]
  );
  return rows[0]?.id ?? null;
}

export async function updatePoolStatusAuto(poolId) {
  const matches = await fetchPoolMatches(poolId);
  if (!matches.length) return;

  const now = new Date();
  const firstKickoff = matchKickoff(matches[0]);
  const lastMatch = matches[matches.length - 1];

  const { rows: poolRows } = await query(`SELECT status FROM pools WHERE id = $1`, [poolId]);
  let status = poolRows[0]?.status;
  if (!status || status === 'archived' || status === 'draft') return;

  const { rows: finishedRows } = await query(
    `SELECT COUNT(*)::int AS n FROM match_results mr
     JOIN pool_matches pm ON pm.match_id = mr.match_id
     WHERE pm.pool_id = $1 AND mr.mode = 'real' AND mr.status = 'finished'`,
    [poolId]
  );
  const finishedCount = finishedRows[0].n;

  if (finishedCount >= matches.length) status = 'closed';
  else if (now >= firstKickoff) status = 'in_progress';
  else if (status === 'draft') status = 'draft';
  else status = 'open';

  await query(`UPDATE pools SET status = $2, updated_at = NOW() WHERE id = $1`, [poolId, status]);
}

export async function getPoolsContainingMatch(matchId) {
  const { rows } = await query(
    `SELECT DISTINCT pool_id FROM pool_matches WHERE match_id = $1`,
    [matchId]
  );
  return rows.map((r) => r.pool_id);
}
