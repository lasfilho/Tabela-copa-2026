import { query, withTransaction } from './db.js';
import { findUserById, hashPassword, publicUser, verifyPassword } from './auth.js';

export async function listUsers() {
  const { rows } = await query(
    `SELECT id, name, email, role, created_at FROM users ORDER BY role DESC, name`
  );
  return rows.map((r) => ({
    ...publicUser(r),
    createdAt: r.created_at,
  }));
}

export async function changeOwnPassword(userId, currentPassword, newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw Object.assign(new Error('Nova senha deve ter pelo menos 6 caracteres'), { status: 400 });
  }
  const { rows } = await query(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
  if (!rows.length) throw Object.assign(new Error('Usuário não encontrado'), { status: 404 });
  if (!(await verifyPassword(currentPassword, rows[0].password_hash))) {
    throw Object.assign(new Error('Senha atual incorreta'), { status: 401 });
  }
  await query(
    `UPDATE users SET password_hash = $2 WHERE id = $1`,
    [userId, await hashPassword(newPassword)]
  );
}

export async function adminResetPassword(adminId, targetUserId, newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw Object.assign(new Error('Nova senha deve ter pelo menos 6 caracteres'), { status: 400 });
  }
  const target = await findUserById(targetUserId);
  if (!target) throw Object.assign(new Error('Usuário não encontrado'), { status: 404 });
  await query(
    `UPDATE users SET password_hash = $2 WHERE id = $1`,
    [targetUserId, await hashPassword(newPassword)]
  );
  return publicUser(target);
}

export async function deleteUser(adminId, targetUserId) {
  if (adminId === targetUserId) {
    throw Object.assign(new Error('Você não pode excluir sua própria conta'), { status: 400 });
  }

  const target = await findUserById(targetUserId);
  if (!target) throw Object.assign(new Error('Usuário não encontrado'), { status: 404 });

  if (target.role === 'admin') {
    const { rows } = await query(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin'`);
    if (rows[0].n <= 1) {
      throw Object.assign(new Error('Não é possível excluir o único administrador'), { status: 400 });
    }
  }

  await withTransaction(async (client) => {
    const poolIds = await client.query(`SELECT id FROM pools WHERE creator_id = $1`, [targetUserId]);
    for (const row of poolIds.rows) {
      await client.query(`DELETE FROM pools WHERE id = $1`, [row.id]);
    }

    await client.query(`DELETE FROM pool_participants WHERE user_id = $1`, [targetUserId]);
    await client.query(
      `DELETE FROM pool_invites WHERE inviter_id = $1 OR invitee_user_id = $1`,
      [targetUserId]
    );
    await client.query(`DELETE FROM users WHERE id = $1`, [targetUserId]);
  });

  return { deleted: true, id: targetUserId };
}
