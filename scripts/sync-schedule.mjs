/**
 * Sincroniza data/matches.json e data/embedded.js a partir de backend/src/seed/schedule.js
 * (fonte única do calendário em horário de Brasília).
 *
 * Uso: node scripts/sync-schedule.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ALL_MATCHES } from '../backend/src/seed/schedule.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

const ROUND_LABELS = {
  r32: 'Oitavas (32)',
  r16: 'Oitavas',
  qf: 'Quartas',
  sf: 'Semifinal',
  bronze: '3º lugar',
  final: 'Final',
};

const matchesPath = path.join(dataDir, 'matches.json');
const existing = fs.existsSync(matchesPath)
  ? JSON.parse(fs.readFileSync(matchesPath, 'utf8'))
  : { matches: [] };
const prevById = Object.fromEntries(existing.matches.map((m) => [m.id, m]));

const matches = ALL_MATCHES.map((m) => {
  const prev = prevById[m.id];
  const row = {
    id: m.id,
    phase: m.phase,
    group: m.group ?? null,
    matchday: m.matchday ?? null,
    date: m.date,
    time: m.time,
    venue: m.venue,
    home: m.home,
    away: m.away,
    homeScore: prev?.homeScore ?? null,
    awayScore: prev?.awayScore ?? null,
    status: prev?.status ?? 'scheduled',
  };
  if (m.label) row.label = m.label;
  if (m.phase !== 'group' && ROUND_LABELS[m.phase]) {
    row.round = ROUND_LABELS[m.phase];
  }
  return row;
});

fs.writeFileSync(matchesPath, `${JSON.stringify({ matches }, null, 2)}\n`);

const teams = JSON.parse(fs.readFileSync(path.join(dataDir, 'teams.json'), 'utf8'));
const groups = JSON.parse(fs.readFileSync(path.join(dataDir, 'groups.json'), 'utf8'));
const stats = JSON.parse(fs.readFileSync(path.join(dataDir, 'stats.json'), 'utf8'));

const bundle = {
  tournament: teams.tournament,
  teams: teams.teams,
  groups: groups.groups,
  matches,
  stats,
};

fs.writeFileSync(
  path.join(dataDir, 'embedded.js'),
  `window.COPA_EMBEDDED=${JSON.stringify(bundle)};`
);

console.log(`Calendário sincronizado: ${matches.length} jogos → matches.json + embedded.js`);
