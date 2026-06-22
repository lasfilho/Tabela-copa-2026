/**
 * Sincroniza data/embedded.js a partir dos JSONs locais.
 * Preferir: node scripts/sync-schedule.mjs (usa schedule.js como fonte).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const scriptDir = __dirname;
try {
  execSync('node scripts/sync-schedule.mjs', { cwd: path.join(scriptDir, '..'), stdio: 'inherit' });
} catch {
  // fallback legado
  const dataDir = path.join(scriptDir, '..', 'data');
  const teams = JSON.parse(fs.readFileSync(path.join(dataDir, 'teams.json'), 'utf8'));
  const groups = JSON.parse(fs.readFileSync(path.join(dataDir, 'groups.json'), 'utf8'));
  const matches = JSON.parse(fs.readFileSync(path.join(dataDir, 'matches.json'), 'utf8'));
  const stats = JSON.parse(fs.readFileSync(path.join(dataDir, 'stats.json'), 'utf8'));
  const bundle = {
    tournament: teams.tournament,
    teams: teams.teams,
    groups: groups.groups,
    matches: matches.matches,
    stats,
  };
  fs.writeFileSync(
    path.join(dataDir, 'embedded.js'),
    `window.COPA_EMBEDDED=${JSON.stringify(bundle)};`
  );
  console.log('embedded.js atualizado com', bundle.matches.length, 'jogos.');
}
