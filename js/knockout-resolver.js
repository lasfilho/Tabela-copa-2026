/**
 * Preenche mata-mata a partir da classificação dos grupos (atual ou final)
 * e propaga vencedores nas fases seguintes.
 */
import { computeGroupStandings, getWinner, thirdPlaceRanking } from './engine.js';
import { teamShortName } from './team-names.js';

function posMap(data) {
  const map = { first: {}, second: {}, third: {} };
  data.groups.forEach((g) => {
    const st = computeGroupStandings(g.id, data.matches, g.teams);
    if (st[0]) map.first[g.id] = st[0].code;
    if (st[1]) map.second[g.id] = st[1].code;
    if (st[2]) map.third[g.id] = st[2].code;
  });
  return map;
}

function pickThird(candidates, used, ranking) {
  for (const t of ranking) {
    if (!candidates.includes(t.group)) continue;
    if (used.has(t.code)) continue;
    used.add(t.code);
    return t.code;
  }
  return null;
}

const R32_RULES = {
  'R32-1': (p, u, r) => ({ home: p.second.A, away: p.second.B }),
  'R32-2': (p, u, r) => ({ home: p.first.E, away: pickThird(['A', 'B', 'C', 'D', 'F'], u, r) }),
  'R32-3': (p) => ({ home: p.first.F, away: p.second.C }),
  'R32-4': (p) => ({ home: p.first.C, away: p.second.F }),
  'R32-5': (p, u, r) => ({ home: p.first.I, away: pickThird(['C', 'D', 'F', 'G', 'H'], u, r) }),
  'R32-6': (p) => ({ home: p.second.E, away: p.second.I }),
  'R32-7': (p, u, r) => ({ home: p.first.A, away: pickThird(['C', 'E', 'F', 'H', 'I'], u, r) }),
  'R32-8': (p, u, r) => ({ home: p.first.L, away: pickThird(['E', 'H', 'I', 'J', 'K'], u, r) }),
  'R32-9': (p, u, r) => ({ home: p.first.D, away: pickThird(['B', 'E', 'F', 'I', 'J'], u, r) }),
  'R32-10': (p, u, r) => ({ home: p.first.G, away: pickThird(['A', 'E', 'H', 'I', 'J'], u, r) }),
  'R32-11': (p) => ({ home: p.second.K, away: p.second.L }),
  'R32-12': (p) => ({ home: p.first.H, away: p.second.J }),
  'R32-13': (p, u, r) => ({ home: p.first.B, away: pickThird(['E', 'F', 'G', 'I', 'J'], u, r) }),
  'R32-14': (p) => ({ home: p.second.D, away: p.second.G }),
  'R32-15': (p) => ({ home: p.first.J, away: p.second.H }),
  'R32-16': (p, u, r) => ({ home: p.first.K, away: pickThird(['D', 'E', 'I', 'J', 'L'], u, r) }),
};

const BRACKET_FLOW = {
  // Oitavas — FIFA M89–M96 (vencedor M73–M88)
  'R16-1': ['R32-2', 'R32-5'], // M89 — Philadelphia
  'R16-2': ['R32-1', 'R32-3'], // M90 — Houston
  'R16-3': ['R32-4', 'R32-6'], // M91 — NY/NJ (1º C vs 2º F → oitavas do líder do C)
  'R16-4': ['R32-7', 'R32-8'], // M92 — Mexico City
  'R16-5': ['R32-11', 'R32-12'], // M93 — Dallas
  'R16-6': ['R32-9', 'R32-10'], // M94 — Seattle
  'R16-7': ['R32-15', 'R32-14'], // M95 — Atlanta
  'R16-8': ['R32-13', 'R32-16'], // M96 — Vancouver
  // Quartas — FIFA M97–M100 (SF-1 = M97×M98 | SF-2 = M99×M100)
  'QF-1': ['R16-1', 'R16-2'], // M97
  'QF-2': ['R16-5', 'R16-6'], // M98 — metade esquerda (SF-1)
  'QF-3': ['R16-3', 'R16-4'], // M99 — 1º C × 2º F → oitavas do Brasil líder
  'QF-4': ['R16-7', 'R16-8'], // M100 — metade direita (SF-2)
  'SF-1': ['QF-1', 'QF-2'],
  'SF-2': ['QF-3', 'QF-4'],
  BRONZE: ['SF-1', 'SF-2'],
  FINAL: ['SF-1', 'SF-2'],
};

export function allGroupMatchesDone(data) {
  return data.groups.every((g) => {
    const gm = data.matches.filter((m) => m.phase === 'group' && m.group === g.id);
    return gm.length === 6 && gm.every((m) => m.status === 'finished');
  });
}

function matchupLabel(data, home, away, projected = false) {
  if (!home || !away) return null;
  const suffix = projected ? ' (provisório)' : '';
  return `${teamShortName(data, home)} × ${teamShortName(data, away)}${suffix}`;
}

function feederWinner(byId, winners, matchId) {
  const src = byId[matchId];
  if (!src || src.status !== 'finished') return null;
  return winners[matchId] ?? null;
}

function feederLoser(byId, matchId) {
  const src = byId[matchId];
  if (!src || src.status !== 'finished') return null;
  return loserOf(src);
}

function fillR32FromGroups(byId, data, projected) {
  const positions = posMap(data);
  const ranking = thirdPlaceRanking(data);
  const usedThirds = new Set();

  Object.entries(R32_RULES).forEach(([id, rule]) => {
    const m = byId[id];
    if (!m) return;
    const { home, away } = rule(positions, usedThirds, ranking);
    m.home = home ?? null;
    m.away = away ?? null;
    m.bracketProjected = projected;
    const lbl = matchupLabel(data, home, away, projected);
    if (lbl) m.label = lbl;
  });
}

function propagateKnockoutRound(byId, data) {
  const tiers = [
    ['R16-1', 'R16-2', 'R16-3', 'R16-4', 'R16-5', 'R16-6', 'R16-7', 'R16-8'],
    ['QF-1', 'QF-2', 'QF-3', 'QF-4'],
    ['SF-1', 'SF-2'],
    ['FINAL', 'BRONZE'],
  ];

  for (const tier of tiers) {
    const winners = winnersMap(Object.values(byId));
    for (const targetId of tier) {
      const feeders = BRACKET_FLOW[targetId];
      if (!feeders) continue;
      const [a, b] = feeders;
      const m = byId[targetId];
      if (!m) continue;

      if (targetId === 'BRONZE') {
        m.home = feederLoser(byId, a);
        m.away = feederLoser(byId, b);
      } else {
        m.home = feederWinner(byId, winners, a);
        m.away = feederWinner(byId, winners, b);
      }

      const lbl = matchupLabel(data, m.home, m.away, false);
      if (lbl) m.label = lbl;
    }
  }
}

function winnersMap(matches) {
  const w = {};
  matches.forEach((m) => { w[m.id] = getWinner(m); });
  return w;
}

function loserOf(match) {
  const w = getWinner(match);
  if (!w) return null;
  return w === match.home ? match.away : match.home;
}

/** Retorna cópia dos jogos com participantes do mata-mata resolvidos. */
export function resolveKnockoutBracket(data) {
  const matches = data.matches.map((m) => ({ ...m }));
  const byId = Object.fromEntries(matches.map((m) => [m.id, m]));
  const bracketData = { ...data, matches };
  const projected = !allGroupMatchesDone(bracketData);

  fillR32FromGroups(byId, bracketData, projected);
  propagateKnockoutRound(byId, bracketData);

  return matches;
}

export function groupProgress(data, groupId) {
  const gm = data.matches.filter((m) => m.phase === 'group' && m.group === groupId);
  const done = gm.filter((m) => m.status === 'finished').length;
  return { total: gm.length, done };
}

export function isBracketProjected(data) {
  return !allGroupMatchesDone(data);
}
