import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, query } from './db.js';
import {
  TOURNAMENT, TEAMS, GROUPS, ALL_MATCHES, TOP_SCORERS,
} from './seed/schedule.js';
import { findUserByEmail, hashPassword } from './auth.js';
import { runPoolMigrations, seedPoolData } from './seed/pool-seed.js';
import { runStickerMigrations, seedStickerAlbum } from './seed/stickers-seed.js';
import { hasSyncedGoals, recalculateTopScorersFromGoals } from './goal-sync.js';
import { syncAllSquads } from './squad-sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await query(schema);
}

export async function seedDatabase() {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM teams');
  if (rows[0].n > 0) {
    console.log('Banco já populado — seed ignorado.');
    return;
  }

  console.log('Populando banco de dados...');

  for (const t of TEAMS) {
    await query(
      `INSERT INTO teams (id, name, flag, "group", confederation) VALUES ($1,$2,$3,$4,$5)`,
      [t.id, t.name, t.flag, t.group, t.confederation]
    );
  }

  for (const g of GROUPS) {
    await query(`INSERT INTO groups_meta (id, name) VALUES ($1,$2)`, [g.id, g.name]);
    for (const teamId of g.teams) {
      await query(`INSERT INTO group_teams (group_id, team_id) VALUES ($1,$2)`, [g.id, teamId]);
    }
  }

  for (const m of ALL_MATCHES) {
    await query(
      `INSERT INTO matches (id, phase, "group", matchday, match_date, match_time, venue, home_team, away_team, label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [m.id, m.phase, m.group, m.matchday, m.date, m.time, m.venue, m.home, m.away, m.label]
    );
  }

  for (const s of TOP_SCORERS) {
    await query(
      `INSERT INTO top_scorers (player, team_id, goals, assists) VALUES ($1,$2,$3,$4)`,
      [s.player, s.team, s.goals, s.assists]
    );
  }

  await query(
    `INSERT INTO app_preferences (id, score_sync_enabled) VALUES (1, $1) ON CONFLICT DO NOTHING`,
    [process.env.SYNC_ENABLED === 'true']
  );
  console.log(`Seed concluído: ${TEAMS.length} times, ${ALL_MATCHES.length} jogos.`);
}

/** Atualiza artilheiros — recalcula de gols importados ou limpa demo se torneio já começou. */
export async function syncTopScorers() {
  if (await hasSyncedGoals()) {
    await recalculateTopScorersFromGoals();
    return;
  }

  const { rows } = await query(`
    SELECT COUNT(*)::int AS n FROM match_results
    WHERE mode = 'real' AND status = 'finished'
      AND (COALESCE(home_score, 0) + COALESCE(away_score, 0)) > 0
  `);
  if (rows[0].n > 0) {
    await query(`DELETE FROM top_scorers`);
    return;
  }

  for (const s of TOP_SCORERS) {
    const updated = await query(
      `UPDATE top_scorers SET goals = $3, assists = $4
       WHERE player = $1 AND team_id = $2`,
      [s.player, s.team, s.goals, s.assists]
    );
    if (updated.rowCount === 0) {
      await query(
        `INSERT INTO top_scorers (player, team_id, goals, assists) VALUES ($1,$2,$3,$4)`,
        [s.player, s.team, s.goals, s.assists]
      );
    }
  }
}

export async function seedAdminUser() {
  const email = (process.env.ADMIN_EMAIL || 'admin@copa2026.local').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const existing = await findUserByEmail(email);
  if (existing) return;

  await query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')`,
    ['Administrador', email, await hashPassword(password)]
  );
  console.log(`Admin criado: ${email}`);
}

export async function initDatabase() {
  let retries = 15;
  while (retries > 0) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch {
      retries -= 1;
      console.log('Aguardando PostgreSQL...');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await runMigrations();
  await runPoolMigrations();
  await runStickerMigrations();
  await seedDatabase();
  await syncTopScorers();
  scheduleSquadSync();
  await seedAdminUser();
  await seedPoolData();
  await seedStickerAlbum();
}

/** Importa elencos sem bloquear o HTTP server. Em produção evita fotos (rate limit). */
export function scheduleSquadSync() {
  if (process.env.SQUAD_SYNC_ENABLED === 'false') return;

  const delayMs = Number(process.env.SQUAD_SYNC_DELAY_MS || 180000);
  const skipPhotos = process.env.SQUAD_SYNC_SKIP_PHOTOS === 'true'
    || process.env.NODE_ENV === 'production';

  setTimeout(() => {
    syncAllSquads({ skipPhotos })
      .then((squad) => {
        console.log(`[squad] ${squad.teams} seleções, ${squad.players} jogadores importados${skipPhotos ? ' (sem fotos)' : ''}`);
      })
      .catch((err) => {
        console.warn('[squad] falha ao importar elencos —', err.message);
      });
  }, delayMs);
}

export { TOURNAMENT } from './seed/schedule.js';
