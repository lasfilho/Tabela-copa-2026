import { query } from './db.js';

const SENSITIVE_KEYS = new Set([
  'password', 'newpassword', 'currentpassword', 'confirmpassword', 'token', 'passwordhash',
]);

/** Remove campos sensíveis e limita o tamanho do payload guardado. */
function sanitizeDetails(body) {
  if (!body || typeof body !== 'object') return {};
  const clean = {};
  for (const [key, value] of Object.entries(body)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      clean[key] = '***';
      continue;
    }
    if (typeof value === 'string' && value.length > 300) {
      clean[key] = `${value.slice(0, 300)}…`;
    } else if (Array.isArray(value) && value.length > 50) {
      clean[key] = `[${value.length} itens]`;
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

/** Deriva uma ação semântica a partir do método e caminho. */
export function describeRequest(method, rawPath) {
  const path = rawPath.split('?')[0];
  const parts = path.replace(/^\/api\//, '').split('/').filter(Boolean);
  const entityType = parts[0] || 'api';

  const rules = [
    [/^POST \/api\/auth\/login$/, 'auth.login'],
    [/^POST \/api\/auth\/register$/, 'auth.register'],
    [/^PUT \/api\/matches\/[^/]+\/score$/, 'match.score.update'],
    [/^PUT \/api\/matches\/[^/]+\/status$/, 'match.status.update'],
    [/^DELETE \/api\/scores/, 'match.scores.clear'],
    [/^PUT \/api\/preferences$/, 'preferences.update'],
    [/^POST \/api\/sync/, 'sync.run'],
    [/^POST \/api\/pools$/, 'pool.create'],
    [/^PATCH \/api\/pools\/[^/]+$/, 'pool.update'],
    [/^DELETE \/api\/pools\/[^/]+$/, 'pool.delete'],
    [/^POST \/api\/pools\/[^/]+\/join/, 'pool.join'],
    [/^POST \/api\/pools\/[^/]+\/invites/, 'pool.invite.create'],
    [/^POST \/api\/pools\/[^/]+\/predictions/, 'pool.prediction.save'],
    [/^POST \/api\/pools\/[^/]+\/recalculate/, 'pool.recalculate'],
    [/^POST \/api\/stickers\/me\/album\/bulk-update/, 'sticker.bulk_update'],
    [/^POST \/api\/stickers\/me\/album\/stickers\/[^/]+\/increment/, 'sticker.increment'],
    [/^POST \/api\/stickers\/me\/album\/stickers\/[^/]+\/decrement/, 'sticker.decrement'],
    [/^POST \/api\/stickers\/me\/album\/stickers\/[^/]+\/(quantity|reserve)/, 'sticker.update'],
    [/^POST \/api\/stickers\/trades\/offers/, 'trade.offer.create'],
    [/^PATCH \/api\/stickers\/trades\/offers/, 'trade.offer.update'],
    [/^POST \/api\/admin\/change-password$/, 'admin.password.change'],
    [/^POST \/api\/admin\/users\/[^/]+\/reset-password/, 'admin.user.reset_password'],
    [/^DELETE \/api\/admin\/users\/[^/]+$/, 'admin.user.delete'],
  ];

  const sig = `${method} ${path}`;
  for (const [re, action] of rules) {
    if (re.test(sig)) return { action, entityType, entityId: parts[1] ?? null };
  }
  return { action: `${entityType}.${method.toLowerCase()}`, entityType, entityId: parts[1] ?? null };
}

/** Registra um evento de auditoria. Nunca lança erro para o chamador. */
export async function logAudit(event) {
  try {
    await query(
      `INSERT INTO audit_events
         (user_id, actor_name, actor_email, actor_role, action, entity_type, entity_id,
          method, path, status_code, details, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        event.userId ?? null,
        event.actorName ?? null,
        event.actorEmail ?? null,
        event.actorRole ?? null,
        event.action,
        event.entityType ?? null,
        event.entityId ?? null,
        event.method ?? null,
        event.path ?? null,
        event.statusCode ?? null,
        JSON.stringify(sanitizeDetails(event.details)),
        event.ip ?? null,
      ]
    );
  } catch (err) {
    console.warn('[audit] falha ao registrar evento —', err.message);
  }
}

export async function listAuditEvents({ limit = 50, offset = 0, action = null, userId = null, search = null } = {}) {
  const where = [];
  const params = [];

  if (action) { params.push(action); where.push(`a.action = $${params.length}`); }
  if (userId) { params.push(Number(userId)); where.push(`a.user_id = $${params.length}`); }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(COALESCE(u.name, a.actor_name) ILIKE $${params.length}
                 OR COALESCE(u.email, a.actor_email) ILIKE $${params.length}
                 OR a.action ILIKE $${params.length}
                 OR a.path ILIKE $${params.length})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRes = await query(
    `SELECT COUNT(*)::int AS n FROM audit_events a
     LEFT JOIN users u ON u.id = a.user_id ${whereSql}`,
    params
  );
  const total = totalRes.rows[0].n;

  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  params.push(lim); params.push(off);

  const { rows } = await query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.method, a.path,
            a.status_code, a.details, a.ip, a.created_at,
            a.user_id,
            COALESCE(u.name, a.actor_name) AS actor_name,
            COALESCE(u.email, a.actor_email) AS actor_email,
            COALESCE(u.role::text, a.actor_role) AS actor_role
     FROM audit_events a
     LEFT JOIN users u ON u.id = a.user_id
     ${whereSql}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const items = rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    method: r.method,
    path: r.path,
    statusCode: r.status_code,
    details: r.details,
    ip: r.ip,
    createdAt: r.created_at,
    userId: r.user_id,
    actorName: r.actor_name,
    actorEmail: r.actor_email,
    actorRole: r.actor_role,
  }));

  return { items, total, limit: lim, offset: off };
}

export async function listAuditActions() {
  const { rows } = await query(
    `SELECT action, COUNT(*)::int AS n FROM audit_events GROUP BY action ORDER BY action`
  );
  return rows.map((r) => ({ action: r.action, count: r.n }));
}
