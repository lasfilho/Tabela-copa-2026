/**
 * Gráficos da página de detalhe de seleção.
 */
import { teamDetailedStats, phaseLabel } from './engine.js';

const instances = {};

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function chartColors() {
  return {
    accent: cssVar('--accent') || '#3dffaa',
    accent2: cssVar('--accent-2') || '#ff6b4a',
    gold: cssVar('--gold') || '#ffc857',
    muted: cssVar('--text-muted') || '#8b9cb8',
    grid: cssVar('--chart-grid') || 'rgba(255,255,255,0.06)',
    text: cssVar('--text') || '#f0f4fc',
  };
}

function destroyTeamCharts() {
  Object.values(instances).forEach((c) => c.destroy());
  Object.keys(instances).forEach((k) => delete instances[k]);
}

export function renderTeamDetailCharts(teamId, data) {
  destroyTeamCharts();
  const stats = teamDetailedStats(teamId, data);
  const c = chartColors();

  const phaseCanvas = document.getElementById('team-chart-goals-phase');
  const resultsCanvas = document.getElementById('team-chart-results');
  const compareCanvas = document.getElementById('team-chart-compare');

  if (!phaseCanvas || !resultsCanvas || !compareCanvas) return;

  const phases = Object.entries(stats.goalsByPhase)
    .filter(([, v]) => v.played > 0)
    .map(([phase]) => phase);

  if (phases.length) {
    instances.goalsPhase = new Chart(phaseCanvas, {
      type: 'bar',
      data: {
        labels: phases.map(phaseLabel),
        datasets: [
          {
            label: 'Marcados',
            data: phases.map((p) => stats.goalsByPhase[p].gf),
            backgroundColor: c.accent,
            borderRadius: 6,
          },
          {
            label: 'Sofridos',
            data: phases.map((p) => stats.goalsByPhase[p].ga),
            backgroundColor: c.accent2,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: c.text, font: { family: 'DM Sans' } } } },
        scales: {
          x: { ticks: { color: c.muted }, grid: { color: c.grid } },
          y: { ticks: { color: c.muted }, grid: { color: c.grid }, beginAtZero: true },
        },
      },
    });
  }

  if (stats.wins + stats.draws + stats.losses > 0) {
    instances.results = new Chart(resultsCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Vitórias', 'Empates', 'Derrotas'],
        datasets: [{
          data: [stats.wins, stats.draws, stats.losses],
          backgroundColor: [c.accent, c.gold, c.accent2],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: c.text } } },
      },
    });
  }

  const teamAvgPts = stats.played ? stats.pts / stats.played : 0;
  const teamAvgGF = stats.played ? stats.gf / stats.played : 0;
  const teamAvgGA = stats.played ? stats.ga / stats.played : 0;

  instances.compare = new Chart(compareCanvas, {
    type: 'bar',
    data: {
      labels: ['Pts/jogo', 'Gols/jogo', 'Sofridos/jogo'],
      datasets: [
        {
          label: data.teamMap[teamId]?.name ?? teamId,
          data: [teamAvgPts, teamAvgGF, teamAvgGA],
          backgroundColor: c.accent,
          borderRadius: 6,
        },
        {
          label: 'Média do torneio',
          data: [stats.tournamentAvg.pts, stats.tournamentAvg.gf, stats.tournamentAvg.ga],
          backgroundColor: c.muted,
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: c.text, font: { family: 'DM Sans' } } } },
      scales: {
        x: { ticks: { color: c.muted }, grid: { color: c.grid } },
        y: { ticks: { color: c.muted }, grid: { color: c.grid }, beginAtZero: true },
      },
    },
  });
}

export { destroyTeamCharts };
