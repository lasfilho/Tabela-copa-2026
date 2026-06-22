/**
 * Cálculos: classificação, KPIs, estatísticas agregadas e fase atual.
 */

const PHASE_ORDER = ['group', 'r32', 'r16', 'qf', 'sf', 'bronze', 'final'];
const PHASE_LABELS = {
  group: 'Fase de grupos',
  r32: 'Oitavas de final (32)',
  r16: 'Oitavas de final (16)',
  qf: 'Quartas de final',
  sf: 'Semifinais',
  bronze: 'Disputa de 3º lugar',
  final: 'Final',
};

export { PHASE_LABELS };

export function emptyStanding(code) {
  return { code, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [] };
}

export function computeGroupStandings(groupId, matches, teamIds) {
  const standings = Object.fromEntries(teamIds.map((c) => [c, emptyStanding(c)]));

  matches
    .filter((m) => m.phase === 'group' && m.group === groupId && m.status === 'finished')
    .forEach((m) => {
      const h = standings[m.home];
      const a = standings[m.away];
      if (!h || !a) return;
      h.played++; a.played++;
      h.gf += m.homeScore; h.ga += m.awayScore;
      a.gf += m.awayScore; a.ga += m.homeScore;
      if (m.homeScore > m.awayScore) {
        h.won++; h.pts += 3; a.lost++;
        h.form.push('W'); a.form.push('L');
      } else if (m.homeScore < m.awayScore) {
        a.won++; a.pts += 3; h.lost++;
        a.form.push('W'); h.form.push('L');
      } else {
        h.drawn++; a.drawn++; h.pts++; a.pts++;
        h.form.push('D'); a.form.push('D');
      }
      h.gd = h.gf - h.ga;
      a.gd = a.gf - a.ga;
    });

  return Object.values(standings).sort(
    (x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.code.localeCompare(y.code)
  );
}

export function teamStats(teamId, matches) {
  const s = emptyStanding(teamId);
  matches.filter((m) => m.status === 'finished' && (m.home === teamId || m.away === teamId)).forEach((m) => {
    const isHome = m.home === teamId;
    const gf = isHome ? m.homeScore : m.awayScore;
    const ga = isHome ? m.awayScore : m.homeScore;
    s.played++;
    s.gf += gf; s.ga += ga;
    if (gf > ga) { s.won++; s.pts += 3; }
    else if (gf < ga) { s.lost++; }
    else { s.drawn++; s.pts++; }
    s.gd = s.gf - s.ga;
  });
  s.aproveitamento = s.played ? Math.round((s.pts / (s.played * 3)) * 100) : 0;
  return s;
}

export function teamDetailedStats(teamId, data) {
  const { matches, teams, groups, teamMap } = data;
  const base = teamStats(teamId, matches);
  const t = teamMap[teamId];
  const finished = matches.filter(
    (m) => m.status === 'finished' && (m.home === teamId || m.away === teamId)
  );

  const goalsByPhase = {};
  PHASE_ORDER.forEach((p) => { goalsByPhase[p] = { gf: 0, ga: 0, played: 0 }; });

  let wins = 0;
  let draws = 0;
  let losses = 0;
  let cleanSheets = 0;

  finished.forEach((m) => {
    const isHome = m.home === teamId;
    const gf = isHome ? m.homeScore : m.awayScore;
    const ga = isHome ? m.awayScore : m.homeScore;
    const bucket = goalsByPhase[m.phase] ?? { gf: 0, ga: 0, played: 0 };
    bucket.gf += gf;
    bucket.ga += ga;
    bucket.played += 1;
    goalsByPhase[m.phase] = bucket;
    if (gf > ga) wins += 1;
    else if (gf < ga) losses += 1;
    else draws += 1;
    if (ga === 0) cleanSheets += 1;
  });

  const allStats = teams.map((team) => ({ id: team.id, ...teamStats(team.id, matches) }));
  const withPlayed = allStats.filter((s) => s.played > 0);

  const rankBy = (field, ascending = false) => {
    if (!withPlayed.length) return null;
    const sorted = [...withPlayed].sort((a, b) => (
      ascending ? a[field] - b[field] : b[field] - a[field]
    ));
    const idx = sorted.findIndex((s) => s.id === teamId);
    return idx >= 0 ? idx + 1 : null;
  };

  const tournamentAvg = withPlayed.length
    ? {
        gf: withPlayed.reduce((sum, s) => sum + s.gf / s.played, 0) / withPlayed.length,
        ga: withPlayed.reduce((sum, s) => sum + s.ga / s.played, 0) / withPlayed.length,
        pts: withPlayed.reduce((sum, s) => sum + s.pts / s.played, 0) / withPlayed.length,
      }
    : { gf: 0, ga: 0, pts: 0 };

  const groupTeams = groups.find((g) => g.id === t?.group)?.teams ?? [];
  const standings = computeGroupStandings(t?.group, matches, groupTeams);
  const groupPos = standings.findIndex((s) => s.code === teamId) + 1;

  const teamMatches = matches
    .filter((m) => m.home === teamId || m.away === teamId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  return {
    ...base,
    goalsByPhase,
    wins,
    draws,
    losses,
    cleanSheets,
    avgGF: base.played ? (base.gf / base.played).toFixed(2) : '0.00',
    avgGA: base.played ? (base.ga / base.played).toFixed(2) : '0.00',
    ranks: {
      pts: rankBy('pts'),
      gf: rankBy('gf'),
      ga: rankBy('ga', true),
      gd: rankBy('gd'),
      total: withPlayed.length,
    },
    tournamentAvg,
    groupPos: groupPos || null,
    standings,
    teamMatches,
  };
}

export function computeKPIs(data) {
  const { matches, teams, tournament } = data;
  const finished = matches.filter((m) => m.status === 'finished');
  const pending = matches.filter((m) => m.status === 'scheduled');
  const live = matches.filter((m) => m.status === 'live');
  const totalGoals = finished.reduce((s, m) => s + m.homeScore + m.awayScore, 0);
  const avgGoals = finished.length ? (totalGoals / finished.length).toFixed(2) : '0.00';
  const draws = finished.filter((m) => m.homeScore === m.awayScore).length;

  return {
    totalTeams: teams.length,
    totalMatches: matches.length,
    finished: finished.length,
    pending: pending.length,
    live: live.length,
    totalGoals,
    avgGoals,
    draws,
    currentPhase: detectCurrentPhase(matches, tournament),
  };
}

const APP_TIMEZONE = 'America/Sao_Paulo';

/** Data de hoje no fuso do torneio (BRT), formato YYYY-MM-DD. */
export function todayDateString(timeZone = APP_TIMEZONE) {
  return new Date().toLocaleDateString('en-CA', { timeZone });
}

export function detectCurrentPhase(matches, tournament) {
  const today = todayDateString();
  const unfinishedGroup = matches.some((m) => m.phase === 'group' && m.status !== 'finished');
  if (unfinishedGroup) return PHASE_LABELS.group;

  for (const phase of ['r32', 'r16', 'qf', 'sf', 'bronze', 'final']) {
    const phaseMatches = matches.filter((m) => m.phase === phase);
    if (phaseMatches.some((m) => m.status !== 'finished')) {
      return PHASE_LABELS[phase];
    }
  }

  if (today < tournament.start) return 'Pré-torneio';
  if (today > tournament.end) return 'Torneio encerrado';
  return PHASE_LABELS.group;
}

/** Rótulo simplificado para a barra de status (Visão geral / Jogos). */
export function getStatusPhaseLabel(matches, tournament) {
  const today = todayDateString();
  const knockoutPhases = ['r32', 'r16', 'qf', 'sf', 'bronze', 'final'];

  const unfinishedGroup = matches.some((m) => m.phase === 'group' && m.status !== 'finished');
  if (unfinishedGroup) return 'Fase de grupos';

  const unfinishedKnockout = matches.some(
    (m) => knockoutPhases.includes(m.phase) && m.status !== 'finished'
  );
  if (unfinishedKnockout) return 'Fase de mata-mata';

  if (today < tournament.start) return 'Pré-torneio';
  if (today > tournament.end) return 'Torneio encerrado';

  const hadKnockout = matches.some((m) => knockoutPhases.includes(m.phase));
  return hadKnockout ? 'Fase de mata-mata' : 'Fase de grupos';
}

export function aggregateStats(data) {
  const { matches, teams, teamMap, groups } = data;
  const finished = matches.filter((m) => m.status === 'finished');

  let wins = 0; let draws = 0; let losses = 0;
  finished.forEach((m) => {
    if (m.homeScore > m.awayScore) { wins++; losses++; }
    else if (m.homeScore < m.awayScore) { wins++; losses++; }
    else { draws += 2; }
  });

  const teamPerformance = teams.map((t) => {
    const s = teamStats(t.id, matches);
    return { ...t, ...s };
  }).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);

  const playedTeams = teamPerformance.filter((t) => t.played > 0);

  const attack = [...teamPerformance].sort((a, b) => b.gf - a.gf).slice(0, 8);
  const defense = [...playedTeams].sort((a, b) => a.ga - b.ga).slice(0, 8);

  const topAproveitamento = [...playedTeams]
    .sort((a, b) => b.aproveitamento - a.aproveitamento || b.pts - a.pts)
    .slice(0, 8);

  const topGoalDifference = [...playedTeams]
    .sort((a, b) => b.gd - a.gd || b.gf - a.gf)
    .slice(0, 8);

  const resultsBreakdown = [...playedTeams]
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd)
    .slice(0, 8);

  const confederationMap = {};
  playedTeams.forEach((t) => {
    const key = t.confederation;
    if (!confederationMap[key]) {
      confederationMap[key] = { confederation: key, teams: 0, played: 0, pts: 0, gf: 0, ga: 0 };
    }
    const bucket = confederationMap[key];
    bucket.teams += 1;
    bucket.played += t.played;
    bucket.pts += t.pts;
    bucket.gf += t.gf;
    bucket.ga += t.ga;
  });

  const confederationStats = Object.values(confederationMap)
    .map((c) => ({
      ...c,
      avgPts: c.played ? c.pts / c.played : 0,
      avgGF: c.played ? c.gf / c.played : 0,
      avgGA: c.played ? c.ga / c.played : 0,
    }))
    .sort((a, b) => b.avgPts - a.avgPts);

  const groupStats = groups.map((g) => {
    const gm = finished.filter((m) => m.group === g.id);
    const goals = gm.reduce((s, m) => s + m.homeScore + m.awayScore, 0);
    return { group: g.id, goals, matches: gm.length };
  });

  return {
    wins,
    draws,
    losses,
    teamPerformance,
    attack,
    defense,
    topAproveitamento,
    topGoalDifference,
    resultsBreakdown,
    confederationStats,
    groupStats,
  };
}

export function getNextMatch(matches, today = todayDateString()) {
  const live = matches.find((m) => m.status === 'live');
  if (live) return live;

  return matches
    .filter((m) => m.status === 'scheduled' && m.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))[0];
}

export function getWinner(match) {
  if (match.status !== 'finished') return null;
  if (match.homeScore > match.awayScore) return match.home;
  if (match.awayScore > match.homeScore) return match.away;
  return null;
}

export function thirdPlaceRanking(data) {
  return data.groups.map((g) => {
    const standings = computeGroupStandings(g.id, data.matches, g.teams);
    const third = standings[2];
    return third ? { ...third, group: g.id } : null;
  }).filter(Boolean).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.code.localeCompare(b.code));
}

export function filterMatches(matches, filters, teamMap = null) {
  let result = [...matches];
  const { phase, group, team, date, status, search } = filters;

  if (phase && phase !== 'all') result = result.filter((m) => m.phase === phase);
  if (group && group !== 'all') result = result.filter((m) => m.group === group);
  if (team && team !== 'all') result = result.filter((m) => m.home === team || m.away === team);
  if (date) result = result.filter((m) => m.date === date);
  if (status && status !== 'all') result = result.filter((m) => m.status === status);
  if (search) {
    const q = search.toLowerCase();
    result = result.filter((m) => matchSearchText(m, teamMap).includes(q));
  }

  return result.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

function matchSearchText(m, teamMap) {
  const homeName = teamMap?.[m.home]?.name ?? '';
  const awayName = teamMap?.[m.away]?.name ?? '';
  return [
    m.id,
    m.venue,
    m.group,
    m.home,
    m.away,
    homeName,
    awayName,
    m.group ? `grupo ${m.group}` : '',
  ].filter(Boolean).join(' ').toLowerCase();
}

export function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function formatDateShort(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

/** Meia-noite BRT exibida como 24:00 (padrão de grade esportiva brasileira). */
export function formatMatchTime(time) {
  const t = String(time ?? '').slice(0, 5);
  return t === '00:00' ? '24:00' : t;
}

export function isToday(dateStr) {
  return dateStr === todayDateString();
}

export function statusLabel(status) {
  return { finished: 'Encerrado', scheduled: 'Agendado', live: 'Em andamento' }[status] || status;
}

export function phaseLabel(phase) {
  return PHASE_LABELS[phase] || phase;
}

export function normalizeScorers(scorers = []) {
  return scorers.map((s) => ({
    player: s.player,
    team: s.team ?? s.team_id ?? s.teamId ?? '',
    goals: Number(s.goals ?? 0),
    assists: Number(s.assists ?? 0),
  }));
}

export function teamScorers(data, teamId) {
  return normalizeScorers(data.stats?.topScorers ?? [])
    .filter((s) => s.team === teamId && s.goals > 0)
    .sort((a, b) => b.goals - a.goals || a.player.localeCompare(b.player));
}

/** Gols da seleção para a página de detalhe (inclui gol contra e gols sem artilheiro). */
export function teamGoalContributions(data, teamId) {
  const goals = (data.stats?.matchGoals ?? []).filter((g) => g.team === teamId);
  const ownGoals = [];
  const scorerMap = new Map();
  let unknownGoals = 0;

  for (const g of goals) {
    if (g.isOwnGoal && g.player) {
      ownGoals.push({
        kind: 'own',
        player: g.player,
        minute: g.minute,
        detail: g.detail,
      });
      continue;
    }
    if (!g.player || !g.countsForScorer) {
      unknownGoals += 1;
      continue;
    }
    const key = g.player;
    if (!scorerMap.has(key)) {
      scorerMap.set(key, { player: g.player, goals: 0, assists: 0, minutes: [] });
    }
    const entry = scorerMap.get(key);
    entry.goals += 1;
    if (g.minute != null) entry.minutes.push(g.minute);
  }

  for (const g of goals) {
    if (!g.assistPlayer || g.isOwnGoal || !g.countsForScorer) continue;
    const key = g.assistPlayer;
    if (!scorerMap.has(key)) {
      scorerMap.set(key, { player: g.assistPlayer, goals: 0, assists: 0, minutes: [] });
    }
    scorerMap.get(key).assists += 1;
  }

  const scorers = [...scorerMap.values()]
    .filter((s) => s.goals > 0 || s.assists > 0)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.player.localeCompare(b.player))
    .map((s) => ({ kind: 'scorer', ...s }));

  const result = [...scorers, ...ownGoals];
  if (unknownGoals > 0) {
    result.push({ kind: 'unknown', count: unknownGoals });
  }
  return result;
}
