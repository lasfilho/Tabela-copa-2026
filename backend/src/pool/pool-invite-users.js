import { query } from '../db.js';
import { getPoolById } from './pool-service.js';

const MIN_QUERY_LEN = 2;
const MAX_RESULTS = 15;

/**
 * Busca usuários cadastrados para convite em bolão privado.
 * Somente o criador; mínimo 2 caracteres; exclui participantes e convites pendentes.
 */
export async function searchUsersForPoolInvite(poolId, creatorId, rawQuery) {
  const pool = await getPoolById(poolId);
  if (!pool) throw Object.assign(new Error('Bolão não encontrado'), { status: 404 });
  if (pool.creatorId !== creatorId) {
    throw Object.assign(new Error('Somente o criador pode convidar'), { status: 403 });
  }
  if (pool.visibility !== 'private') {
    throw Object.assign(new Error('Busca de usuários só em bolões privados'), { status: 400 });
  }

  const q = rawQuery?.trim() ?? '';
  if (q.length < MIN_QUERY_LEN) {
    return { items: [], query: q, minLength: MIN_QUERY_LEN };
  }

  const pattern = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
  const { rows } = await query(
    `SELECT u.id, u.name, u.email
     FROM users u
     WHERE u.id <> $1
       AND (u.name ILIKE $2 ESCAPE '\\' OR u.email ILIKE $2 ESCAPE '\\')
       AND NOT EXISTS (
         SELECT 1 FROM pool_participants pp
         WHERE pp.pool_id = $3 AND pp.user_id = u.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM pool_invites pi
         WHERE pi.pool_id = $3 AND pi.invitee_user_id = u.id AND pi.status = 'pending'
           AND (pi.expires_at IS NULL OR pi.expires_at > NOW())
       )
     ORDER BY u.name ASC
     LIMIT $4`,
    [creatorId, pattern, poolId, MAX_RESULTS]
  );

  return {
    items: rows.map((r) => ({ id: r.id, name: r.name, email: r.email })),
    query: q,
    minLength: MIN_QUERY_LEN,
  };
}
