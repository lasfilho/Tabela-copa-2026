/**
 * Reimporta elenco de uma seleção (ex.: node scripts/sync-team-squad.js BRA)
 */
import { pool } from '../src/db.js';
import { syncTeamSquad } from '../src/squad-sync.js';

const teamId = process.argv[2]?.toUpperCase();
if (!teamId) {
  console.error('Uso: node scripts/sync-team-squad.js BRA');
  process.exit(1);
}

const count = await syncTeamSquad(teamId);
console.log(`[sync-team-squad] ${teamId}: ${count} jogadores`);
await pool.end();
