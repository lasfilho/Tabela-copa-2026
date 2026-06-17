import { verifyToken } from './auth.js';
import { logAudit, describeRequest } from './audit-service.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function actorFromRequest(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = verifyToken(header.slice(7));
      return { id: payload.id, name: payload.name, email: payload.email, role: payload.role };
    } catch {
      return null;
    }
  }
  return null;
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress ?? null;
}

/**
 * Loga toda requisição mutante (POST/PUT/PATCH/DELETE) feita em /api,
 * com o ator (via JWT), método, caminho, status e corpo sanitizado.
 */
export function auditMiddleware(req, res, next) {
  if (!MUTATING.has(req.method)) return next();

  const actor = actorFromRequest(req);
  const originalUrl = req.originalUrl || req.url;
  const bodySnapshot = req.body && typeof req.body === 'object' ? { ...req.body } : {};
  const ip = clientIp(req);

  res.on('finish', () => {
    // Não audita falhas de autorização/leitura irrelevantes sem ator,
    // mas mantém tentativas de login (auth.*) mesmo sem token.
    const isAuth = originalUrl.startsWith('/api/auth/');
    if (!actor && !isAuth) return;

    const { action, entityType, entityId } = describeRequest(req.method, originalUrl);

    logAudit({
      userId: actor?.id ?? null,
      actorName: actor?.name ?? (isAuth ? bodySnapshot.email ?? null : null),
      actorEmail: actor?.email ?? (isAuth ? bodySnapshot.email ?? null : null),
      actorRole: actor?.role ?? null,
      action,
      entityType,
      entityId,
      method: req.method,
      path: originalUrl.split('?')[0],
      statusCode: res.statusCode,
      details: bodySnapshot,
      ip,
    });
  });

  next();
}
