/**
 * Sincroniza placares do modo Real via TheSportsDB (grátis).
 * Importa resultados finais e placares parciais quando a API envia (1H, 2H, HT…).
 */
import { query } from './db.js';
import { recalculatePoolsForMatch } from './pool/pool-ranking.js';
import { teamIdFromSportsDb } from './sportsdb-team-map.js';
import {
  syncMatchGoalsFromEvent,
  shouldResyncMatchGoals,
} from './goal-sync.js';
import {
  fetchSportsDbJson,
  getSportsDbRateLimitUntil,
} from './sportsdb-fetch.js';

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
  lastGoalsSynced: 0,
  rateLimitedUntil: null,
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
  const result = await fetchSportsDbJson(url);
  if (result.rateLimited) return { rateLimited: true, events: [] };
  if (!result.ok) throw new Error(result.error);
  return { events: result.data.events ?? [] };
}

async function findMatchId(homeId, awayId) {
  const { rows } = await query(
    `SELECT id, match_date FROM matches
     WHERE home_team = $1 AND away_team = $2
     ORDER BY match_date, match_time
     LIMIT 1`,
    [homeId, awayId]
  );
  if (!rows.length) return null;
  return {
    id: rows[0].id,
    date: formatMatchDate(rows[0].match_date),
  };
}

function formatMatchDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
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

async function countMatchGoals(matchId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM match_goals WHERE match_id = $1`,
    [matchId]
  );
  return rows[0].n;
}

async function maybeSyncGoals(
  matchId, idEvent, idApiFootball, homeId, awayId, homeScore, awayScore, matchDate, status, becameFinished
) {
  if (status !== 'finished') return 0;

  if (!becameFinished && !(await shouldResyncMatchGoals(matchId, homeId, awayId, homeScore, awayScore))) {
    return 0;
  }

  try {
    const result = await syncMatchGoalsFromEvent(
      matchId, idEvent, homeId, awayId, homeScore, awayScore, idApiFootball, matchDate
    );
    if (result.ok && result.goals > 0) {
      const extra = result.reconciledGoals
        ? ` (+${result.reconciledGoals} reconciliados com placar)`
        : '';
      const src = result.usedOpenFootball
        ? 'openfootball'
        : result.usedApiFootball
          ? 'API-Football'
          : 'TheSportsDB';
      console.log(
        `[sync] ${matchId}: ${result.namedGoals} jogador(es), ${result.detailedGoals} artilheiro(s) [${src}], ${result.goals} no total${extra}`
      );
      return 1;
    }
    if (result.ok && result.goals === 0 && becameFinished) {
      console.log(`[sync] ${matchId}: timeline sem gols (${result.timelineEvents} eventos)`);
    }
  } catch (err) {
    console.error(`[sync] ${matchId}: falha ao importar gols —`, err.message);
  }
  return 0;
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
  if (status === 'finished') {
    recalculatePoolsForMatch(matchId).catch((err) => console.error('Pool ranking recalc:', err.message));
  }
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
  let goalsSynced = 0;
  const unmatched = [];

  try {
    const { rateLimited, events } = await fetchSeasonEvents();
    if (rateLimited) {
      state.lastError = null;
      state.rateLimitedUntil = getSportsDbRateLimitUntil();
      console.warn('[sync] TheSportsDB rate limit (429) — pausando tentativas por ~15 min');
      return {
        ok: true,
        skipped: true,
        reason: 'rate_limited',
        rateLimitedUntil: state.rateLimitedUntil,
      };
    }

    for (const ev of events) {
      const parsed = parseScorableEvent(ev);
      if (!parsed) continue;

      const homeId = teamIdFromSportsDb(ev.strHomeTeam);
      const awayId = teamIdFromSportsDb(ev.strAwayTeam);
      if (!homeId || !awayId) {
        unmatched.push(ev.strEvent);
        continue;
      }

      const matchRef = await findMatchId(homeId, awayId);
      if (!matchRef) {
        unmatched.push(ev.strEvent);
        continue;
      }
      const matchId = matchRef.id;
      const matchDate = matchRef.date;

      const { home, away, status } = parsed;
      const current = await getCurrentResult(matchId);

      const becameFinished = status === 'finished' && current.status !== 'finished';
      const scoreChanged = current.home !== home || current.away !== away || current.status !== status;

      if (!scoreChanged) {
        if (status === 'finished') {
          goalsSynced += await maybeSyncGoals(
            matchId, ev.idEvent, ev.idAPIfootball, homeId, awayId, home, away, matchDate, status, becameFinished
          );
        }
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

      if (status === 'finished') {
        goalsSynced += await maybeSyncGoals(
          matchId, ev.idEvent, ev.idAPIfootball, homeId, awayId, home, away, matchDate, status, true
        );
      }
    }

    state.lastOkAt = new Date().toISOString();
    state.lastError = null;
    state.rateLimitedUntil = null;
    state.lastUpdated = updated;
    state.lastSkipped = skipped;
    state.lastLive = liveCount;
    state.lastGoalsSynced = goalsSynced;

    return {
      ok: true,
      updated,
      skipped,
      live: liveCount,
      goalsSynced,
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

  const startupDelay = Number(process.env.SYNC_STARTUP_DELAY_MS || 120000);

  setTimeout(() => {
    runScoreSync().catch(() => {});
  }, startupDelay);

  timer = setInterval(() => {
    runScoreSync().catch(() => {});
  }, intervalMs);

  const enabled = await isSyncEnabled();
  console.log(`[sync] worker ativo — intervalo ${Math.round(intervalMs / 60000)} min, enabled=${enabled}, live+final`);
}

export async function getSyncStatus() {
  const enabled = await isSyncEnabled();
  const rateLimitedUntil = getSportsDbRateLimitUntil() || state.rateLimitedUntil;
  return {
    enabled,
    ...getSyncRuntimeState(),
    rateLimitedUntil,
    rateLimited: Boolean(rateLimitedUntil && new Date(rateLimitedUntil) > new Date()),
    intervalMinutes: Math.round(config().intervalMs / 60000),
    source: 'TheSportsDB',
    supportsLive: true,
    supportsGoalScorers: true,
    goalSources: [
      'openfootball/worldcup.json',
      'TheSportsDB lookuptimeline.php',
      'API-Football fixtures/events (opcional)',
    ],
    apiFootballConfigured: Boolean(process.env.API_FOOTBALL_KEY),
  };
}
