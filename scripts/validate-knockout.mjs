/**
 * Valida confrontos do mata-mata contra chaveamento FIFA (Annex C + fluxo R16–Final).
 * Referência: Wikipedia/CBS Sports pós fase de grupos (combinação BDEFGIJKL).
 */
import fs from 'fs';
import { computeGroupStandings } from '../js/engine.js';
import { resolveKnockoutBracket, annexCKey } from '../js/knockout-resolver.js';

const teams = JSON.parse(fs.readFileSync('./data/teams.json', 'utf8'));
const groups = JSON.parse(fs.readFileSync('./data/groups.json', 'utf8'));
const base = JSON.parse(fs.readFileSync('./data/matches.json', 'utf8')).matches;

/** Placares reais pós fase de grupos (jun/2026 — ge/CBS/Wikipedia). */
const REAL_SCORES = {
  'GA-1': [2, 0], 'GA-2': [0, 0], 'GA-3': [2, 0], 'GA-4': [0, 0], 'GA-5': [0, 0], 'GA-6': [0, 2],
  'GB-1': [2, 1], 'GB-2': [1, 1], 'GB-3': [1, 0], 'GB-4': [4, 1], 'GB-5': [1, 0], 'GB-6': [0, 2],
  'GC-1': [1, 1], 'GC-2': [0, 1], 'GC-3': [0, 1], 'GC-4': [3, 0], 'GC-5': [1, 0], 'GC-6': [0, 0],
  'GD-1': [2, 1], 'GD-2': [0, 0], 'GD-3': [2, 0], 'GD-4': [2, 1], 'GD-5': [1, 0], 'GD-6': [0, 0],
  'GE-1': [2, 0], 'GE-2': [1, 0], 'GE-3': [2, 0], 'GE-4': [0, 0], 'GE-5': [0, 0], 'GE-6': [0, 0],
  'GF-1': [2, 2], 'GF-2': [5, 1], 'GF-3': [5, 1], 'GF-4': [0, 4], 'GF-5': [0, 0], 'GF-6': [0, 0],
  'GG-1': [1, 0], 'GG-2': [0, 0], 'GG-3': [0, 0], 'GG-4': [0, 0], 'GG-5': [0, 0], 'GG-6': [0, 0],
  'GH-1': [0, 0], 'GH-2': [0, 0], 'GH-3': [0, 0], 'GH-4': [0, 0], 'GH-5': [0, 0], 'GH-6': [0, 0],
  'GI-1': [0, 0], 'GI-2': [0, 0], 'GI-3': [0, 0], 'GI-4': [0, 0], 'GI-5': [0, 0], 'GI-6': [0, 0],
  'GJ-1': [0, 0], 'GJ-2': [0, 0], 'GJ-3': [0, 0], 'GJ-4': [0, 0], 'GJ-5': [0, 0], 'GJ-6': [0, 0],
  'GK-1': [0, 0], 'GK-2': [0, 0], 'GK-3': [0, 0], 'GK-4': [0, 0], 'GK-5': [0, 0], 'GK-6': [0, 0],
  'GL-1': [0, 0], 'GL-2': [0, 0], 'GL-3': [0, 0], 'GL-4': [0, 0], 'GL-5': [0, 0], 'GL-6': [0, 0],
};

const matches = base.map((m) => {
  const s = REAL_SCORES[m.id];
  if (!s) return m;
  return { ...m, homeScore: s[0], awayScore: s[1], status: 'finished' };
});

const data = {
  matches,
  teams: teams.teams,
  groups: groups.groups,
  teamMap: Object.fromEntries(teams.teams.map((t) => [t.id, t])),
};

const r = resolveKnockoutBracket(data);
const fmt = (id) => {
  const m = r.find((x) => x.id === id);
  return m ? `${m.home} x ${m.away}` : '—';
};

console.log('Annex C key:', annexCKey(data));

/** Confrontos oficiais com 3º colocados (CBS/Wikipedia, combinação BDEFGIJKL). */
const EXPECTED_THIRD = {
  'R32-7': ['MEX', 'ECU'],   // 1A vs 3E
  'R32-13': ['SUI', 'ALG'],  // 1B vs 3J
  'R32-9': ['USA', 'BIH'],   // 1D vs 3B
  'R32-2': ['GER', 'PAR'],   // 1E vs 3D
  'R32-10': ['BEL', 'SEN'],  // 1G vs 3I
  'R32-5': ['FRA', 'SWE'],   // 1I vs 3F
  'R32-16': ['COL', 'GHA'],  // 1K vs 3L
  'R32-8': ['ENG', 'COD'],   // 1L vs 3K
};

/** Confrontos fixos (sem 3º). */
const EXPECTED_FIXED = {
  'R32-1': ['RSA', 'CAN'],   // 2A vs 2B
  'R32-4': ['BRA', 'JPN'],   // 1C vs 2F
  'R32-3': ['NED', 'SCO'],   // 1F vs 2C
};

let ok = true;
for (const [id, [home, away]] of Object.entries({ ...EXPECTED_THIRD, ...EXPECTED_FIXED })) {
  const m = r.find((x) => x.id === id);
  const pass = m?.home === home && m?.away === away;
  console.log(`${pass ? '✓' : '✗'} ${id}: ${fmt(id)} (esp: ${home} x ${away})`);
  if (!pass) ok = false;
}

console.log('\nGrupo C:', computeGroupStandings('C', matches, ['BRA', 'MAR', 'HAI', 'SCO']).map((s, i) => `${i + 1}º ${s.code}`).join(', '));
console.log('Grupo F:', computeGroupStandings('F', matches, ['NED', 'JPN', 'SWE', 'TUN']).map((s, i) => `${i + 1}º ${s.code}`).join(', '));

process.exit(ok ? 0 : 1);
