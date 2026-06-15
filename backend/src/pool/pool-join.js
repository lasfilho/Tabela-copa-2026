import crypto from 'crypto';
import { query, withTransaction } from '../db.js';
import { findUserByEmail } from '../auth.js';
import {
  getPoolById, fetchPoolMatches, isParticipant, audit, getPoolBySlug,
} from './pool-service.js';
import { canJoinPool } from './pool-timing.js';

async function findPendingInviteByToken(poolId, inviteToken) {
  const { rows } = await query(
    `SELECT id, invitee_user_id FROM pool_invites
     WHERE pool_id = $1 AND invite_token = $2 AND status = 'pending'
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [poolId, inviteToken]
  );
  return rows[0] ?? null;
}

function assertInviteTokenForUser(invite, userId) {
  if (invite?.invitee_user_id && invite.invitee_user_id !== userId) {
    throw Object.assign(new Error('Este convite é destinado a outro usuário'), { status: 403 });
  }
}

export async function joinPool(poolId, userId, { inviteToken = null } = {}) {
  const pool = await getPoolById(poolId);
  if (!pool) throw Object.assign(new Error('Bolão não encontrado'), { status: 404 });
  if (pool.status === 'archived' || pool.status === 'draft') {
    throw Object.assign(new Error('Este bolão não está aberto para adesão'), { status: 400 });
  }

  const existing = await isParticipant(poolId, userId);
  if (existing) throw Object.assign(new Error('Você já participa deste bolão'), { status: 409 });

  if (pool.visibility === 'private') {
    const { rows } = await query(
      `SELECT id FROM pool_invites
       WHERE pool_id = $1 AND invitee_user_id = $2 AND status = 'pending'
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [poolId, userId]
    );
    let tokenOk = false;
    if (inviteToken) {
      const invite = await findPendingInviteByToken(poolId, inviteToken);
      if (invite) {
        assertInviteTokenForUser(invite, userId);
        tokenOk = true;
      }
    }
    if (!rows.length && !tokenOk && pool.creatorId !== userId) {
      throw Object.assign(new Error('Bolão privado — somente convidados podem aderir'), { status: 403 });
    }
  } else if (pool.visibility === 'link') {
    let tokenOk = inviteToken === pool.inviteToken;
    if (!tokenOk && inviteToken) {
      const invite = await findPendingInviteByToken(poolId, inviteToken);
      if (invite) {
        assertInviteTokenForUser(invite, userId);
        tokenOk = true;
      }
    }
    if (!tokenOk) {
      throw Object.assign(new Error('Link de convite inválido'), { status: 403 });
    }
  }

  const matches = await fetchPoolMatches(poolId);
  const joinCheck = canJoinPool(matches, pool.joinDeadline);
  if (!joinCheck.ok) throw Object.assign(new Error(joinCheck.reason), { status: 400 });

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO pool_participants (pool_id, user_id) VALUES ($1, $2)`,
      [poolId, userId]
    );
    await client.query(
      `UPDATE pool_invites SET status = 'accepted', responded_at = NOW()
       WHERE pool_id = $1 AND invitee_user_id = $2 AND status = 'pending'`,
      [poolId, userId]
    );
  });

  await audit(poolId, userId, 'pool.joined', {});
  return getPoolById(poolId);
}

export async function joinPoolBySlug(slug, userId, opts) {
  const pool = await getPoolBySlug(slug);
  if (!pool) throw Object.assign(new Error('Bolão não encontrado'), { status: 404 });
  return joinPool(pool.id, userId, opts);
}

export async function createInvite(poolId, inviterId, {
  inviteeUserId = null,
  inviteeEmail = null,
  expiresInHours = 168,
} = {}) {
  const pool = await getPoolById(poolId);
  if (!pool) throw Object.assign(new Error('Bolão não encontrado'), { status: 404 });
  if (pool.creatorId !== inviterId) {
    throw Object.assign(new Error('Somente o criador pode convidar'), { status: 403 });
  }

  let targetUserId = inviteeUserId ? Number(inviteeUserId) : null;
  if (!targetUserId && inviteeEmail?.trim()) {
    const user = await findUserByEmail(inviteeEmail);
    if (!user) {
      throw Object.assign(new Error('E-mail não cadastrado no sistema'), { status: 404 });
    }
    targetUserId = user.id;
  }

  if (targetUserId) {
    if (pool.visibility !== 'private') {
      throw Object.assign(new Error('Convite por usuário só em bolões privados'), { status: 400 });
    }
    if (targetUserId === inviterId) {
      throw Object.assign(new Error('Você já é o criador deste bolão'), { status: 400 });
    }
    if (await isParticipant(poolId, targetUserId)) {
      throw Object.assign(new Error('Esta pessoa já participa do bolão'), { status: 409 });
    }
    const { rows: pending } = await query(
      `SELECT id FROM pool_invites
       WHERE pool_id = $1 AND invitee_user_id = $2 AND status = 'pending'
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [poolId, targetUserId]
    );
    if (pending.length) {
      throw Object.assign(new Error('Já existe convite pendente para esta pessoa'), { status: 409 });
    }
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const { rows } = await query(
    `INSERT INTO pool_invites (pool_id, inviter_id, invitee_user_id, invite_token, expires_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [poolId, inviterId, targetUserId, token, expiresAt]
  );

  let inviteeName = null;
  let inviteeEmailResolved = null;
  if (targetUserId) {
    const { rows: userRows } = await query(
      `SELECT name, email FROM users WHERE id = $1`,
      [targetUserId]
    );
    inviteeName = userRows[0]?.name ?? null;
    inviteeEmailResolved = userRows[0]?.email ?? null;
  }

  await audit(poolId, inviterId, 'pool.invite.created', { inviteeUserId: targetUserId, token });
  return {
    id: rows[0].id,
    inviteToken: token,
    inviteLink: `/boloes?join=${token}`,
    expiresAt: rows[0].expires_at,
    status: rows[0].status,
    inviteeUserId: targetUserId,
    inviteeName,
    inviteeEmail: inviteeEmailResolved,
    personal: Boolean(targetUserId),
  };
}

export async function respondInvite(inviteId, userId, accept) {
  const { rows } = await query(`SELECT * FROM pool_invites WHERE id = $1`, [inviteId]);
  const invite = rows[0];
  if (!invite) throw Object.assign(new Error('Convite não encontrado'), { status: 404 });
  if (invite.invitee_user_id && invite.invitee_user_id !== userId) {
    throw Object.assign(new Error('Convite destinado a outro usuário'), { status: 403 });
  }
  if (invite.status !== 'pending') {
    throw Object.assign(new Error('Convite já respondido ou expirado'), { status: 400 });
  }
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    await query(`UPDATE pool_invites SET status = 'expired' WHERE id = $1`, [inviteId]);
    throw Object.assign(new Error('Convite expirado'), { status: 400 });
  }

  if (accept) {
    await joinPool(invite.pool_id, userId, { inviteToken: invite.invite_token });
    await query(
      `UPDATE pool_invites SET status = 'accepted', responded_at = NOW() WHERE id = $1`,
      [inviteId]
    );
  } else {
    await query(
      `UPDATE pool_invites SET status = 'declined', responded_at = NOW() WHERE id = $1`,
      [inviteId]
    );
    await audit(invite.pool_id, userId, 'pool.invite.declined', { inviteId });
  }

  return { accepted: accept };
}

export async function listInvitesForPool(poolId, userId) {
  const pool = await getPoolById(poolId);
  if (!pool || pool.creatorId !== userId) {
    throw Object.assign(new Error('Acesso negado'), { status: 403 });
  }
  const { rows } = await query(
    `SELECT pi.*, u.name AS invitee_name, u.email AS invitee_email
     FROM pool_invites pi
     LEFT JOIN users u ON u.id = pi.invitee_user_id
     WHERE pi.pool_id = $1 ORDER BY pi.created_at DESC`,
    [poolId]
  );
  return rows.map((row) => ({
    id: row.id,
    poolId: row.pool_id,
    inviterId: row.inviter_id,
    inviteeUserId: row.invitee_user_id,
    inviteToken: row.invite_token,
    status: row.status,
    expiresAt: row.expires_at,
    respondedAt: row.responded_at,
    createdAt: row.created_at,
    inviteeName: row.invitee_name,
    inviteeEmail: row.invitee_email,
  }));
}

export async function listMyInvites(userId) {
  const { rows } = await query(
    `SELECT pi.*, p.name AS pool_name, p.slug AS pool_slug
     FROM pool_invites pi JOIN pools p ON p.id = pi.pool_id
     WHERE pi.invitee_user_id = $1 AND pi.status = 'pending'
       AND (pi.expires_at IS NULL OR pi.expires_at > NOW())`,
    [userId]
  );
  return rows;
}

export async function getInvitePreview(token) {
  if (!token?.trim()) {
    throw Object.assign(new Error('Token de convite inválido'), { status: 400 });
  }

  const { rows: invRows } = await query(
    `SELECT pi.*, p.name, p.slug, p.description, p.visibility, p.status, p.join_deadline
     FROM pool_invites pi JOIN pools p ON p.id = pi.pool_id
     WHERE pi.invite_token = $1 AND pi.status = 'pending'`,
    [token]
  );
  if (invRows[0]) {
    const inv = invRows[0];
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
      throw Object.assign(new Error('Convite expirado'), { status: 400 });
    }
    return {
      poolId: inv.pool_id,
      poolName: inv.name,
      slug: inv.slug,
      description: inv.description,
      visibility: inv.visibility,
      status: inv.status,
      joinDeadline: inv.join_deadline,
      expiresAt: inv.expires_at,
    };
  }

  const { rows: poolRows } = await query(
    `SELECT id, name, slug, description, visibility, status, join_deadline
     FROM pools WHERE invite_token = $1`,
    [token]
  );
  if (poolRows[0]) {
    const p = poolRows[0];
    return {
      poolId: p.id,
      poolName: p.name,
      slug: p.slug,
      description: p.description,
      visibility: p.visibility,
      status: p.status,
      joinDeadline: p.join_deadline,
      expiresAt: null,
    };
  }

  throw Object.assign(new Error('Convite não encontrado ou expirado'), { status: 404 });
}

export async function joinByInviteToken(userId, token) {
  const preview = await getInvitePreview(token);
  const pool = await joinPool(preview.poolId, userId, { inviteToken: token });
  await query(
    `UPDATE pool_invites SET status = 'accepted', responded_at = NOW()
     WHERE invite_token = $1 AND status = 'pending'`,
    [token]
  );
  return { pool, poolId: preview.poolId };
}
