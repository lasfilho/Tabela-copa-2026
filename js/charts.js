/**
 * Gráficos Chart.js — destrói instâncias anteriores ao re-renderizar.
 */
import { aggregateStats } from './engine.js';

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

function destroyAll() {
  Object.values(instances).forEach((c) => c.destroy());
  Object.keys(instances).forEach((k) => delete instances[k]);
}

function baseOptions(c) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: c.text, font: { family: 'DM Sans' } } },
    },
    scales: {
      x: { ticks: { color: c.muted }, grid: { color: c.grid } },
      y: { ticks: { color: c.muted }, grid: { color: c.grid }, beginAtZero: true },
    },
  };
}

function horizontalBarOptions(c) {
  return {
    ...baseOptions(c),
    indexAxis: 'y',
    scales: {
      x: { ticks: { color: c.muted }, grid: { color: c.grid }, beginAtZero: true },
      y: { ticks: { color: c.muted, font: { size: 11 } }, grid: { display: false } },
    },
  };
}

export function renderCharts(data) {
  destroyAll();
  const agg = aggregateStats(data);
  const c = chartColors();

  // Aproveitamento por seleção (top 8)
  const aprovEl = document.getElementById('chart-aproveitamento');
  if (aprovEl && agg.topAproveitamento.length) {
    instances.aproveitamento = new Chart(aprovEl, {
      type: 'bar',
      data: {
        labels: agg.topAproveitamento.map((t) => t.name),
        datasets: [{
          label: 'Aproveitamento (%)',
          data: agg.topAproveitamento.map((t) => t.aproveitamento),
          backgroundColor: c.accent,
          borderRadius: 6,
        }],
      },
      options: {
        ...horizontalBarOptions(c),
        scales: {
          ...horizontalBarOptions(c).scales,
          x: { ...horizontalBarOptions(c).scales.x, max: 100 },
        },
      },
    });
  }

  // Saldo de gols por seleção (top 8)
  const gdEl = document.getElementById('chart-goal-diff');
  if (gdEl && agg.topGoalDifference.length) {
    instances.goalDiff = new Chart(gdEl, {
      type: 'bar',
      data: {
        labels: agg.topGoalDifference.map((t) => t.name),
        datasets: [{
          label: 'Saldo de gols',
          data: agg.topGoalDifference.map((t) => t.gd),
          backgroundColor: agg.topGoalDifference.map((t) => (t.gd >= 0 ? c.accent : c.accent2)),
          borderRadius: 6,
        }],
      },
      options: horizontalBarOptions(c),
    });
  }

  // V-E-D por seleção (empilhado — compara seleções, não o torneio agregado)
  const vedEl = document.getElementById('chart-results-teams');
  if (vedEl && agg.resultsBreakdown.length) {
    instances.resultsTeams = new Chart(vedEl, {
      type: 'bar',
      data: {
        labels: agg.resultsBreakdown.map((t) => t.name),
        datasets: [
          {
            label: 'Vitórias',
            data: agg.resultsBreakdown.map((t) => t.won),
            backgroundColor: c.accent,
            borderRadius: 4,
          },
          {
            label: 'Empates',
            data: agg.resultsBreakdown.map((t) => t.drawn),
            backgroundColor: c.gold,
            borderRadius: 4,
          },
          {
            label: 'Derrotas',
            data: agg.resultsBreakdown.map((t) => t.lost),
            backgroundColor: c.accent2,
            borderRadius: 4,
          },
        ],
      },
      options: {
        ...horizontalBarOptions(c),
        scales: {
          ...horizontalBarOptions(c).scales,
          x: { ...horizontalBarOptions(c).scales.x, stacked: true },
          y: { ...horizontalBarOptions(c).scales.y, stacked: true },
        },
      },
    });
  }

  // Desempenho médio por confederação
  const confEl = document.getElementById('chart-confederation');
  if (confEl && agg.confederationStats.length) {
    instances.confederation = new Chart(confEl, {
      type: 'bar',
      data: {
        labels: agg.confederationStats.map((row) => row.confederation),
        datasets: [
          {
            label: 'Pts/jogo (média)',
            data: agg.confederationStats.map((row) => Number(row.avgPts.toFixed(2))),
            backgroundColor: c.accent,
            borderRadius: 6,
          },
          {
            label: 'Gols/jogo (média)',
            data: agg.confederationStats.map((row) => Number(row.avgGF.toFixed(2))),
            backgroundColor: c.accent2,
            borderRadius: 6,
          },
        ],
      },
      options: baseOptions(c),
    });
  }

  // Melhor ataque
  instances.attack = new Chart(document.getElementById('chart-attack'), {
    type: 'bar',
    data: {
      labels: agg.attack.map((t) => t.name),
      datasets: [{ label: 'Gols marcados', data: agg.attack.map((t) => t.gf), backgroundColor: c.accent2, borderRadius: 6 }],
    },
    options: { ...baseOptions(c), indexAxis: 'y' },
  });

  // Melhor defesa
  instances.defense = new Chart(document.getElementById('chart-defense'), {
    type: 'bar',
    data: {
      labels: agg.defense.map((t) => t.name),
      datasets: [{ label: 'Gols sofridos', data: agg.defense.map((t) => t.ga), backgroundColor: c.gold, borderRadius: 6 }],
    },
    options: { ...baseOptions(c), indexAxis: 'y' },
  });

  // Comparativo grupos
  instances.groups = new Chart(document.getElementById('chart-groups'), {
    type: 'line',
    data: {
      labels: agg.groupStats.map((g) => 'Grupo ' + g.group),
      datasets: [
        { label: 'Gols no grupo', data: agg.groupStats.map((g) => g.goals), borderColor: c.accent, backgroundColor: c.accent + '33', fill: true, tension: 0.3 },
        { label: 'Jogos disputados', data: agg.groupStats.map((g) => g.matches), borderColor: c.accent2, tension: 0.3 },
      ],
    },
    options: baseOptions(c),
  });
}

export function refreshChartsTheme() {
  /* Re-render on theme change handled by app re-calling renderCharts */
}
