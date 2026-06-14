/**
 * Importa elencos completos da base FIFA + fotos TheSportsDB + artilheiros do torneio.
 * Fonte principal: PDF oficial FIFA (SquadLists-English.pdf).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './db.js';
import { teamIdFromSportsDb } from './sportsdb-team-map.js';
import { computeProbableStarters } from './probable-xi.js';
import { enrichPlayersWithPhotos } from './squad-enrichment.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIFA_SQUADS_PATH = path.join(__dirname, 'seed/fifa-squads.json');

const LEAGUE_ID = '4429';
const SEASON = '2026';

let fifaSquadsCache = null;

function loadFifaSquads() {
  if (fifaSquadsCache) return fifaSquadsCache;
  const raw = fs.readFileSync(FIFA_SQUADS_PATH, 'utf8');
  fifaSquadsCache = JSON.parse(raw);
  return fifaSquadsCache;
}

function config() {
  return { apiKey: process.env.SPORTS_API_KEY || '123' };
}

function normalizePlayerName(name) {
  return String(name || '').trim().toLowerCase();
}

async function loadPhotoCache(teamId) {
  const { rows } = await query(
    `SELECT player, shirt_number, photo_url, bio
     FROM team_players
     WHERE team_id = $1 AND photo_url IS NOT NULL`,
    [teamId]
  );
  const byName = new Map();
  const byNumber = new Map();
  for (const row of rows) {
    const entry = { photoUrl: row.photo_url, bio: row.bio };
    byName.set(normalizePlayerName(row.player), entry);
    if (row.shirt_number != null) byNumber.set(row.shirt_number, entry);
  }
  return { byName, byNumber };
}

function applyPhotoCache(players, cache) {
  return players.map((player) => {
    const cached = cache.byName.get(normalizePlayerName(player.player));
    if (!cached) return player;
    return {
      ...player,
      photoUrl: player.photoUrl || cached.photoUrl,
      bio: player.bio || cached.bio,
    };
  });
}

export async function syncSportsDbTeamIds() {
  const { apiKey } = config();
  const url = `https://www.thesportsdb.com/api/v1/json/${apiKey}/eventsseason.php?id=${LEAGUE_ID}&s=${SEASON}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`TheSportsDB teams HTTP ${res.status}`);
  const data = await res.json();

  let updated = 0;
  for (const ev of data.events ?? []) {
    const pairs = [
      [ev.strHomeTeam, ev.idHomeTeam],
      [ev.strAwayTeam, ev.idAwayTeam],
    ];
    for (const [name, tsdbId] of pairs) {
      const teamId = teamIdFromSportsDb(name);
      if (!teamId || !tsdbId) continue;
      await query(
        `INSERT INTO sportsdb_teams (team_id, sportsdb_id)
         VALUES ($1, $2)
         ON CONFLICT (team_id) DO UPDATE SET sportsdb_id = EXCLUDED.sportsdb_id`,
        [teamId, String(tsdbId)]
      );
      updated += 1;
    }
  }
  return updated;
}

async function fetchScorerPlayers(teamId) {
  const { rows } = await query(
    `SELECT DISTINCT player FROM match_goals
     WHERE team_id = $1 AND player IS NOT NULL AND counts_for_scorer = true`,
    [teamId]
  );
  return rows.map((r) => ({
    player: r.player,
    shirtNumber: null,
    position: null,
    externalId: null,
    source: 'match_goals',
  }));
}

function fifaPlayersForTeam(teamId) {
  const data = loadFifaSquads();
  const squad = data.squads.find((s) => s.teamId === teamId);
  if (!squad) return { coach: null, formation: '4-4-2', players: [] };

  const players = squad.players.map((p) => ({
    player: p.player,
    shirtName: p.shirtName,
    shirtNumber: p.shirtNumber,
    position: p.position,
    birthDate: p.birthDate,
    club: p.club,
    heightCm: p.heightCm,
    externalId: `${teamId}-${p.shirtNumber}`,
    source: 'fifa',
  }));

  return {
    coach: squad.coach,
    formation: squad.probableFormation || '4-4-2',
    players,
  };
}

function mergePlayers(fifaPlayers, scorerPlayers) {
  const map = new Map();
  for (const p of fifaPlayers) {
    map.set(normalizePlayerName(p.player), { ...p });
  }
  for (const p of scorerPlayers) {
    const key = normalizePlayerName(p.player);
    if (!map.has(key)) map.set(key, { ...p });
  }
  return [...map.values()];
}

export async function syncTeamSquad(teamId, options = {}) {
  const { skipPhotos = false } = options;
  const { coach, formation, players: fifaPlayers } = fifaPlayersForTeam(teamId);
  const scorers = await fetchScorerPlayers(teamId);
  const photoCache = await loadPhotoCache(teamId);
  let players = applyPhotoCache(mergePlayers(fifaPlayers, scorers), photoCache);

  if (coach || formation) {
    await query(
      `UPDATE teams SET
         coach = COALESCE($2, coach),
         probable_formation = COALESCE($3, probable_formation)
       WHERE id = $1`,
      [teamId, coach, formation]
    );
  }

  if (!skipPhotos) {
    try {
      players = await enrichPlayersWithPhotos(teamId, players, { delayMs: 700 });
    } catch (err) {
      console.warn(`[squad] ${teamId}: fotos — ${err.message}`);
    }
    players = applyPhotoCache(players, photoCache);
  }

  players = computeProbableStarters(players, formation);

  await query(`DELETE FROM team_players WHERE team_id = $1`, [teamId]);

  for (const p of players) {
    await query(
      `INSERT INTO team_players (
         team_id, player, shirt_name, shirt_number, position, club, birth_date,
         height_cm, photo_url, bio, is_probable_starter, external_id, source
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (team_id, player) DO UPDATE SET
         shirt_name = EXCLUDED.shirt_name,
         shirt_number = EXCLUDED.shirt_number,
         position = EXCLUDED.position,
         club = EXCLUDED.club,
         birth_date = EXCLUDED.birth_date,
         height_cm = EXCLUDED.height_cm,
         photo_url = COALESCE(EXCLUDED.photo_url, team_players.photo_url),
         bio = COALESCE(EXCLUDED.bio, team_players.bio),
         is_probable_starter = EXCLUDED.is_probable_starter,
         external_id = EXCLUDED.external_id,
         source = EXCLUDED.source`,
      [
        teamId,
        p.player,
        p.shirtName || null,
        p.shirtNumber,
        p.position,
        p.club || null,
        p.birthDate || null,
        p.heightCm || null,
        p.photoUrl || null,
        p.bio || null,
        p.isProbableStarter === true,
        p.externalId,
        p.source,
      ]
    );
  }

  return players.length;
}

export async function syncAllSquads(options = {}) {
  await syncSportsDbTeamIds().catch((err) => {
    console.warn('[squad] sportsdb team ids —', err.message);
  });

  const { rows } = await query(`SELECT id FROM teams ORDER BY id`);
  const priority = ['BRA', 'ARG', 'FRA', 'ENG', 'ESP', 'GER', 'POR', 'USA', 'MEX'];
  const ids = rows.map((r) => r.id);
  const ordered = [
    ...priority.filter((id) => ids.includes(id)),
    ...ids.filter((id) => !priority.includes(id)),
  ];

  let total = 0;
  for (const teamId of ordered) {
    total += await syncTeamSquad(teamId, options);
    await new Promise((r) => setTimeout(r, options.skipPhotos ? 50 : 500));
  }
  return { teams: rows.length, players: total };
}
