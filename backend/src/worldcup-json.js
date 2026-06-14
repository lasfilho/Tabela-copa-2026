/**
 * Fonte openfootball/worldcup.json — gols por jogador, grátis, sem chave.
 * https://github.com/openfootball/worldcup.json
 */
import { teamIdFromSportsDb } from './sportsdb-team-map.js';

const WC_JSON_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
const CACHE_TTL_MS = 60 * 60 * 1000;

let cache = { fetchedAt: 0, matches: [] };

function cleanPlayerName(name) {
  if (!name || name === '0' || name === 'NULL') return null;
  return String(name).trim();
}

function parseMinute(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim();
  const base = Number.parseInt(raw.split('+')[0], 10);
  return Number.isFinite(base) ? base : null;
}

export async function fetchWorldCupJsonMatches() {
  if (cache.matches.length && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.matches;
  }

  const res = await fetch(WC_JSON_URL, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`worldcup.json HTTP ${res.status}`);

  const data = await res.json();
  cache = {
    fetchedAt: Date.now(),
    matches: data.matches ?? [],
  };
  return cache.matches;
}

function matchesTeams(m, homeId, awayId) {
  const t1 = teamIdFromSportsDb(m.team1);
  const t2 = teamIdFromSportsDb(m.team2);
  return (t1 === homeId && t2 === awayId) || (t1 === awayId && t2 === homeId);
}

function scoreMatches(m, homeId, awayId, homeScore, awayScore) {
  if (homeScore == null || awayScore == null || !m.score?.ft) return false;
  const t1 = teamIdFromSportsDb(m.team1);
  const [s1, s2] = m.score.ft;
  if (t1 === homeId) return s1 === homeScore && s2 === awayScore;
  if (t1 === awayId) return s1 === awayScore && s2 === homeScore;
  return false;
}

function findWorldCupMatch(wcMatches, homeId, awayId, matchDate, homeScore, awayScore) {
  const date = matchDate?.slice?.(0, 10) ?? matchDate;
  const withScore = wcMatches.filter((m) => m.score && matchesTeams(m, homeId, awayId));

  if (date) {
    const onDate = withScore.filter((m) => m.date === date);
    if (onDate.length === 1) return onDate[0];
    if (onDate.length > 1 && homeScore != null) {
      return onDate.find((m) => scoreMatches(m, homeId, awayId, homeScore, awayScore)) ?? onDate[0];
    }
  }

  if (homeScore != null && awayScore != null) {
    const byScore = withScore.find((m) => scoreMatches(m, homeId, awayId, homeScore, awayScore));
    if (byScore) return byScore;
  }

  return withScore[0] ?? null;
}

function parseGoalList(list, scoringTeamId, playerTeamId, sourcePrefix, startIdx) {
  const goals = [];
  let idx = startIdx;
  for (const item of list ?? []) {
    const player = cleanPlayerName(item.name);
    if (!player) continue;

    const ownGoal = item.owngoal === true;
    const goal = {
      externalId: `${sourcePrefix}-${idx}`,
      player,
      teamId: ownGoal ? playerTeamId : scoringTeamId,
      isOwnGoal: ownGoal,
      minute: parseMinute(item.minute),
      detail: ownGoal ? 'Own Goal' : 'Normal Goal',
      assistPlayer: null,
      countsForScorer: !ownGoal,
      source: 'openfootball',
    };
    goals.push(goal);
    idx += 1;
  }
  return { goals, nextIdx: idx };
}

/**
 * Converte entrada worldcup.json em gols normalizados.
 * goals1/goals2 são relativos a team1/team2 do JSON (não necessariamente mandante do app).
 */
export function parseWorldCupJsonGoals(wcMatch, homeId, awayId) {
  if (!wcMatch?.score) return [];

  const team1Id = teamIdFromSportsDb(wcMatch.team1);
  const team2Id = teamIdFromSportsDb(wcMatch.team2);
  if (!team1Id || !team2Id) return [];

  const team1IsHome = team1Id === homeId && team2Id === awayId;
  const team1IsAway = team1Id === awayId && team2Id === homeId;
  if (!team1IsHome && !team1IsAway) return [];

  const prefix = `of-${wcMatch.date}-${homeId}-${awayId}`;
  let idx = 0;

  // goals1: gols que entram no placar do team1
  const g1 = parseGoalList(
    wcMatch.goals1,
    team1Id,
    team2Id,
    prefix,
    idx
  );
  idx = g1.nextIdx;

  // goals2: gols que entram no placar do team2
  const g2 = parseGoalList(
    wcMatch.goals2,
    team2Id,
    team1Id,
    prefix,
    idx
  );

  return [...g1.goals, ...g2.goals];
}

export async function fetchWorldCupJsonGoals(homeId, awayId, matchDate, homeScore = null, awayScore = null) {
  try {
    const wcMatches = await fetchWorldCupJsonMatches();
    const wcMatch = findWorldCupMatch(wcMatches, homeId, awayId, matchDate, homeScore, awayScore);
    if (!wcMatch) return [];
    return parseWorldCupJsonGoals(wcMatch, homeId, awayId);
  } catch (err) {
    console.warn('[goals] worldcup.json indisponível —', err.message);
    return [];
  }
}
