/**
 * Exibição de partidas do bolão — bandeiras e nomes das seleções.
 */
import { flagUrl } from './data-service.js';

export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

export function resolveTeam(row, side, teamMap = {}) {
  const code = row[`${side}Team`] ?? row[`${side}_team`];
  const name = row[`${side}Name`] ?? row[`${side}_name`];
  const flag = row[`${side}Flag`] ?? row[`${side}_flag`];
  const t = code ? teamMap[code] : null;
  return {
    code: code ?? '',
    name: name ?? t?.name ?? code ?? '—',
    flag: flagUrl({ flag: flag ?? t?.flag ?? 'un' }),
  };
}

export function matchTeamsHTML(row, teamMap = {}, compact = false) {
  const home = resolveTeam(row, 'home', teamMap);
  const away = resolveTeam(row, 'away', teamMap);
  const cls = compact ? ' pool-match-teams--compact' : '';
  const w = compact ? 18 : 24;
  const h = compact ? 12 : 16;
  return `<div class="pool-match-teams${cls}">
    <span class="pool-match-team"><img src="${home.flag}" alt="" width="${w}" height="${h}" loading="lazy" /> ${esc(home.name)}</span>
    <span class="pool-match-vs">×</span>
    <span class="pool-match-team"><img src="${away.flag}" alt="" width="${w}" height="${h}" loading="lazy" /> ${esc(away.name)}</span>
  </div>`;
}

export function matchLabelText(row, teamMap = {}) {
  if (row.label) return row.label;
  const home = resolveTeam(row, 'home', teamMap);
  const away = resolveTeam(row, 'away', teamMap);
  if (home.name !== '—' && away.name !== '—') return `${home.name} × ${away.name}`;
  return row.matchId ?? row.id ?? '—';
}
