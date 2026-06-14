/**
 * Marca titulares prováveis com base na formação (4-4-2 por padrão).
 */
const FORMATIONS = {
  '4-4-2': { gk: 1, def: 4, mid: 4, fwd: 2 },
  '4-3-3': { gk: 1, def: 4, mid: 3, fwd: 3 },
  '3-5-2': { gk: 1, def: 3, mid: 5, fwd: 2 },
};

function positionLine(position) {
  const p = String(position || '').toLowerCase();
  if (p.includes('goal')) return 'gk';
  if (p.includes('def') || p.includes('back')) return 'def';
  if (p.includes('mid')) return 'mid';
  return 'fwd';
}

export function computeProbableStarters(players, formation = '4-4-2') {
  const counts = FORMATIONS[formation] || FORMATIONS['4-4-2'];
  const buckets = { gk: [], def: [], mid: [], fwd: [], other: [] };
  const sorted = [...players].sort((a, b) => (a.shirtNumber ?? 99) - (b.shirtNumber ?? 99));

  for (const p of sorted) {
    buckets[positionLine(p.position)].push(p);
  }

  const used = new Set();
  const starters = new Set();

  const take = (line, count) => {
    let picked = 0;
    for (const p of buckets[line]) {
      if (picked >= count) break;
      if (used.has(p.player)) continue;
      used.add(p.player);
      starters.add(p.player);
      picked += 1;
    }
  };

  take('gk', counts.gk);
  take('def', counts.def);
  take('mid', counts.mid);
  take('fwd', counts.fwd);

  return players.map((p) => ({
    ...p,
    isProbableStarter: starters.has(p.player),
  }));
}
