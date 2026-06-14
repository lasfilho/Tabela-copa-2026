/**
 * Converte o texto extraído do PDF oficial da FIFA (SquadLists-English.pdf)
 * em JSON estruturado para importação no banco.
 *
 * Formato v2 (Jun/2026): um campo por linha, colunas CAPS e GOALS.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT = path.join(__dirname, '../data/fifa-squad-lists.txt');
const OUTPUT = path.join(__dirname, '../src/seed/fifa-squads.json');
const PDF_DEFAULT = path.join(process.env.USERPROFILE || '', 'OneDrive', 'Documentos', 'SquadLists-English.pdf');

const POS_CODES = new Set(['GK', 'DF', 'MF', 'FW']);
const FIFA_CODE_MAP = { CUW: 'CUW', COD: 'COD', CIV: 'CIV' };

const DISPLAY_ALIASES = {
  'neymar jr': 'Neymar',
  'vini jr': 'Vinícius Júnior',
  'vini jr.': 'Vinícius Júnior',
  'bruno g': 'Bruno Guimarães',
  'bruno g.': 'Bruno Guimarães',
  'danilo s': 'Danilo Santos',
  'danilo s.': 'Danilo Santos',
  'a becker': 'Alisson',
  'éderson s': 'Ederson Silva',
  'ederson s': 'Ederson Silva',
  'ederson s.': 'Ederson Silva',
  'marquinhos': 'Marquinhos',
  'leo pereira': 'Leo Pereira',
  'léo pereira': 'Leo Pereira',
  'l paqueta': 'Lucas Paquetá',
  'l paquetá': 'Lucas Paquetá',
  'l henrique': 'Luiz Henrique',
  'martinelli': 'Gabriel Martinelli',
  'ibanez': 'Roger Ibañez',
  'ibañez': 'Roger Ibañez',
  'thiago': 'Igor Thiago',
  'douglas s': 'Douglas Santos',
  'douglas s.': 'Douglas Santos',
  'j alvarez': 'Julián Álvarez',
  'l martinez': 'Lautaro Martínez',
  'e martinez': 'Emiliano Martínez',
  'e fernandez': 'Enzo Fernández',
  'n gonzalez': 'Nicolás González',
  'nico paz': 'Nicolás Paz',
  'm almiron': 'Miguel Almirón',
  'd gomez': 'Diego Gómez',
  'j david': 'Jonathan David',
};

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/(^|[\s.])[\p{L}]/gu, (c) => c.toUpperCase());
}

function normalizeShirtKey(shirtName) {
  return String(shirtName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function displayNameFromShirt(shirtName, fullName, headerName = '') {
  const key = normalizeShirtKey(shirtName);
  if (DISPLAY_ALIASES[key]) return DISPLAY_ALIASES[key];

  const header = String(headerName || '').toUpperCase();
  if (key === 'martinelli' || header.includes('GABRIEL MARTINELLI')) return 'Gabriel Martinelli';
  if (key === 'ibanez' || key === 'ibañez' || header.includes('ROGER IBANEZ')) return 'Roger Ibañez';
  if ((key === 'thiago' && header.includes('IGOR')) || header.includes('IGOR THIAGO')) return 'Igor Thiago';
  if (key.includes('ederson s') || header.includes('EDERSON SILVA')) return 'Ederson Silva';

  if (key.length >= 3) {
    return titleCase(String(shirtName).replace(/\./g, ' ').trim());
  }
  return fullName;
}

function parseDob(dob) {
  const [dd, mm, yyyy] = dob.split('/');
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function mapPosition(pos) {
  const map = { GK: 'Goalkeeper', DF: 'Defender', MF: 'Midfielder', FW: 'Forward' };
  return map[pos] || pos;
}

function isTeamHeader(line, nextLine) {
  const m = line.match(/^([A-Za-zÀ-ÿ .''\-]+?) \(([A-Z]{3})\)$/);
  if (!m) return null;
  if (nextLine !== '#') return null;
  return { teamName: m[1].trim(), teamId: FIFA_CODE_MAP[m[2]] || m[2] };
}

function isDob(line) {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(line);
}

function parseCoach(lines, startIdx) {
  for (let i = startIdx; i < lines.length; i += 1) {
    if (lines[i] !== 'Head coach') continue;
    const header = lines[i + 1];
    const first = lines[i + 2];
    const last = lines[i + 3];
    if (!header || !first || !last) return null;

    const headerParts = header.trim().split(/\s+/);
    if (headerParts.length >= 2 && headerParts[headerParts.length - 1].toLowerCase() === first.toLowerCase()) {
      return titleCase(`${first} ${last}`);
    }
    return titleCase(`${first} ${last}`);
  }
  return null;
}

function parsePlayerRecord(lines, idx) {
  const pos = lines[idx];
  if (!POS_CODES.has(pos)) return null;

  const headerName = lines[idx + 1];
  const firstName = lines[idx + 2];
  const lastName = lines[idx + 3];
  const shirtName = lines[idx + 4];
  const dob = lines[idx + 5];
  const club = lines[idx + 6];
  const height = lines[idx + 7];

  if (!headerName || !isDob(dob) || !club || !/^\d{2,3}$/.test(height || '')) {
    return null;
  }

  const fullName = titleCase(`${firstName} ${lastName}`.trim());
  const player = displayNameFromShirt(shirtName, fullName, headerName);

  return {
    record: {
      player,
      shirtName,
      fullName,
      headerName,
      position: mapPosition(pos),
      positionCode: pos,
      birthDate: parseDob(dob),
      club: club.trim(),
      heightCm: Number.parseInt(height, 10),
      caps: Number.parseInt(lines[idx + 8], 10) || 0,
      goals: Number.parseInt(lines[idx + 9], 10) || 0,
    },
    nextIdx: idx + 10,
  };
}

function parseTeams(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const teams = [];

  for (let i = 0; i < lines.length; i += 1) {
    const header = isTeamHeader(lines[i], lines[i + 1]);
    if (!header) continue;

    let j = i + 1;
    while (j < lines.length && lines[j] !== 'GOALS') j += 1;
    j += 1;

    const players = [];
    while (j < lines.length) {
      if (lines[j] === 'ROLE') break;
      if (isTeamHeader(lines[j], lines[j + 1])) break;
      if (/^Saturday,\s/.test(lines[j])) break;
      if (/^Version \d/.test(lines[j])) break;
      if (/^\d{1,2}$/.test(lines[j]) && lines[j + 1] === '1') break;

      const parsed = parsePlayerRecord(lines, j);
      if (!parsed) {
        j += 1;
        continue;
      }
      players.push(parsed.record);
      j = parsed.nextIdx;
    }

    const coach = parseCoach(lines, j);

    teams.push({
      teamId: header.teamId,
      teamName: header.teamName,
      coach,
      probableFormation: '4-4-2',
      players: players.map((p, index) => ({
        ...p,
        shirtNumber: index + 1,
      })),
    });

    i = j;
  }

  return teams;
}

function ensureExtractedText() {
  if (fs.existsSync(INPUT)) {
    const sample = fs.readFileSync(INPUT, 'utf8');
    if (sample.includes('CAPS') && sample.includes('GOALS')) return;
  }

  const pdfPath = process.argv[2] || PDF_DEFAULT;
  if (!fs.existsSync(pdfPath)) {
    console.warn(`[parse-fifa-squads] PDF não encontrado em ${pdfPath} — usando txt existente`);
    return;
  }

  const script = path.join(__dirname, 'extract-fifa-pdf.py');
  execSync(`python "${script}" "${pdfPath}"`, { stdio: 'inherit' });
}

ensureExtractedText();

const text = fs.readFileSync(INPUT, 'utf8');
const squads = parseTeams(text);

const summary = {
  source: 'FIFA SquadLists-English.pdf (official)',
  generatedAt: new Date().toISOString(),
  teams: squads.length,
  players: squads.reduce((n, t) => n + t.players.length, 0),
  squads,
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(summary, null, 2));

console.log(`[parse-fifa-squads] ${summary.teams} seleções, ${summary.players} jogadores → ${OUTPUT}`);

if (summary.teams !== 48) {
  console.warn(`[parse-fifa-squads] esperado 48 seleções, encontrado ${summary.teams}`);
  for (const s of squads) {
    if (s.players.length !== 26) {
      console.warn(`  ${s.teamId}: ${s.players.length} jogadores (esperado 26)`);
    }
  }
}

const bra = squads.find((s) => s.teamId === 'BRA');
if (bra) {
  console.log('[parse-fifa-squads] Brasil:', bra.players.map((p) => `${p.shirtNumber}. ${p.player} (${p.positionCode})`).join(', '));
}
