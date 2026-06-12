/**
 * Persistência de placares — modos Real e Simulação separados.
 */
const KEYS = {
  real: 'copa2026-scores-real',
  simulation: 'copa2026-scores-simulation',
};

export function loadScores(mode) {
  try {
    return JSON.parse(localStorage.getItem(KEYS[mode] || KEYS.real) || '{}');
  } catch {
    return {};
  }
}

export function saveScores(mode, scores) {
  localStorage.setItem(KEYS[mode], JSON.stringify(scores));
}

export function clearScores(mode) {
  localStorage.removeItem(KEYS[mode]);
}

/** Aplica placares salvos sobre a lista base de jogos. */
export function applyScoresToMatches(baseMatches, scores) {
  return baseMatches.map((m) => {
    const saved = scores[m.id];
    if (!saved) {
      return { ...m, homeScore: null, awayScore: null, status: 'scheduled' };
    }
    const homeScore = saved.homeScore ?? null;
    const awayScore = saved.awayScore ?? null;
    const hasScore = homeScore != null && awayScore != null;
    return {
      ...m,
      homeScore,
      awayScore,
      status: saved.status ?? (hasScore ? 'finished' : 'scheduled'),
    };
  });
}

/** Registra ou remove placar de um jogo. */
export function setMatchScore(scores, matchId, homeScore, awayScore) {
  const next = { ...scores };
  if (homeScore == null || awayScore == null || homeScore === '' || awayScore === '') {
    delete next[matchId];
    return next;
  }
  next[matchId] = {
    homeScore: Number(homeScore),
    awayScore: Number(awayScore),
    status: 'finished',
    updatedAt: new Date().toISOString(),
  };
  return next;
}

export function copyScores(fromMode, toMode) {
  const scores = loadScores(fromMode);
  saveScores(toMode, scores);
  return scores;
}

export function exportScores(mode) {
  return { mode, exportedAt: new Date().toISOString(), scores: loadScores(mode) };
}

export function importScores(mode, payload) {
  if (payload?.scores) saveScores(mode, payload.scores);
}
