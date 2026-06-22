/**
 * Aplica confrontos oficiais (fifa-fixtures.js) em schedule.js
 * Uso: node scripts/apply-fixtures.mjs && node scripts/sync-schedule.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FIFA_FIXTURES } from '../backend/src/seed/fifa-fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schedulePath = path.join(__dirname, '..', 'backend', 'src', 'seed', 'schedule.js');

let src = fs.readFileSync(schedulePath, 'utf8');
let changes = 0;

for (const [id, [home, away]] of Object.entries(FIFA_FIXTURES)) {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `(m\\('${esc}'[^)]+)'[A-Z]{3}', '[A-Z]{3}'`
  );
  const next = src.replace(re, `$1'${home}', '${away}'`);
  if (next !== src) {
    changes += 1;
    src = next;
  } else {
    console.warn(`Não encontrado: ${id}`);
  }
}

fs.writeFileSync(schedulePath, src);
console.log(`schedule.js: ${changes} confrontos corrigidos`);
