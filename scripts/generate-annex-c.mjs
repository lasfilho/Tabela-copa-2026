/**
 * Gera js/fifa-annex-c.js a partir da tabela Annex C (Wikipedia / regulamento FIFA).
 * Uso: node scripts/generate-annex-c.mjs [caminho-tabela-wikipedia.txt]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const DEFAULT_SOURCE = path.join(
  process.env.USERPROFILE || '',
  '.cursor/projects/c-Users-USUARIO-cursor-projects-C-Users-USUARIO-AppData-Local-Temp-2b352440-1a7b-46b9-b4ff-f14ef6e01cba-copa-2026/agent-tools/c39bb273-c162-40f2-826e-15c4f7ed94fe.txt',
);

const sourcePath = process.argv[2] || DEFAULT_SOURCE;
const text = fs.readFileSync(sourcePath, 'utf8');

const ROW_RE = /^\| (\d+)\*? \| ([A-L]) \| ([A-L]) \| ([A-L]) \| ([A-L]) \| ([A-L]) \| ([A-L]) \| ([A-L]) \| ([A-L]) \| (3[A-L]) \| (3[A-L]) \| (3[A-L]) \| (3[A-L]) \| (3[A-L]) \| (3[A-L]) \| (3[A-L]) \| (3[A-L]) \|/;

const map = {};
let count = 0;

for (const line of text.split('\n')) {
  const m = line.match(ROW_RE);
  if (!m) continue;
  const groups = m.slice(2, 10).sort().join('');
  map[groups] = {
    A: m[10], B: m[11], D: m[12], E: m[13], G: m[14], I: m[15], K: m[16], L: m[17],
  };
  count += 1;
}

if (count !== 495) {
  console.error(`Esperado 495 linhas, obtido ${count}`);
  process.exit(1);
}

const out = `/**
 * FIFA World Cup 2026 — Annex C (495 combinações de 3º colocados).
 * Fonte: regulamento FIFA / Wikipedia knockout stage.
 * Regenerar: node scripts/generate-annex-c.mjs
 */
export const ANNEX_C = ${JSON.stringify(map)};

/** Slots dos 16 avos onde 1º de grupo enfrenta 3º colocado. */
export const WINNER_THIRD_SLOTS = {
  A: 'R32-7',
  B: 'R32-13',
  D: 'R32-9',
  E: 'R32-2',
  G: 'R32-10',
  I: 'R32-5',
  K: 'R32-16',
  L: 'R32-8',
};
`;

fs.writeFileSync(path.join(ROOT, 'js/fifa-annex-c.js'), out);
console.log(`Gerado js/fifa-annex-c.js (${count} combinações)`);
