/**
 * Sincroniza placares do modo Real via TheSportsDB (grátis).
 * Importa resultados finais e placares parciais quando a API envia (1H, 2H, HT…).
 */
import { query } from './db.js';
import { teamIdFromSportsDb } from './sportsdb-team-map.js';

const LEAGUE_ID = '4429';
const SEASON = '2026';

const FINISHED_STATUS = new Set(['FT', 'AET', 'PEN', 'AOT', 'AW']);
const LIVE_STATUS = new Set([
  '1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT', 'INP', 'Q1', 'Q2', 'Q3', 'Q4',
]);
const IGNORE_STATUS = new Set([
  'NS', 'CANC', 'PST', 'POST', 'ABD', 'INTR', 'SUSP', 'AWD', 'TBD', 'CANCL',
]);

const state = {
  running: false,
  lastRunAt: null,
  lastOkAt: null,
  lastError: null,
  lastUpdated: 0,
  lastSkipped: 0,
  lastLive: 0,
};

function config() {
  return {
    apiKey: process.env.SPORTS_API_KEY || '123',
    intervalMs: Number(process.env.SYNC_INTERVAL_MS || 5 * 60 * 1000),
    envDefaultEnabled: process.env.SYNC_ENABLED === 'true',
  };
}

export function getSyncRuntimeState() {
  return { ...state };
}

export async function isSyncEnabled() {
  const { rows } = await query(
    `SELECT score_sync_enabled FROM app_preferences WHERE id = 1`
  );
  if (!rows.length) return config().envDefaultEnabled;
  return rows[0].score_sync_enabled;
}

export async function setSyncEnabled(enabled) {
  await query(
    `UPDATE app_preferences SET score_sync_enabled = $1, updated_at = NOW() WHERE id = 1`,
    [Boolean(enabled)]
  );
  return enabled;
}

async function ensureSyncPreferenceDefault() {
  const { envDefaultEnabled } = config();
  await query(
    `INSERT INTO app_preferences (id, score_sync_enabled)
     VALUES (1, $1)
     ON CONFLICT (id) DO NOTHING`,
    [envDefaultEnabled]
  );
}

async function fetchSeasonEvents() {
  const { apiKey } = config();
  const url = `https://www.thesportsdb.com/api/v1/json/${apiKey}/eventsseason.php?id=${LEAGUE_ID}&s=${SEASON}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`TheSportsDB HTTP ${res.status}`);
  const data = await res.json();
  return data.events ?? [];
}

async function findMatchId(homeId, awayId) {
  const { rows } = await query(
    `SELECT id FROM matches
     WHERE home_team = $1 AND away_team = $2
     ORDER BY match_date, match_time
     LIMIT 1`,
    [homeId, awayId]
  );
  return rows[0]?.id ?? null;
}

async function getCurrentResult(matchId) {
  const { rows } = await query(
    `SELECT home_score, away_score, status FROM match_results
     WHERE match_id = $1 AND mode = 'real'`,
    [matchId]
  );
  if (!rows.length) return { home: null, away: null, status: null };
  return {
    home: rows[0].home_score,
    away: rows[0].away_score,
    status: rows[0].status,
  };
}

async function upsertRealScore(matchId, home, away, status) {
  await query(
    `INSERT INTO match_results (match_id, mode, home_score, away_score, status, updated_at)
     VALUES ($1, 'real', $2, $3, $4, NOW())
     ON CONFLICT (match_id, mode) DO UPDATE SET
       home_score = EXCLUDED.home_score,
       away_score = EXCLUDED.away_score,
       status = EXCLUDED.status,
       updated_at = NOW()`,
    [matchId, home, away, status]
  );
}

function parseScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function mapApiStatus(raw) {
  if (!raw) return null;
  const code = String(raw).trim().toUpperCase();
  if (FINISHED_STATUS.has(code) || code === 'MATCH FINISHED') return 'finished';
  if (LIVE_STATUS.has(code)) return 'live';
  if (IGNORE_STATUS.has(code)) return null;
  if (code.includes('PLAY') || code.includes('LIVE') || code.includes('HALF')) return 'live';
  return null;
}

/** Evento com placar importável (final ou parcial). */
function parseScorableEvent(ev) {
  if (ev.strPostponed === 'yes') return null;

  const home = parseScore(ev.intHomeScore);
  const away = parseScore(ev.intAwayScore);
  if (home === null || away === null) return null;

  const status = mapApiStatus(ev.strStatus);
  if (!status) return null;

  return { home, away, status, apiStatus: ev.strStatus };
}

export async function runScoreSync() {
  if (state.running) return { ok: false, reason: 'already_running' };

  const enabled = await isSyncEnabled();
  if (!enabled) return { ok: true, skipped: true, reason: 'disabled' };

  state.running = true;
  state.lastRunAt = new Date().toISOString();

  let updated = 0;
  let skipped = 0;
  let liveCount = 0;
  const unmatched = [];

  try {
    const events = await fetchSeasonEvents();

    for (const ev of events) {
      const parsed = parseScorableEvent(ev);
      if (!parsed) continue;

      const homeId = teamIdFromSportsDb(ev.strHomeTeam);
      const awayId = teamIdFromSportsDb(ev.strAwayTeam);
      if (!homeId || !awayId) {
        unmatched.push(ev.strEvent);
        continue;
      }

      const matchId = await findMatchId(homeId, awayId);
      if (!matchId) {
        unmatched.push(ev.strEvent);
        continue;
      }

      const { home, away, status } = parsed;
      const current = await getCurrentResult(matchId);

      if (current.home === home && current.away === away && current.status === status) {
        skipped += 1;
        continue;
      }

      const { rows: meta } = await query(`SELECT phase FROM matches WHERE id = $1`, [matchId]);
      if (status === 'finished' && meta[0]?.phase !== 'group' && home === away) {
        skipped += 1;
        continue;
      }

      await upsertRealScore(matchId, home, away, status);
      updated += 1;
      if (status === 'live') liveCount += 1;
      console.log(`[sync] ${matchId}: ${home}×${away} [${status}] (${ev.strEvent}, ${parsed.apiStatus})`);
    }

    state.lastOkAt = new Date().toISOString();
    state.lastError = null;
    state.lastUpdated = updated;
    state.lastSkipped = skipped;
    state.lastLive = liveCount;

    return {
      ok: true,
      updated,
      skipped,
      live: liveCount,
      unmatched: unmatched.length,
      at: state.lastOkAt,
    };
  } catch (err) {
    state.lastError = err.message;
    console.error('[sync] erro:', err.message);
    return { ok: false, error: err.message };
  } finally {
    state.running = false;
  }
}

let timer = null;

export async function startScoreSyncWorker() {
  await ensureSyncPreferenceDefault();

  const { intervalMs } = config();
  if (timer) clearInterval(timer);

  setTimeout(() => {
    runScoreSync().catch(() => {});
  }, 15000);

  timer = setInterval(() => {
    runScoreSync().catch(() => {});
  }, intervalMs);

  const enabled = await isSyncEnabled();
  console.log(`[sync] worker ativo — intervalo ${Math.round(intervalMs / 60000)} min, enabled=${enabled}, live+final`);
}

export async function getSyncStatus() {
  const enabled = await isSyncEnabled();
  return {
    enabled,
    ...getSyncRuntimeState(),
    intervalMinutes: Math.round(config().intervalMs / 60000),
    source: 'TheSportsDB',
    supportsLive: true,
  };
}
