import { Router } from 'express';
import { authMiddleware, requireAdmin, requireAuth } from '../auth.js';
import {
  listUsers, changeOwnPassword, adminResetPassword, deleteUser,
} from '../admin-service.js';
import { listAuditEvents, listAuditActions } from '../audit-service.js';

const router = Router();
router.use(authMiddleware);

function handleError(err, res, next) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  next(err);
}

/** POST /api/admin/change-password — qualquer usuário autenticado */
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
    }
    await changeOwnPassword(req.user.id, currentPassword, newPassword);
    res.json({ ok: true });
  } catch (err) { handleError(err, res, next); }
});

/** GET /api/admin/users */
router.get('/users', requireAdmin, async (req, res, next) => {
  try {
    res.json({ items: await listUsers() });
  } catch (err) { next(err); }
});

/** DELETE /api/admin/users/:id */
router.delete('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const result = await deleteUser(req.user.id, Number(req.params.id));
    res.json(result);
  } catch (err) { handleError(err, res, next); }
});

/** POST /api/admin/users/:id/reset-password */
router.post('/users/:id/reset-password', requireAdmin, async (req, res, next) => {
  try {
    const { newPassword } = req.body ?? {};
    const user = await adminResetPassword(req.user.id, Number(req.params.id), newPassword);
    res.json({ user });
  } catch (err) { handleError(err, res, next); }
});

/** GET /api/admin/audit — log de auditoria (admin) */
router.get('/audit', requireAdmin, async (req, res, next) => {
  try {
    const result = await listAuditEvents({
      limit: req.query.limit,
      offset: req.query.offset,
      action: req.query.action || null,
      userId: req.query.userId || null,
      search: req.query.q?.trim() || null,
    });
    res.json(result);
  } catch (err) { next(err); }
});

/** GET /api/admin/audit/actions — ações distintas para filtro */
router.get('/audit/actions', requireAdmin, async (_req, res, next) => {
  try {
    res.json({ items: await listAuditActions() });
  } catch (err) { next(err); }
});

export default router;
