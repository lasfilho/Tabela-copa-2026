import { Router } from 'express';
import { authMiddleware, requireAuth } from '../auth.js';
import {
  listAlbums, getAlbumById, getDefaultAlbum, listAlbumStickers,
  getUserAlbum, incrementSticker, decrementSticker, setQuantity,
  bulkUpdate, setReserved, getMissing, getDuplicates, getStats,
} from '../stickers/sticker-service.js';
import {
  getTradeSuggestions, listOffersForUser, createOffer, patchOffer, getTradeHistory,
} from '../stickers/trade-service.js';

const router = Router();
router.use(authMiddleware);

function handleError(err, res, next) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  next(err);
}

/** Resolve álbum a partir de :id na rota ou do álbum padrão. */
async function resolveAlbumId(req) {
  if (req.params.id) {
    const album = await getAlbumById(Number(req.params.id));
    if (!album) throw Object.assign(new Error('Álbum não encontrado'), { status: 404 });
    return album.id;
  }
  const album = await getDefaultAlbum();
  if (!album) throw Object.assign(new Error('Nenhum álbum disponível'), { status: 404 });
  return album.id;
}

/* ---------------- Catálogo ---------------- */

router.get('/albums', async (_req, res, next) => {
  try { res.json({ items: await listAlbums() }); } catch (err) { next(err); }
});

router.get('/albums/:id', async (req, res, next) => {
  try {
    const album = await getAlbumById(Number(req.params.id));
    if (!album) return res.status(404).json({ error: 'Álbum não encontrado' });
    res.json({ album });
  } catch (err) { next(err); }
});

router.get('/albums/:id/stickers', async (req, res, next) => {
  try { res.json({ items: await listAlbumStickers(Number(req.params.id)) }); } catch (err) { next(err); }
});

/* ---------------- Coleção do usuário ---------------- */

router.get('/me/album', requireAuth, async (req, res, next) => {
  try {
    const album = await getDefaultAlbum();
    if (!album) return res.status(404).json({ error: 'Nenhum álbum disponível' });
    const stickers = await getUserAlbum(album.id, req.user.id);
    res.json({ album, stickers });
  } catch (err) { next(err); }
});

router.post('/me/album/stickers/:stickerId/increment', requireAuth, async (req, res, next) => {
  try {
    const albumId = await resolveAlbumId(req);
    const row = await incrementSticker(albumId, req.user.id, Number(req.params.stickerId), 1);
    res.json({ inventory: row });
  } catch (err) { handleError(err, res, next); }
});

router.post('/me/album/stickers/:stickerId/decrement', requireAuth, async (req, res, next) => {
  try {
    const albumId = await resolveAlbumId(req);
    const row = await decrementSticker(albumId, req.user.id, Number(req.params.stickerId));
    res.json({ inventory: row });
  } catch (err) { handleError(err, res, next); }
});

router.post('/me/album/stickers/:stickerId/quantity', requireAuth, async (req, res, next) => {
  try {
    const albumId = await resolveAlbumId(req);
    const row = await setQuantity(albumId, req.user.id, Number(req.params.stickerId), req.body?.quantity);
    res.json({ inventory: row });
  } catch (err) { handleError(err, res, next); }
});

router.post('/me/album/stickers/:stickerId/reserve', requireAuth, async (req, res, next) => {
  try {
    const albumId = await resolveAlbumId(req);
    const row = await setReserved(albumId, req.user.id, Number(req.params.stickerId), req.body?.reserved);
    res.json({ inventory: row });
  } catch (err) { handleError(err, res, next); }
});

router.post('/me/album/bulk-update', requireAuth, async (req, res, next) => {
  try {
    const albumId = await resolveAlbumId(req);
    const { codes, mode, quantity } = req.body ?? {};
    const result = await bulkUpdate(albumId, req.user.id, codes, { mode, quantity });
    res.json(result);
  } catch (err) { handleError(err, res, next); }
});

router.get('/me/album/missing', requireAuth, async (req, res, next) => {
  try {
    const albumId = await resolveAlbumId(req);
    res.json({ items: await getMissing(albumId, req.user.id) });
  } catch (err) { handleError(err, res, next); }
});

router.get('/me/album/duplicates', requireAuth, async (req, res, next) => {
  try {
    const albumId = await resolveAlbumId(req);
    res.json({ items: await getDuplicates(albumId, req.user.id) });
  } catch (err) { handleError(err, res, next); }
});

router.get('/me/album/stats', requireAuth, async (req, res, next) => {
  try {
    const albumId = await resolveAlbumId(req);
    res.json({ stats: await getStats(albumId, req.user.id) });
  } catch (err) { handleError(err, res, next); }
});

/* ---------------- Trocas ---------------- */

router.get('/trades/suggestions', requireAuth, async (req, res, next) => {
  try {
    const albumId = await resolveAlbumId(req);
    res.json({ items: await getTradeSuggestions(albumId, req.user.id) });
  } catch (err) { handleError(err, res, next); }
});

router.get('/trades/offers', requireAuth, async (req, res, next) => {
  try {
    const albumId = await resolveAlbumId(req);
    res.json(await listOffersForUser(albumId, req.user.id));
  } catch (err) { handleError(err, res, next); }
});

router.post('/trades/offers', requireAuth, async (req, res, next) => {
  try {
    const albumId = await resolveAlbumId(req);
    const offerId = await createOffer(albumId, req.user.id, req.body ?? {});
    res.status(201).json({ offerId });
  } catch (err) { handleError(err, res, next); }
});

router.patch('/trades/offers/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await patchOffer(Number(req.params.id), req.user.id, req.body?.status);
    res.json(result);
  } catch (err) { handleError(err, res, next); }
});

router.get('/trades/history', requireAuth, async (req, res, next) => {
  try {
    const albumId = await resolveAlbumId(req);
    res.json({ items: await getTradeHistory(albumId, req.user.id) });
  } catch (err) { handleError(err, res, next); }
});

export default router;
