/**
 * Reimporta elencos de todas as seleções a partir do fifa-squads.json.
 * Uso:
 *   node scripts/sync-all-squads.js              # com fotos (lento, rate limit)
 *   node scripts/sync-all-squads.js --skip-photos # só dados FIFA (rápido)
 */
import { pool } from '../src/db.js';
import { syncAllSquads, syncTeamSquad } from '../src/squad-sync.js';

const skipPhotos = process.argv.includes('--skip-photos');
const teamOnly = process.argv.find((a) => /^[A-Z]{3}$/.test(a));

if (teamOnly) {
  const count = await syncTeamSquad(teamOnly, { skipPhotos });
  console.log(`[sync-all-squads] ${teamOnly}: ${count} jogadores`);
} else {
  const result = await syncAllSquads({ skipPhotos });
  console.log(`[sync-all-squads] ${result.teams} seleções, ${result.players} jogadores`);
}

await pool.end();
