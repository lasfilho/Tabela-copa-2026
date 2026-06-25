/**
 * Valida caminho do Brasil no mata-mata (classificação real simulada).
 */
import fs from 'fs';
import { computeGroupStandings } from '../js/engine.js';
import { resolveKnockoutBracket } from '../js/knockout-resolver.js';

const teams = JSON.parse(fs.readFileSync('./data/teams.json', 'utf8'));
const groups = JSON.parse(fs.readFileSync('./data/groups.json', 'utf8'));
const base = JSON.parse(fs.readFileSync('./data/matches.json', 'utf8')).matches;

// Resultados reais pós 3ª rodada (ge/O Globo, jun/2026)
const scores = {
  'GC-1': [1, 1], 'GC-2': [0, 1], 'GC-3': [0, 1], 'GC-4': [3, 0], 'GC-5': null, 'GC-6': null,
  'GF-1': [2, 2], 'GF-2': [5, 1], 'GF-3': [5, 1], 'GF-4': [0, 4], 'GF-5': null, 'GF-6': null,
};

const matches = base.map((m) => {
  const s = scores[m.id];
  if (!s) return m;
  return { ...m, homeScore: s[0], awayScore: s[1], status: 'finished' };
});

const data = {
  matches,
  teams: teams.teams,
  groups: groups.groups,
  teamMap: Object.fromEntries(teams.teams.map((t) => [t.id, t])),
};

const stC = computeGroupStandings('C', matches, ['BRA', 'MAR', 'HAI', 'SCO']);
const stF = computeGroupStandings('F', matches, ['NED', 'JPN', 'SWE', 'TUN']);
console.log('Grupo C:', stC.map((s, i) => `${i + 1}º ${s.code}`).join(', '));
console.log('Grupo F:', stF.map((s, i) => `${i + 1}º ${s.code}`).join(', '));

const r = resolveKnockoutBracket(data);
const r32_4 = r.find((m) => m.id === 'R32-4');
const r16_3 = r.find((m) => m.id === 'R16-3');
console.log('\nEsperado (1º C): R32-4 BRA x JPN');
console.log('App R32-4:', r32_4?.home, 'x', r32_4?.away);
console.log('Esperado oitavas: 05/jul R16-3 (vencedor R32-4 x R32-6)');
console.log('R16-3 feeders:', r.find((m) => m.id === 'R32-6')?.home, 'x', r.find((m) => m.id === 'R32-6')?.away);

const ok = r32_4?.home === 'BRA' && r32_4?.away === 'JPN';
console.log(ok ? '\n✓ Adversário 16 avos OK' : '\n✗ Adversário 16 avos ERRADO');
