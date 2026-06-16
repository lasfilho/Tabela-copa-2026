import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, withTransaction } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ALBUM_SLUG = 'copa-2026';
const STICKERS_PER_PAGE = 20;
const PLAYERS_PER_TEAM = 18;

/** Figurinhas especiais de abertura (sem seleção). */
const SPECIAL_STICKERS = [
  { title: 'Logo Oficial Copa 2026', category: 'especial', type: 'brilhante', rarity: 'rara' },
  { title: 'Taça do Mundo', category: 'especial', type: 'brilhante', rarity: 'rara' },
  { title: 'Mascote Oficial', category: 'especial', type: 'brilhante', rarity: 'rara' },
  { title: 'Bola Oficial', category: 'especial', type: 'comum' },
  { title: 'Estádio - Final', category: 'estadio', type: 'comum' },
  { title: 'Estádio - Abertura', category: 'estadio', type: 'comum' },
  { title: 'Sedes EUA', category: 'especial', type: 'comum' },
  { title: 'Sedes México', category: 'especial', type: 'comum' },
  { title: 'Sedes Canadá', category: 'especial', type: 'comum' },
  { title: 'Pôster da Copa', category: 'especial', type: 'brilhante', rarity: 'rara' },
];

export async function runStickerMigrations() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema-stickers.sql'), 'utf8');
  await query(sql);
}

/** Gera a lista completa de figurinhas a partir das seleções cadastradas. */
async function buildStickerRows() {
  const { rows: teams } = await query(
    `SELECT id, name, "group" FROM teams ORDER BY "group", name`
  );

  const stickers = [];
  let order = 0;
  let num = 0;

  const pageFor = () => Math.floor(order / STICKERS_PER_PAGE) + 1;

  for (const s of SPECIAL_STICKERS) {
    num += 1;
    stickers.push({
      code: String(num),
      title: s.title,
      category: s.category,
      teamId: null,
      page: pageFor(),
      type: s.type ?? 'comum',
      rarity: s.rarity ?? null,
      sortOrder: order,
    });
    order += 1;
  }

  for (const team of teams) {
    num += 1;
    stickers.push({
      code: String(num),
      title: `${team.name} — Escudo`,
      category: 'escudo',
      teamId: team.id,
      page: pageFor(),
      type: 'brilhante',
      rarity: null,
      sortOrder: order,
    });
    order += 1;

    for (let p = 1; p <= PLAYERS_PER_TEAM; p++) {
      num += 1;
      stickers.push({
        code: String(num),
        title: `${team.name} — Figurinha ${p}`,
        category: 'jogador',
        teamId: team.id,
        page: pageFor(),
        type: 'comum',
        rarity: null,
        sortOrder: order,
      });
      order += 1;
    }
  }

  return stickers;
}

export async function seedStickerAlbum() {
  const { rows: existing } = await query(
    `SELECT id FROM albums WHERE slug = $1 LIMIT 1`,
    [ALBUM_SLUG]
  );

  let albumId = existing[0]?.id;

  if (!albumId) {
    const ins = await query(
      `INSERT INTO albums (slug, name, publisher, description, stickers_per_page)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        ALBUM_SLUG,
        'Álbum Oficial Copa 2026',
        'Edição Dashboard',
        'Álbum de figurinhas da Copa do Mundo FIFA 2026 — controle de coleção, faltantes, repetidas e trocas.',
        STICKERS_PER_PAGE,
      ]
    );
    albumId = ins.rows[0].id;
  }

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS n FROM album_stickers WHERE album_id = $1`,
    [albumId]
  );
  if (countRows[0].n > 0) {
    return { albumId, created: 0 };
  }

  const stickers = await buildStickerRows();
  if (!stickers.length) {
    console.warn('[stickers] nenhuma seleção encontrada — álbum sem figurinhas por enquanto.');
    return { albumId, created: 0 };
  }

  await withTransaction(async (client) => {
    for (const s of stickers) {
      await client.query(
        `INSERT INTO album_stickers
           (album_id, code, title, category, team_id, page, sticker_type, rarity, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (album_id, code) DO NOTHING`,
        [albumId, s.code, s.title, s.category, s.teamId, s.page, s.type, s.rarity, s.sortOrder]
      );
    }
  });

  console.log(`[stickers] álbum "${ALBUM_SLUG}" populado: ${stickers.length} figurinhas.`);
  return { albumId, created: stickers.length };
}
