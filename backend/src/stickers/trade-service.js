import { query, withTransaction } from '../db.js';

/**
 * Sugestões de troca: cruza minhas faltantes com repetidas de outros usuários
 * e minhas repetidas com faltantes de outros (limitado a quem já tem coleção no álbum).
 */
export async function getTradeSuggestions(albumId, userId) {
  const theyHave = await query(
    `SELECT inv.user_id, u.name AS user_name,
            s.id AS sticker_id, s.code, s.title, s.category
     FROM user_sticker_inventory inv
     JOIN album_stickers s ON s.id = inv.sticker_id
     JOIN users u ON u.id = inv.user_id
     WHERE s.album_id = $1
       AND inv.user_id <> $2
       AND inv.quantity >= 2
       AND NOT EXISTS (
         SELECT 1 FROM user_sticker_inventory mine
         WHERE mine.user_id = $2 AND mine.sticker_id = s.id AND mine.quantity >= 1
       )
     ORDER BY s.sort_order`,
    [albumId, userId]
  );

  const iHave = await query(
    `WITH active_users AS (
       SELECT DISTINCT inv.user_id FROM user_sticker_inventory inv
       JOIN album_stickers s ON s.id = inv.sticker_id
       WHERE s.album_id = $1 AND inv.user_id <> $2
     ),
     my_dups AS (
       SELECT inv.sticker_id FROM user_sticker_inventory inv
       JOIN album_stickers s ON s.id = inv.sticker_id
       WHERE s.album_id = $1 AND inv.user_id = $2 AND inv.quantity >= 2
     )
     SELECT au.user_id, u.name AS user_name,
            s.id AS sticker_id, s.code, s.title, s.category
     FROM my_dups md
     CROSS JOIN active_users au
     JOIN album_stickers s ON s.id = md.sticker_id
     JOIN users u ON u.id = au.user_id
     WHERE NOT EXISTS (
       SELECT 1 FROM user_sticker_inventory other
       WHERE other.user_id = au.user_id AND other.sticker_id = s.id AND other.quantity >= 1
     )
     ORDER BY s.sort_order`,
    [albumId, userId]
  );

  const byUser = new Map();
  const ensure = (id, name) => {
    if (!byUser.has(id)) {
      byUser.set(id, { userId: id, userName: name, theyOffer: [], iOffer: [] });
    }
    return byUser.get(id);
  };

  for (const r of theyHave.rows) {
    ensure(r.user_id, r.user_name).theyOffer.push({
      stickerId: r.sticker_id, code: r.code, title: r.title, category: r.category,
    });
  }
  for (const r of iHave.rows) {
    ensure(r.user_id, r.user_name).iOffer.push({
      stickerId: r.sticker_id, code: r.code, title: r.title, category: r.category,
    });
  }

  return [...byUser.values()]
    .map((u) => ({ ...u, score: Math.min(u.theyOffer.length, u.iOffer.length) }))
    .sort((a, b) => b.score - a.score || (b.theyOffer.length - a.theyOffer.length));
}

async function loadOfferMatches(offerIds) {
  if (!offerIds.length) return {};
  const { rows } = await query(
    `SELECT m.offer_id, m.direction, m.quantity,
            s.id AS sticker_id, s.code, s.title, s.category
     FROM sticker_trade_matches m
     JOIN album_stickers s ON s.id = m.sticker_id
     WHERE m.offer_id = ANY($1::int[])
     ORDER BY s.sort_order`,
    [offerIds]
  );
  const grouped = {};
  for (const r of rows) {
    grouped[r.offer_id] ??= { offer: [], request: [] };
    grouped[r.offer_id][r.direction].push({
      stickerId: r.sticker_id, code: r.code, title: r.title, category: r.category, quantity: r.quantity,
    });
  }
  return grouped;
}

function mapOffer(row, matches) {
  const m = matches[row.id] ?? { offer: [], request: [] };
  return {
    id: row.id,
    albumId: row.album_id,
    fromUserId: row.from_user_id,
    fromUserName: row.from_user_name,
    toUserId: row.to_user_id,
    toUserName: row.to_user_name,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    offered: m.offer,
    requested: m.request,
  };
}

export async function listOffersForUser(albumId, userId) {
  const { rows } = await query(
    `SELECT o.*, fu.name AS from_user_name, tu.name AS to_user_name
     FROM sticker_trade_offers o
     JOIN users fu ON fu.id = o.from_user_id
     LEFT JOIN users tu ON tu.id = o.to_user_id
     WHERE o.album_id = $1 AND (o.from_user_id = $2 OR o.to_user_id = $2)
     ORDER BY o.updated_at DESC`,
    [albumId, userId]
  );
  const matches = await loadOfferMatches(rows.map((r) => r.id));
  const offers = rows.map((r) => mapOffer(r, matches));
  return {
    incoming: offers.filter((o) => o.toUserId === userId),
    outgoing: offers.filter((o) => o.fromUserId === userId),
  };
}

export async function createOffer(albumId, fromUserId, payload) {
  const { toUserId, message } = payload;
  const toArray = (v) => (Array.isArray(v) ? v : (v == null ? [] : [v]));
  const offerStickerIds = toArray(payload.offerStickerIds).map(Number).filter(Boolean);
  const requestStickerIds = toArray(payload.requestStickerIds).map(Number).filter(Boolean);
  if (!toUserId) throw Object.assign(new Error('Selecione o usuário da troca'), { status: 400 });
  if (Number(toUserId) === Number(fromUserId)) {
    throw Object.assign(new Error('Não é possível trocar consigo mesmo'), { status: 400 });
  }
  if (!offerStickerIds.length && !requestStickerIds.length) {
    throw Object.assign(new Error('Inclua figurinhas na oferta'), { status: 400 });
  }

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO sticker_trade_offers (album_id, from_user_id, to_user_id, status, message)
       VALUES ($1, $2, $3, 'pending', $4) RETURNING id`,
      [albumId, fromUserId, toUserId, message ?? null]
    );
    const offerId = rows[0].id;

    for (const sid of offerStickerIds) {
      await client.query(
        `INSERT INTO sticker_trade_matches (offer_id, sticker_id, direction, quantity)
         VALUES ($1, $2, 'offer', 1)`,
        [offerId, sid]
      );
    }
    for (const sid of requestStickerIds) {
      await client.query(
        `INSERT INTO sticker_trade_matches (offer_id, sticker_id, direction, quantity)
         VALUES ($1, $2, 'request', 1)`,
        [offerId, sid]
      );
    }

    await client.query(
      `INSERT INTO sticker_trade_history (offer_id, user_id, action, details)
       VALUES ($1, $2, 'created', $3::jsonb)`,
      [offerId, fromUserId, JSON.stringify({ toUserId })]
    );

    return offerId;
  });
}

const ALLOWED_TRANSITIONS = {
  accepted: ['to', 'pending'],
  declined: ['to', 'pending'],
  cancelled: ['from', 'pending'],
  completed: ['both', 'accepted'],
};

export async function patchOffer(offerId, userId, status) {
  const transition = ALLOWED_TRANSITIONS[status];
  if (!transition) throw Object.assign(new Error('Status inválido'), { status: 400 });

  const { rows } = await query(
    `SELECT * FROM sticker_trade_offers WHERE id = $1`,
    [offerId]
  );
  const offer = rows[0];
  if (!offer) throw Object.assign(new Error('Oferta não encontrada'), { status: 404 });

  const [who, fromStatus] = transition;
  const isFrom = offer.from_user_id === userId;
  const isTo = offer.to_user_id === userId;
  if (who === 'to' && !isTo) throw Object.assign(new Error('Apenas o destinatário pode fazer isso'), { status: 403 });
  if (who === 'from' && !isFrom) throw Object.assign(new Error('Apenas quem criou pode cancelar'), { status: 403 });
  if (who === 'both' && !isFrom && !isTo) throw Object.assign(new Error('Sem permissão'), { status: 403 });
  if (offer.status !== fromStatus) {
    throw Object.assign(new Error(`Não é possível alterar uma oferta com status "${offer.status}"`), { status: 409 });
  }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE sticker_trade_offers SET status = $2, updated_at = NOW() WHERE id = $1`,
      [offerId, status]
    );
    await client.query(
      `INSERT INTO sticker_trade_history (offer_id, user_id, action, details)
       VALUES ($1, $2, $3, '{}'::jsonb)`,
      [offerId, userId, status]
    );
  });

  return { id: offerId, status };
}

export async function getTradeHistory(albumId, userId) {
  const { rows } = await query(
    `SELECT h.id, h.offer_id, h.action, h.created_at,
            actor.name AS actor_name,
            o.from_user_id, o.to_user_id,
            fu.name AS from_user_name, tu.name AS to_user_name
     FROM sticker_trade_history h
     JOIN sticker_trade_offers o ON o.id = h.offer_id
     LEFT JOIN users actor ON actor.id = h.user_id
     JOIN users fu ON fu.id = o.from_user_id
     LEFT JOIN users tu ON tu.id = o.to_user_id
     WHERE o.album_id = $1 AND (o.from_user_id = $2 OR o.to_user_id = $2)
     ORDER BY h.created_at DESC
     LIMIT 100`,
    [albumId, userId]
  );
  return rows.map((r) => ({
    id: r.id,
    offerId: r.offer_id,
    action: r.action,
    actorName: r.actor_name,
    fromUserName: r.from_user_name,
    toUserName: r.to_user_name,
    createdAt: r.created_at,
  }));
}
