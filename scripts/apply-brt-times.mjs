/**
 * Aplica horários oficiais BRT (fifa-brt-times.js) em schedule.js
 * Uso: node scripts/apply-brt-times.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FIFA_BRT_TIMES } from '../backend/src/seed/fifa-brt-times.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schedulePath = path.join(__dirname, '..', 'backend', 'src', 'seed', 'schedule.js');

let src = fs.readFileSync(schedulePath, 'utf8');
let changes = 0;

for (const [id, [date, time]] of Object.entries(FIFA_BRT_TIMES)) {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(m\\('${esc}'[^)]+)'\\d{4}-\\d{2}-\\d{2}', '\\d{2}:\\d{2}'`);
  const next = src.replace(re, `$1'${date}', '${time}'`);
  if (next !== src) {
    changes += 1;
    src = next;
  } else {
    console.warn(`Não encontrado ou já correto: ${id}`);
  }
}

fs.writeFileSync(schedulePath, src);
console.log(`schedule.js atualizado: ${changes} jogos corrigidos (${Object.keys(FIFA_BRT_TIMES).length} na fonte BRT)`);
