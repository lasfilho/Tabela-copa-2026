import fs from 'fs';
import { computeGroupStandings } from '../js/engine.js';
import { resolveKnockoutBracket } from '../js/knockout-resolver.js';

const teams = JSON.parse(fs.readFileSync('./data/teams.json', 'utf8'));
const groups = JSON.parse(fs.readFileSync('./data/groups.json', 'utf8'));
const matches = JSON.parse(fs.readFileSync('./data/matches.json', 'utf8')).matches;
const data = {
  matches,
  teams: teams.teams,
  groups: groups.groups,
  teamMap: Object.fromEntries(teams.teams.map((t) => [t.id, t])),
};

for (const g of ['C', 'F']) {
  const st = computeGroupStandings(g, matches, groups.groups.find((x) => x.id === g).teams);
  console.log(`Grupo ${g}:`, st.map((s, i) => `${i + 1}º ${s.code} ${s.pts}pts`).join(', '));
}

const r = resolveKnockoutBracket(data);
console.log('\nR32-3:', r.find((m) => m.id === 'R32-3')?.home, 'x', r.find((m) => m.id === 'R32-3')?.away);
console.log('R32-4:', r.find((m) => m.id === 'R32-4')?.home, 'x', r.find((m) => m.id === 'R32-4')?.away);

const path = ['R32-4', 'R16-2', 'R16-3', 'R16-5', 'QF-2', 'SF-1'];
for (const id of ['R32-3', 'R32-4', 'R16-1', 'R16-2', 'R16-3', 'R16-4', 'R16-5', 'QF-2', 'QF-3', 'SF-1']) {
  const m = r.find((x) => x.id === id);
  if (m) console.log(`${id} (${m.date} ${m.time}): ${m.home || '?'} x ${m.away || '?'} | ${m.label}`);
}
