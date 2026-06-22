/**
 * Valida schedule.js contra a fonte oficial (horário BRT + confrontos).
 * Falha com exit 1 se houver qualquer divergência — rodar antes de commit/deploy.
 *
 * Uso: node scripts/validate-schedule.mjs
 */
import { ALL_MATCHES, GROUP_MATCHES } from '../backend/src/seed/schedule.js';
import { FIFA_BRT_TIMES } from '../backend/src/seed/fifa-brt-times.js';

/** Confrontos oficiais fase de grupos — ge.globo / FIFA (mandante, visitante). */
const OFFICIAL_GROUP = {
  'GA-1': ['MEX', 'RSA'], 'GA-2': ['KOR', 'CZE'], 'GA-3': ['MEX', 'KOR'], 'GA-4': ['CZE', 'RSA'],
  'GA-5': ['CZE', 'MEX'], 'GA-6': ['RSA', 'KOR'],
  'GB-1': ['CAN', 'BIH'], 'GB-2': ['QAT', 'SUI'], 'GB-3': ['SUI', 'BIH'], 'GB-4': ['CAN', 'QAT'],
  'GB-5': ['SUI', 'CAN'], 'GB-6': ['BIH', 'QAT'],
  'GC-1': ['BRA', 'MAR'], 'GC-2': ['HAI', 'SCO'], 'GC-3': ['SCO', 'MAR'], 'GC-4': ['BRA', 'HAI'],
  'GC-5': ['MAR', 'HAI'], 'GC-6': ['SCO', 'BRA'],
  'GD-1': ['USA', 'PAR'], 'GD-2': ['AUS', 'TUR'], 'GD-3': ['USA', 'AUS'], 'GD-4': ['TUR', 'PAR'],
  'GD-5': ['TUR', 'USA'], 'GD-6': ['PAR', 'AUS'],
  'GE-1': ['GER', 'CUW'], 'GE-2': ['CIV', 'ECU'], 'GE-3': ['GER', 'CIV'], 'GE-4': ['ECU', 'CUW'],
  'GE-5': ['ECU', 'GER'], 'GE-6': ['CUW', 'CIV'],
  'GF-1': ['NED', 'JPN'], 'GF-2': ['SWE', 'TUN'], 'GF-3': ['NED', 'SWE'], 'GF-4': ['TUN', 'JPN'],
  'GF-5': ['JPN', 'SWE'], 'GF-6': ['TUN', 'NED'],
  'GG-1': ['BEL', 'EGY'], 'GG-2': ['IRN', 'NZL'], 'GG-3': ['BEL', 'IRN'], 'GG-4': ['NZL', 'EGY'],
  'GG-5': ['NZL', 'BEL'], 'GG-6': ['EGY', 'IRN'],
  'GH-1': ['ESP', 'CPV'], 'GH-2': ['KSA', 'URU'], 'GH-3': ['ESP', 'KSA'], 'GH-4': ['URU', 'CPV'],
  'GH-5': ['CPV', 'KSA'], 'GH-6': ['URU', 'ESP'],
  'GI-1': ['FRA', 'SEN'], 'GI-2': ['IRQ', 'NOR'], 'GI-3': ['FRA', 'IRQ'], 'GI-4': ['NOR', 'SEN'],
  'GI-5': ['SEN', 'IRQ'], 'GI-6': ['NOR', 'FRA'],
  'GJ-1': ['ARG', 'ALG'], 'GJ-2': ['AUT', 'JOR'], 'GJ-3': ['ARG', 'AUT'], 'GJ-4': ['JOR', 'ALG'],
  'GJ-5': ['JOR', 'ARG'], 'GJ-6': ['ALG', 'AUT'],
  'GK-1': ['POR', 'COD'], 'GK-2': ['UZB', 'COL'], 'GK-3': ['POR', 'UZB'], 'GK-4': ['COL', 'COD'],
  'GK-5': ['COL', 'POR'], 'GK-6': ['COD', 'UZB'],
  'GL-1': ['ENG', 'CRO'], 'GL-2': ['GHA', 'PAN'], 'GL-3': ['ENG', 'GHA'], 'GL-4': ['PAN', 'CRO'],
  'GL-5': ['CRO', 'GHA'], 'GL-6': ['PAN', 'ENG'],
};

const errors = [];

for (const m of ALL_MATCHES) {
  const brt = FIFA_BRT_TIMES[m.id];
  if (!brt) {
    errors.push(`${m.id}: ausente em fifa-brt-times.js`);
    continue;
  }
  const [date, time] = brt;
  if (m.date !== date || m.time !== time) {
    errors.push(`${m.id}: horário ${m.date} ${m.time} ≠ oficial ${date} ${time}`);
  }
}

for (const m of GROUP_MATCHES) {
  const official = OFFICIAL_GROUP[m.id];
  if (!official) {
    errors.push(`${m.id}: ausente em OFFICIAL_GROUP`);
    continue;
  }
  const [home, away] = official;
  if (m.home !== home || m.away !== away) {
    errors.push(`${m.id}: confronto ${m.home}×${m.away} ≠ oficial ${home}×${away}`);
  }
}

if (errors.length) {
  console.error(`\n❌ Calendário inválido — ${errors.length} problema(s):\n`);
  errors.forEach((e) => console.error(`  • ${e}`));
  console.error('\nCorrija schedule.js e rode: node scripts/sync-schedule.mjs\n');
  process.exit(1);
}

console.log(`✓ Calendário OK: ${ALL_MATCHES.length} jogos (horários + ${GROUP_MATCHES.length} confrontos de grupos)`);
