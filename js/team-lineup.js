/**
 * Escalação compacta — campo + titulares + reservas (3 colunas).
 */
const FORMATION_SLOTS = {
  '4-4-2': [
    { line: 'gk', slots: [{ x: 50, y: 88 }] },
    { line: 'def', slots: [{ x: 14, y: 70 }, { x: 36, y: 72 }, { x: 64, y: 72 }, { x: 86, y: 70 }] },
    { line: 'mid', slots: [{ x: 14, y: 46 }, { x: 36, y: 44 }, { x: 64, y: 44 }, { x: 86, y: 46 }] },
    { line: 'fwd', slots: [{ x: 36, y: 20 }, { x: 64, y: 20 }] },
  ],
  '4-3-3': [
    { line: 'gk', slots: [{ x: 50, y: 88 }] },
    { line: 'def', slots: [{ x: 14, y: 70 }, { x: 36, y: 72 }, { x: 64, y: 72 }, { x: 86, y: 70 }] },
    { line: 'mid', slots: [{ x: 28, y: 46 }, { x: 50, y: 42 }, { x: 72, y: 46 }] },
    { line: 'fwd', slots: [{ x: 22, y: 20 }, { x: 50, y: 16 }, { x: 78, y: 20 }] },
  ],
};

const TEAM_KITS = {
  USA: { primary: '#bf0a30', secondary: '#ffffff', accent: '#002868', gk: '#1a1a1a' },
  PAR: { primary: '#d52b1e', secondary: '#ffffff', accent: '#0038a8', gk: '#3d5c0a' },
  BRA: { primary: '#ffdf00', secondary: '#009739', accent: '#002776', gk: '#111111' },
  ARG: { primary: '#74acdf', secondary: '#ffffff', accent: '#2e4f7a', gk: '#111111' },
  MEX: { primary: '#006847', secondary: '#ffffff', accent: '#ce1126', gk: '#111111' },
  GER: { primary: '#ffffff', secondary: '#000000', accent: '#dd0000', gk: '#f5c400' },
  FRA: { primary: '#002395', secondary: '#ffffff', accent: '#ed2939', gk: '#111111' },
  ESP: { primary: '#aa151b', secondary: '#f1bf00', accent: '#aa151b', gk: '#111111' },
  ENG: { primary: '#ffffff', secondary: '#ce1124', accent: '#00247d', gk: '#00a650' },
  POR: { primary: '#006600', secondary: '#ff0000', accent: '#ffcc00', gk: '#111111' },
  NED: { primary: '#ff6600', secondary: '#ffffff', accent: '#21468b', gk: '#111111' },
  DEFAULT: { primary: '#e8e8e8', secondary: '#2a3344', accent: '#3dffaa', gk: '#111111' },
};

function kitFor(teamId) {
  return TEAM_KITS[teamId] || TEAM_KITS.DEFAULT;
}

function formationFor(data, teamId) {
  return data.teamMap[teamId]?.probable_formation || '4-4-2';
}

function formationSlots(formation) {
  return FORMATION_SLOTS[formation] || FORMATION_SLOTS['4-4-2'];
}

function positionLine(position) {
  const p = String(position || '').toLowerCase();
  if (p.includes('goal')) return 'gk';
  if (p.includes('back') || p.includes('def')) return 'def';
  if (p.includes('mid')) return 'mid';
  return 'fwd';
}

function shortName(full) {
  if (!full) return '—';
  return full.trim();
}

function squadForTeam(data, teamId) {
  return (data.stats?.squads ?? []).filter((p) => p.team === teamId);
}

function pickStartingXI(players, formation) {
  const slots = formationSlots(formation);
  const marked = players.filter((p) => p.isProbableStarter);
  const pool = marked.length >= 11 ? marked : players;

  const buckets = { gk: [], def: [], mid: [], fwd: [], other: [] };
  const sorted = [...pool].sort((a, b) => (a.number ?? 99) - (b.number ?? 99));

  for (const p of sorted) {
    buckets[positionLine(p.position)].push(p);
  }

  const used = new Set();
  const take = (line, count) => {
    const picked = [];
    for (const p of buckets[line]) {
      if (picked.length >= count) break;
      if (used.has(p.player)) continue;
      used.add(p.player);
      picked.push(p);
    }
    return picked;
  };

  const xi = [];
  const counts = { gk: 1, def: 4, mid: 4, fwd: 2 };
  if (formation === '4-3-3') {
    counts.mid = 3;
    counts.fwd = 3;
  }

  for (const row of slots) {
    const picked = take(row.line, counts[row.line] ?? row.slots.length);
    row.slots.forEach((slot, i) => {
      xi.push({ ...picked[i], slot, line: row.line, empty: !picked[i] });
    });
  }

  const bench = players
    .filter((p) => !used.has(p.player))
    .sort((a, b) => (a.number ?? 99) - (b.number ?? 99));

  const starters = xi.filter((p) => !p.empty);
  return { xi, starters, bench };
}

function playerInfoAttr(player) {
  if (!player?.player) return '';
  const payload = {
    player: player.player,
    number: player.number ?? null,
    position: player.position ?? null,
    club: player.club ?? null,
    heightCm: player.heightCm ?? null,
    photoUrl: player.photoUrl ?? null,
  };
  return encodeURIComponent(JSON.stringify(payload));
}

function positionLabel(pos) {
  const p = String(pos || '').toLowerCase();
  if (p.includes('goal')) return 'Goleiro';
  if (p.includes('def') || p.includes('back')) return 'Defensor';
  if (p.includes('mid')) return 'Meio-campo';
  if (p.includes('forward') || p.includes('fw')) return 'Atacante';
  return pos || '—';
}

function playerInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return (parts[0]?.[0] || '?').toUpperCase();
}

function jerseySVG(num) {
  return `<svg class="lineup-jersey" viewBox="0 0 50 58" aria-hidden="true">
    <path class="lineup-jersey__shadow" d="M11 11 L17 7 H33 L39 11 L43 17 V51 H7 V17 Z"/>
    <path class="lineup-jersey__body" d="M10 10 L16 6 H34 L40 10 L44 16 L44 20 L40 22 L40 50 H10 V22 L6 20 L6 16 Z"/>
    <path class="lineup-jersey__sleeve lineup-jersey__sleeve--l" d="M6 16 L1 19 L3 27 L8 25 L10 22 Z"/>
    <path class="lineup-jersey__sleeve lineup-jersey__sleeve--r" d="M44 16 L49 19 L47 27 L42 25 L40 22 Z"/>
    <path class="lineup-jersey__cuff lineup-jersey__cuff--l" d="M3 25 L8 27"/>
    <path class="lineup-jersey__cuff lineup-jersey__cuff--r" d="M47 25 L42 27"/>
    <path class="lineup-jersey__collar" d="M16 6 L25 15 L34 6"/>
    <path class="lineup-jersey__collar-inner" d="M19 7 L25 13 L31 7"/>
    <path class="lineup-jersey__stripe" d="M23 16 H27 V46 H23 Z"/>
    <path class="lineup-jersey__hem" d="M10 50 H40"/>
    <text class="lineup-jersey__num" x="25" y="38" text-anchor="middle">${num}</text>
  </svg>`;
}

function pitchShirtHTML(entry, kit) {
  if (entry.empty) {
    return `<span class="lineup-pitch-shirt lineup-pitch-shirt--empty" style="left:${entry.slot.x}%;top:${entry.slot.y}%">—</span>`;
  }

  const isGk = entry.line === 'gk';
  const colors = isGk
    ? { main: kit.gk, trim: kit.secondary, accent: kit.secondary }
    : { main: kit.primary, trim: kit.secondary, accent: kit.accent || kit.secondary };
  const num = entry.number ?? '—';

  return `<button type="button" class="lineup-pitch-shirt${isGk ? ' lineup-pitch-shirt--gk' : ''}"
    style="left:${entry.slot.x}%;top:${entry.slot.y}%;--shirt-main:${colors.main};--shirt-trim:${colors.trim};--shirt-accent:${colors.accent}"
    data-player-info="${playerInfoAttr(entry)}"
    aria-label="${num} ${entry.player}">
    ${jerseySVG(num)}
  </button>`;
}

function rosterRowHTML(player, interactive = true) {
  const attrs = interactive && player.player
    ? ` data-player-info="${playerInfoAttr(player)}"`
    : '';
  const tag = interactive ? 'button' : 'span';
  return `<li><${tag} type="button" class="lineup-roster__item"${attrs}>
    <span class="lineup-roster__num">${player.number ?? '—'}</span>
    <span class="lineup-roster__name">${shortName(player.player)}</span>
  </${tag}></li>`;
}

export function renderTeamLineupInfographic(data, teamId) {
  const team = data.teamMap[teamId];
  if (!team) return '<div class="empty">Seleção não encontrada</div>';

  const players = squadForTeam(data, teamId);
  if (!players.length) {
    return '<p class="empty lineup-board--empty">Elenco ainda não disponível para esta seleção.</p>';
  }

  const formation = formationFor(data, teamId);
  const kit = kitFor(teamId);
  const { xi, starters, bench } = pickStartingXI(players, formation);
  const coach = team.coach ? `<span class="lineup-board__meta">${team.coach}</span>` : '';

  const pitchHTML = xi.map((entry) => pitchShirtHTML(entry, kit)).join('');
  const startersHTML = starters.map((p) => rosterRowHTML(p)).join('')
    || '<li class="lineup-roster__empty">—</li>';
  const benchHTML = bench.map((p) => rosterRowHTML(p)).join('')
    || '<li class="lineup-roster__empty">—</li>';

  return `<div class="lineup-board" data-team="${teamId}">
    <div class="lineup-board__grid">
      <section class="lineup-board__col lineup-board__col--pitch">
        <div class="lineup-pitch-compact">
          <div class="lineup-pitch-compact__markings"></div>
          ${pitchHTML}
        </div>
        <div class="lineup-board__pitch-meta">
          <span class="lineup-board__formation">${formation}</span>
          ${coach}
        </div>
      </section>

      <section class="lineup-board__col lineup-board__col--starters">
        <h3 class="lineup-board__heading">Titulares</h3>
        <ul class="lineup-roster">${startersHTML}</ul>
      </section>

      <section class="lineup-board__col lineup-board__col--bench">
        <h3 class="lineup-board__heading">Reservas</h3>
        <ul class="lineup-roster lineup-roster--bench">${benchHTML}</ul>
      </section>
    </div>
    <div class="lineup-player-tip" hidden aria-hidden="true"></div>
  </div>`;
}

function tipHTML(info) {
  const initials = playerInitials(info.player);
  const photo = info.photoUrl
    ? `<img class="lineup-player-tip__photo" src="${info.photoUrl}" alt="" referrerpolicy="no-referrer" decoding="async" data-initials="${initials}" />`
    : `<span class="lineup-player-tip__photo lineup-player-tip__photo--empty">${initials}</span>`;
  const club = info.club ? `<span class="lineup-player-tip__club">${info.club}</span>` : '';
  const height = info.heightCm ? `<span class="lineup-player-tip__meta">${info.heightCm} cm</span>` : '';

  return `${photo}
    <div class="lineup-player-tip__body">
      <strong class="lineup-player-tip__name">${info.player}</strong>
      <span class="lineup-player-tip__role">${info.number ?? '—'} · ${positionLabel(info.position)}</span>
      ${club}
      ${height}
    </div>`;
}

function readPlayerInfo(el) {
  try {
    return JSON.parse(decodeURIComponent(el.dataset.playerInfo || ''));
  } catch {
    return null;
  }
}

export function bindLineupPlayerTooltips(root = document) {
  const board = root.querySelector('.lineup-board');
  if (!board) return;

  const tip = board.querySelector('.lineup-player-tip');
  if (!tip) return;

  const hide = () => {
    tip.hidden = true;
    tip.setAttribute('aria-hidden', 'true');
  };

  const move = (e) => {
    const pad = 12;
    const rect = board.getBoundingClientRect();
    let x = e.clientX - rect.left + pad;
    let y = e.clientY - rect.top + pad;
    const maxX = rect.width - tip.offsetWidth - pad;
    const maxY = rect.height - tip.offsetHeight - pad;
    x = Math.max(pad, Math.min(x, maxX));
    y = Math.max(pad, Math.min(y, maxY));
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  };

  const show = (el, e) => {
    const info = readPlayerInfo(el);
    if (!info?.player) return;
    tip.innerHTML = tipHTML(info);
    const img = tip.querySelector('.lineup-player-tip__photo');
    if (img?.tagName === 'IMG') {
      img.addEventListener('error', () => {
        const span = document.createElement('span');
        span.className = 'lineup-player-tip__photo lineup-player-tip__photo--empty';
        span.textContent = img.dataset.initials || playerInitials(info.player);
        img.replaceWith(span);
      }, { once: true });
    }
    tip.hidden = false;
    tip.setAttribute('aria-hidden', 'false');
    move(e);
  };

  board.querySelectorAll('[data-player-info]').forEach((el) => {
    el.addEventListener('mouseenter', (e) => show(el, e));
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseleave', hide);
    el.addEventListener('focus', (e) => show(el, e));
    el.addEventListener('blur', hide);
  });
}

export function teamSquadPlayers(data, teamId) {
  return squadForTeam(data, teamId);
}
