/**
 * Gráficos Chart.js — destrói instâncias anteriores ao re-renderizar.
 */
import { aggregateStats, phaseLabel } from './engine.js';

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

export function renderCharts(data) {
  destroyAll();
  const agg = aggregateStats(data);
  const c = chartColors();

  // Gols por fase
  const phases = Object.keys(agg.goalsByPhase).filter((p) => agg.goalsByPhase[p] > 0 || p === 'group');
  instances.goalsPhase = new Chart(document.getElementById('chart-goals-phase'), {
    type: 'bar',
    data: {
      labels: phases.map(phaseLabel),
      datasets: [{ label: 'Gols', data: phases.map((p) => agg.goalsByPhase[p]), backgroundColor: c.accent, borderRadius: 6 }],
    },
    options: baseOptions(c),
  });

  // Distribuição resultados
  instances.results = new Chart(document.getElementById('chart-results'), {
    type: 'doughnut',
    data: {
      labels: ['Vitórias (total)', 'Empates', 'Derrotas (total)'],
      datasets: [{
        data: [agg.wins, agg.draws, agg.losses],
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
