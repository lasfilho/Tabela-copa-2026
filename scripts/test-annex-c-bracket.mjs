/**
 * Valida Annex C contra chaveamento oficial pós fase de grupos (combinação BDEFIJKL).
 * Fonte: Wikipedia / CBS Sports / CNN Brasil (jun/2026).
 */
import { ANNEX_C } from '../js/fifa-annex-c.js';

const KEY = 'BDEFIJKL';
const row = ANNEX_C[KEY];

const expected = {
  A: '3E', B: '3J', D: '3B', E: '3D', G: '3I', I: '3F', K: '3L', L: '3K',
};

let ok = true;
for (const [slot, val] of Object.entries(expected)) {
  const pass = row?.[slot] === val;
  console.log(`${pass ? '✓' : '✗'} 1${slot} vs ${val} → app ${row?.[slot]}`);
  if (!pass) ok = false;
}

const official = [
  ['MEX', 'ECU', '1A vs 3E'],
  ['SUI', 'ALG', '1B vs 3J'],
  ['USA', 'BIH', '1D vs 3B'],
  ['GER', 'PAR', '1E vs 3D'],
  ['BEL', 'SEN', '1G vs 3I'],
  ['FRA', 'SWE', '1I vs 3F'],
  ['COL', 'GHA', '1K vs 3L'],
  ['ENG', 'COD', '1L vs 3K'],
];

console.log('\nConfrontos oficiais (3º colocados):');
for (const [home, away, label] of official) {
  console.log(`  ${label}: ${home} x ${away}`);
}

process.exit(ok ? 0 : 1);
