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

export function detectCurrentPhase(matches, tournament) {
  const today = new Date().toISOString().slice(0, 10);
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

export function aggregateStats(data) {
  const { matches, teams, teamMap, groups } = data;
  const finished = matches.filter((m) => m.status === 'finished');

  const goalsByPhase = {};
  PHASE_ORDER.forEach((p) => { goalsByPhase[p] = 0; });
  finished.forEach((m) => {
    goalsByPhase[m.phase] = (goalsByPhase[m.phase] || 0) + m.homeScore + m.awayScore;
  });

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

  const attack = [...teamPerformance].sort((a, b) => b.gf - a.gf).slice(0, 8);
  const defense = [...teamPerformance].filter((t) => t.played > 0).sort((a, b) => a.ga - b.ga).slice(0, 8);

  const groupStats = groups.map((g) => {
    const ids = g.teams;
    const gm = finished.filter((m) => m.group === g.id);
    const goals = gm.reduce((s, m) => s + m.homeScore + m.awayScore, 0);
    return { group: g.id, goals, matches: gm.length };
  });

  return { goalsByPhase, wins, draws, losses, teamPerformance, attack, defense, groupStats };
}

export function getNextMatch(matches, today = new Date().toISOString().slice(0, 10)) {
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
    return third?.played ? { ...third, group: g.id } : null;
  }).filter(Boolean).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
}

export function filterMatches(matches, filters) {
  let result = [...matches];
  const { phase, group, team, date, status, search } = filters;

  if (phase && phase !== 'all') result = result.filter((m) => m.phase === phase);
  if (group && group !== 'all') result = result.filter((m) => m.group === group);
  if (team && team !== 'all') result = result.filter((m) => m.home === team || m.away === team);
  if (date) result = result.filter((m) => m.date === date);
  if (status && status !== 'all') result = result.filter((m) => m.status === status);
  if (search) {
    const q = search.toLowerCase();
    result = result.filter((m) =>
      m.id.toLowerCase().includes(q) ||
      m.venue?.toLowerCase().includes(q) ||
      m.home?.toLowerCase().includes(q) ||
      m.away?.toLowerCase().includes(q)
    );
  }

  return result.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
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

export function isToday(dateStr) {
  return dateStr === new Date().toISOString().slice(0, 10);
}

export function statusLabel(status) {
  return { finished: 'Encerrado', scheduled: 'Agendado', live: 'Em andamento' }[status] || status;
}

export function phaseLabel(phase) {
  return PHASE_LABELS[phase] || phase;
}
