/**
 * Busca fotos de jogadores no TheSportsDB com desambiguação por clube.
 */
import { normalizeTeamName } from './sportsdb-team-map.js';
import { markSportsDbRateLimited } from './sportsdb-fetch.js';

const DISPLAY_ALIASES = {
  'neymar jr': 'Neymar',
  'vini jr': 'Vinicius Junior',
  'bruno g': 'Bruno Guimaraes',
  'danilo s': 'Danilo Santos',
  'danilo s.': 'Danilo Santos',
  'éderson s': 'Ederson Silva',
  'ederson s': 'Ederson Silva',
  'ederson s.': 'Ederson Silva',
  'martinelli': 'Gabriel Martinelli',
  'ibanez': 'Roger Ibañez',
  'ibañez': 'Roger Ibañez',
  'a becker': 'Alisson',
  'alex sandro': 'Alex Sandro',
  'leo pereira': 'Leo Pereira',
  'l paqueta': 'Lucas Paqueta',
  'l henrique': 'Luiz Henrique',
  'j alvarez': 'Julian Alvarez',
  'l martinez': 'Lautaro Martinez',
  'e martinez': 'Emiliano Martinez',
  'e fernandez': 'Enzo Fernandez',
  'n gonzalez': 'Nicolas Gonzalez',
  'nico paz': 'Nicolas Paz',
  'm almiron': 'Miguel Almiron',
  'd gomez': 'Diego Gomez',
  'j david': 'Jonathan David',
  'de fougerolles': 'Luc de Fougerolles',
};

function config() {
  return { apiKey: process.env.SPORTS_API_KEY || '123' };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/(^|[\s.])[\p{L}]/gu, (c) => c.toUpperCase());
}

export function displayNameFromShirt(shirtName, fullName) {
  const key = String(shirtName || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  if (DISPLAY_ALIASES[key]) return DISPLAY_ALIASES[key];
  if (key.length >= 3 && !/^[a-z]$/.test(key)) {
    return titleCase(String(shirtName).replace(/\./g, ' ').trim());
  }
  return fullName;
}

function clubHints(club) {
  const raw = String(club || '').replace(/\([^)]*\)/g, ' ').trim();
  const norm = normalizeTeamName(raw);
  return norm.split(' ').filter((w) => w.length > 3);
}

export function buildPhotoSearchQuery(player) {
  const shirtKey = String(player.shirtName || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  if (DISPLAY_ALIASES[shirtKey]) return DISPLAY_ALIASES[shirtKey];

  if (shirtKey === 'danilo' || shirtKey === 'danilo s' || shirtKey === 'danilo s.') {
    if (String(player.club || '').toLowerCase().includes('botafogo')
      || String(player.position || '').toLowerCase().includes('mid')) {
      return 'Danilo Santos';
    }
    return 'Danilo';
  }

  if (shirtKey.includes('ederson s') || String(player.player || '').toLowerCase() === 'ederson silva') {
    return 'Ederson Silva';
  }

  if (shirtKey === 'ederson' && String(player.club || '').toLowerCase().includes('fenerbah')) {
    return 'Ederson Moraes';
  }

  if (shirtKey === 'martinelli' || String(player.player || '').toLowerCase().includes('gabriel martinelli')) {
    return 'Gabriel Martinelli';
  }

  if (shirtKey === 'ibanez' || shirtKey === 'ibañez' || String(player.player || '').toLowerCase().includes('roger ibanez')) {
    return 'Roger Ibañez';
  }

  if (shirtKey === 'thiago' && String(player.player || '').toLowerCase().includes('igor')) {
    return 'Igor Thiago';
  }

  const fromShirt = displayNameFromShirt(player.shirtName, player.player);
  if (fromShirt && fromShirt !== player.player) return fromShirt;

  const parts = String(player.player || '').trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0]} ${parts[parts.length - 1]}`;
  return player.player;
}

function pickPhoto(entry) {
  return entry.strCutout || entry.strRender || entry.strThumb || null;
}

function scoreResult(entry, player, query) {
  let score = 0;
  const team = normalizeTeamName(entry.strTeam || '');
  const name = normalizeTeamName(entry.strPlayer || '');
  const q = normalizeTeamName(query);

  for (const hint of clubHints(player.club)) {
    if (team.includes(hint)) score += 12;
  }

  if (name === q) score += 20;
  else if (name.includes(q) || q.includes(name)) score += 10;

  if (normalizeTeamName(entry.strNationality || '').includes('brazil')) score += 2;
  if (pickPhoto(entry)) score += 3;

  return score;
}

async function fetchSearch(query) {
  const { apiKey } = config();
  const url = `https://www.thesportsdb.com/api/v1/json/${apiKey}/searchplayers.php?p=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (res.status === 429) return { rateLimited: true, players: [] };
  if (!res.ok) return { players: [] };
  const text = await res.text();
  if (text.startsWith('<!')) return { players: [] };
  try {
    const data = JSON.parse(text);
    return { players: data.player ?? [] };
  } catch {
    return { players: [] };
  }
}

export async function searchPlayerPhoto(player, options = {}) {
  const query = buildPhotoSearchQuery(player);
  if (!query) return null;

  const { players, rateLimited } = await fetchSearch(query);
  if (rateLimited) {
    markSportsDbRateLimited(15);
    return { rateLimited: true };
  }
  if (!players.length) return null;

  const ranked = players
    .map((entry) => ({ entry, score: scoreResult(entry, player, query) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < 8) return null;

  const photoUrl = pickPhoto(best.entry);
  if (!photoUrl) return null;

  return {
    photoUrl,
    bio: best.entry.strDescriptionEN || null,
    tsdbName: best.entry.strPlayer,
    searchQuery: query,
  };
}

export async function enrichPlayersWithPhotos(teamId, players, options = {}) {
  const delayMs = options.delayMs ?? 700;
  const out = [];

  for (const player of players) {
    if (player.photoUrl) {
      out.push(player);
      continue;
    }

    let matched = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        matched = await searchPlayerPhoto(player);
        if (matched?.rateLimited) {
          console.warn(`[photo] ${teamId}: rate limit — aguardando 75s (tentativa ${attempt + 1}/3)`);
          await sleep(75000);
          matched = null;
          continue;
        }
        break;
      } catch (err) {
        console.warn(`[photo] ${teamId}/${player.player}: ${err.message}`);
        break;
      }
    }

    if (matched?.photoUrl) {
      out.push({ ...player, photoUrl: matched.photoUrl, bio: player.bio || matched.bio });
    } else {
      out.push(player);
    }

    await sleep(delayMs);
  }

  return out;
}
