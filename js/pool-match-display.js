/**
 * Exibição de partidas do bolão — bandeiras, nomes e chaveamento resolvido.
 */
import { flagUrl } from './data-service.js';
import { resolveKnockoutBracket } from './knockout-resolver.js';

export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

let bracketSource = { matches: [], groups: [], teamMap: {} };
let resolvedById = {};
let bracketCacheKey = '';

export function setPoolBracketSource(matches = [], groups = [], teamMap = {}) {
  bracketSource = { matches, groups, teamMap };
  const key = matches.map((m) => `${m.id}:${m.homeScore}:${m.awayScore}:${m.status}:${m.home}:${m.away}`).join('|');
  if (key !== bracketCacheKey) {
    bracketCacheKey = key;
    if (matches.length && groups.length) {
      const resolved = resolveKnockoutBracket({ matches, groups, teamMap });
      resolvedById = Object.fromEntries(resolved.map((m) => [m.id, m]));
    } else {
      resolvedById = {};
    }
  }
}

function teamCode(row, side) {
  return row[`${side}Team`] ?? row[`${side}_team`] ?? row[side] ?? null;
}

function teamName(row, side, teamMap) {
  const code = teamCode(row, side);
  const explicit = row[`${side}Name`] ?? row[`${side}_name`];
  if (explicit) return explicit;
  if (code && teamMap[code]?.name) return teamMap[code].name;
  return code;
}

export function resolveTeam(row, side, teamMap = {}) {
  const code = teamCode(row, side);
  const name = teamName(row, side, teamMap);
  const flag = row[`${side}Flag`] ?? row[`${side}_flag`];
  const t = code ? teamMap[code] : null;
  return {
    code: code ?? '',
    name: name ?? t?.name ?? (code || '—'),
    flag: flagUrl({ flag: flag ?? t?.flag ?? 'un' }),
  };
}

/** Enriquece partida do bolão com times do mata-mata (classificação + vencedores). */
export function enrichPoolMatch(row, teamMap = bracketSource.teamMap) {
  if (!row) return row;
  const phase = row.phase ?? row.match_phase;
  if (!phase || phase === 'group') return row;

  const resolved = resolvedById[row.id ?? row.matchId];
  if (!resolved) return row;

  const home = resolved.home ?? teamCode(row, 'home');
  const away = resolved.away ?? teamCode(row, 'away');
  const ht = home ? teamMap[home] : null;
  const at = away ? teamMap[away] : null;

  return {
    ...row,
    home,
    away,
    home_team: home,
    away_team: away,
    homeTeam: home,
    awayTeam: away,
    home_name: ht?.name ?? row.home_name,
    away_name: at?.name ?? row.away_name,
    homeName: ht?.name ?? row.homeName,
    awayName: at?.name ?? row.awayName,
    home_flag: ht?.flag ?? row.home_flag,
    away_flag: at?.flag ?? row.away_flag,
    homeFlag: ht?.flag ?? row.homeFlag,
    awayFlag: at?.flag ?? row.awayFlag,
    label: resolved.label ?? row.label,
    bracketProjected: resolved.bracketProjected ?? false,
  };
}

function hasBothTeams(home, away) {
  return Boolean(home.code && away.code && home.name !== '—' && away.name !== '—');
}

export function matchTeamsHTML(row, teamMap = {}, compact = false) {
  const enriched = enrichPoolMatch(row, teamMap);
  const home = resolveTeam(enriched, 'home', teamMap);
  const away = resolveTeam(enriched, 'away', teamMap);
  const cls = compact ? ' pool-match-teams--compact' : '';
  const w = compact ? 18 : 24;
  const h = compact ? 12 : 16;

  if (!hasBothTeams(home, away)) {
    if (home.code || away.code) {
      const homeHtml = home.code
        ? `<span class="pool-match-team"><img src="${home.flag}" alt="" width="${w}" height="${h}" loading="lazy" /> ${esc(home.name)}</span>`
        : '<span class="pool-match-team pool-match-team--tbd">?</span>';
      const awayHtml = away.code
        ? `<span class="pool-match-team"><img src="${away.flag}" alt="" width="${w}" height="${h}" loading="lazy" /> ${esc(away.name)}</span>`
        : '<span class="pool-match-team pool-match-team--tbd">?</span>';
      const proj = enriched.bracketProjected ? '<span class="pool-match-tbd">prov.</span>' : '';
      return `<div class="pool-match-teams${cls}">${homeHtml}<span class="pool-match-vs">×</span>${awayHtml}${proj}</div>`;
    }

    const label = enriched.label || row.label;
    if (label) {
      const tag = enriched.bracketProjected
        ? '<span class="pool-match-tbd">provisório</span>'
        : (!home.code && !away.code ? '<span class="pool-match-tbd">a definir</span>' : '');
      return `<div class="pool-match-teams pool-match-teams--label${cls}">
        <span class="pool-match-label">${esc(label)}</span>${tag}
      </div>`;
    }
  }

  return `<div class="pool-match-teams${cls}">
    <span class="pool-match-team"><img src="${home.flag}" alt="" width="${w}" height="${h}" loading="lazy" /> ${esc(home.name)}</span>
    <span class="pool-match-vs">×</span>
    <span class="pool-match-team"><img src="${away.flag}" alt="" width="${w}" height="${h}" loading="lazy" /> ${esc(away.name)}</span>
    ${enriched.bracketProjected ? '<span class="pool-match-tbd">prov.</span>' : ''}
  </div>`;
}

export function matchLabelText(row, teamMap = {}) {
  const enriched = enrichPoolMatch(row, teamMap);
  if (enriched.label) return enriched.label;
  const home = resolveTeam(enriched, 'home', teamMap);
  const away = resolveTeam(enriched, 'away', teamMap);
  if (home.name !== '—' && away.name !== '—') return `${home.name} × ${away.name}`;
  return enriched.matchId ?? enriched.id ?? '—';
}
