import { query, withTransaction } from '../db.js';
import { ALBUM_SLUG } from '../seed/stickers-seed.js';

function mapAlbum(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    publisher: row.publisher,
    description: row.description,
    stickersPerPage: row.stickers_per_page,
    isActive: row.is_active,
    totalStickers: row.total_stickers != null ? Number(row.total_stickers) : undefined,
  };
}

function mapSticker(row) {
  return {
    id: row.id,
    albumId: row.album_id,
    code: row.code,
    title: row.title,
    category: row.category,
    teamId: row.team_id,
    teamName: row.team_name ?? null,
    teamFlag: row.team_flag ?? null,
    page: row.page,
    type: row.sticker_type,
    rarity: row.rarity,
    sortOrder: row.sort_order,
    quantity: row.quantity != null ? Number(row.quantity) : 0,
    reservedForTrade: row.reserved_for_trade != null ? Number(row.reserved_for_trade) : 0,
    owned: (row.quantity ?? 0) >= 1,
    duplicates: Math.max((Number(row.quantity) || 0) - 1, 0),
  };
}

export async function listAlbums() {
  const { rows } = await query(
    `SELECT a.*,
            (SELECT COUNT(*)::int FROM album_stickers s WHERE s.album_id = a.id) AS total_stickers
     FROM albums a WHERE a.is_active = true ORDER BY a.created_at`
  );
  return rows.map(mapAlbum);
}

export async function getAlbumById(id) {
  const { rows } = await query(
    `SELECT a.*,
            (SELECT COUNT(*)::int FROM album_stickers s WHERE s.album_id = a.id) AS total_stickers
     FROM albums a WHERE a.id = $1`,
    [id]
  );
  return rows[0] ? mapAlbum(rows[0]) : null;
}

export async function getDefaultAlbum() {
  const { rows } = await query(
    `SELECT a.*,
            (SELECT COUNT(*)::int FROM album_stickers s WHERE s.album_id = a.id) AS total_stickers
     FROM albums a WHERE a.slug = $1 LIMIT 1`,
    [ALBUM_SLUG]
  );
  if (rows[0]) return mapAlbum(rows[0]);
  const all = await listAlbums();
  return all[0] ?? null;
}

export async function listAlbumStickers(albumId) {
  const { rows } = await query(
    `SELECT s.*, t.name AS team_name, t.flag AS team_flag
     FROM album_stickers s
     LEFT JOIN teams t ON t.id = s.team_id
     WHERE s.album_id = $1
     ORDER BY s.sort_order`,
    [albumId]
  );
  return rows.map(mapSticker);
}

/** Coleção do usuário para um álbum: figurinhas + quantidades. */
export async function getUserAlbum(albumId, userId) {
  const { rows } = await query(
    `SELECT s.*, t.name AS team_name, t.flag AS team_flag,
            COALESCE(inv.quantity, 0) AS quantity,
            COALESCE(inv.reserved_for_trade, 0) AS reserved_for_trade
     FROM album_stickers s
     LEFT JOIN teams t ON t.id = s.team_id
     LEFT JOIN user_sticker_inventory inv
            ON inv.sticker_id = s.id AND inv.user_id = $2
     WHERE s.album_id = $1
     ORDER BY s.sort_order`,
    [albumId, userId]
  );
  return rows.map(mapSticker);
}

async function assertStickerInAlbum(albumId, stickerId) {
  const { rows } = await query(
    `SELECT id FROM album_stickers WHERE id = $1 AND album_id = $2`,
    [stickerId, albumId]
  );
  if (!rows.length) {
    throw Object.assign(new Error('Figurinha não pertence a este álbum'), { status: 404 });
  }
}

/** Define quantidade absoluta (>= 0). Ajusta reservadas se exceder repetidas. */
export async function setQuantity(albumId, userId, stickerId, quantity) {
  await assertStickerInAlbum(albumId, stickerId);
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));

  const { rows } = await query(
    `INSERT INTO user_sticker_inventory (user_id, sticker_id, quantity, reserved_for_trade, updated_at)
     VALUES ($1, $2, $3, 0, NOW())
     ON CONFLICT (user_id, sticker_id) DO UPDATE SET
       quantity = $3,
       reserved_for_trade = LEAST(user_sticker_inventory.reserved_for_trade, GREATEST($3 - 1, 0)),
       updated_at = NOW()
     RETURNING *`,
    [userId, stickerId, qty]
  );
  return rows[0];
}

export async function incrementSticker(albumId, userId, stickerId, delta = 1) {
  await assertStickerInAlbum(albumId, stickerId);
  const step = Math.trunc(Number(delta) || 1);

  const { rows } = await query(
    `INSERT INTO user_sticker_inventory (user_id, sticker_id, quantity, reserved_for_trade, updated_at)
     VALUES ($1, $2, GREATEST($3, 0), 0, NOW())
     ON CONFLICT (user_id, sticker_id) DO UPDATE SET
       quantity = GREATEST(user_sticker_inventory.quantity + $3, 0),
       reserved_for_trade = LEAST(
         user_sticker_inventory.reserved_for_trade,
         GREATEST(user_sticker_inventory.quantity + $3 - 1, 0)
       ),
       updated_at = NOW()
     RETURNING *`,
    [userId, stickerId, step]
  );
  return rows[0];
}

export async function decrementSticker(albumId, userId, stickerId) {
  return incrementSticker(albumId, userId, stickerId, -1);
}

/**
 * Atualização em lote por códigos. mode: 'increment' (soma) ou 'set' (define quantidade).
 * Retorna resumo com códigos aplicados e não encontrados.
 */
export async function bulkUpdate(albumId, userId, codes, { mode = 'increment', quantity = 1 } = {}) {
  if (!Array.isArray(codes) || !codes.length) {
    throw Object.assign(new Error('Informe ao menos um código'), { status: 400 });
  }

  const normalized = codes
    .map((c) => String(c).trim())
    .filter(Boolean);

  const counts = new Map();
  for (const code of normalized) counts.set(code, (counts.get(code) ?? 0) + 1);

  const uniqueCodes = [...counts.keys()];
  const { rows: found } = await query(
    `SELECT id, code FROM album_stickers WHERE album_id = $1 AND code = ANY($2::varchar[])`,
    [albumId, uniqueCodes]
  );
  const codeToId = Object.fromEntries(found.map((r) => [r.code, r.id]));

  const applied = [];
  const notFound = [];

  await withTransaction(async (client) => {
    for (const code of uniqueCodes) {
      const stickerId = codeToId[code];
      if (!stickerId) {
        notFound.push(code);
        continue;
      }
      const occurrences = counts.get(code);
      if (mode === 'set') {
        await client.query(
          `INSERT INTO user_sticker_inventory (user_id, sticker_id, quantity, reserved_for_trade, updated_at)
           VALUES ($1, $2, $3, 0, NOW())
           ON CONFLICT (user_id, sticker_id) DO UPDATE SET
             quantity = $3,
             reserved_for_trade = LEAST(user_sticker_inventory.reserved_for_trade, GREATEST($3 - 1, 0)),
             updated_at = NOW()`,
          [userId, stickerId, Math.max(0, Math.floor(Number(quantity) || 0))]
        );
      } else {
        const step = occurrences * Math.max(1, Math.floor(Number(quantity) || 1));
        await client.query(
          `INSERT INTO user_sticker_inventory (user_id, sticker_id, quantity, reserved_for_trade, updated_at)
           VALUES ($1, $2, $3, 0, NOW())
           ON CONFLICT (user_id, sticker_id) DO UPDATE SET
             quantity = user_sticker_inventory.quantity + $3,
             updated_at = NOW()`,
          [userId, stickerId, step]
        );
      }
      applied.push(code);
    }
  });

  return { applied, notFound, appliedCount: applied.length };
}

/** Define quantas repetidas estão reservadas para troca. */
export async function setReserved(albumId, userId, stickerId, reserved) {
  await assertStickerInAlbum(albumId, stickerId);
  const value = Math.max(0, Math.floor(Number(reserved) || 0));

  const { rows: invRows } = await query(
    `SELECT quantity FROM user_sticker_inventory WHERE user_id = $1 AND sticker_id = $2`,
    [userId, stickerId]
  );
  const quantity = invRows[0]?.quantity ?? 0;
  const maxReserve = Math.max(quantity - 1, 0);
  const finalReserved = Math.min(value, maxReserve);

  const { rows } = await query(
    `INSERT INTO user_sticker_inventory (user_id, sticker_id, quantity, reserved_for_trade, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, sticker_id) DO UPDATE SET
       reserved_for_trade = $4,
       updated_at = NOW()
     RETURNING *`,
    [userId, stickerId, quantity, finalReserved]
  );
  return rows[0];
}

export async function getMissing(albumId, userId) {
  const all = await getUserAlbum(albumId, userId);
  return all.filter((s) => !s.owned);
}

export async function getDuplicates(albumId, userId) {
  const all = await getUserAlbum(albumId, userId);
  return all.filter((s) => s.duplicates > 0);
}

export async function getStats(albumId, userId) {
  const stickers = await getUserAlbum(albumId, userId);
  const total = stickers.length;
  const owned = stickers.filter((s) => s.owned).length;
  const missing = total - owned;
  const duplicates = stickers.reduce((sum, s) => sum + s.duplicates, 0);
  const reserved = stickers.reduce((sum, s) => sum + s.reservedForTrade, 0);
  const completion = total ? Math.round((owned / total) * 1000) / 10 : 0;

  const byCategory = aggregate(stickers, (s) => s.category);
  const byTeam = aggregate(
    stickers.filter((s) => s.teamId),
    (s) => s.teamId,
    (s) => ({ teamId: s.teamId, teamName: s.teamName, teamFlag: s.teamFlag })
  );
  const byPage = aggregate(stickers, (s) => String(s.page), (s) => ({ page: s.page }));

  const pages = byPage
    .map((p) => ({ ...p, complete: p.owned === p.total, near: !p.complete && p.total - p.owned <= 2 }))
    .sort((a, b) => a.page - b.page);

  return {
    total,
    owned,
    missing,
    duplicates,
    reserved,
    completion,
    byCategory: byCategory.sort((a, b) => b.completion - a.completion),
    byTeam: byTeam.sort((a, b) => b.completion - a.completion),
    pages,
    pagesComplete: pages.filter((p) => p.complete).length,
    pagesNearComplete: pages.filter((p) => p.near).length,
  };
}

function aggregate(items, keyFn, metaFn = (s) => ({ key: keyFn(s) })) {
  const map = new Map();
  for (const s of items) {
    const key = keyFn(s);
    if (!map.has(key)) {
      map.set(key, { key, ...metaFn(s), total: 0, owned: 0 });
    }
    const entry = map.get(key);
    entry.total += 1;
    if (s.owned) entry.owned += 1;
  }
  return [...map.values()].map((e) => ({
    ...e,
    missing: e.total - e.owned,
    completion: e.total ? Math.round((e.owned / e.total) * 1000) / 10 : 0,
  }));
}
