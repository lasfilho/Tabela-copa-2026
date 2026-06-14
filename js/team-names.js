/**
 * Nomes curtos para tabelas compactas (grupos, chaveamento).
 * Chave por código FIFA (teams.id).
 */
export const TEAM_SHORT_NAMES = {
  RSA: 'Áfr. Sul',
  KOR: 'Coreia',
  BIH: 'Bósnia',
  USA: 'EUA',
  AUS: 'Austrál.',
  CIV: 'C.Marfim',
  CPV: 'C. Verde',
  NZL: 'N.Zelând.',
  KSA: 'Arábia',
  ARG: 'Argentin.',
  UZB: 'Uzbeq.',
  ENG: 'Inglat.',
  MAR: 'Marrocos',
  PAR: 'Paraguai',
  GER: 'Alemanha',
  ECU: 'Equador',
  TUN: 'Tunísia',
  BEL: 'Bélgica',
  JOR: 'Jordânia',
  POR: 'Portugal',
  COD: 'RD Congo',
  COL: 'Colômbia',
  CRO: 'Croácia',
  AUT: 'Áustria',
  ALG: 'Argélia',
  SEN: 'Senegal',
  NOR: 'Noruega',
  URU: 'Uruguai',
  SCO: 'Escócia',
  TUR: 'Turquia',
  SWE: 'Suécia',
  NED: 'Holanda',
  ESP: 'Espanha',
  PAN: 'Panamá',
  CUW: 'Curaçao',
};

const MAX_SHORT_LEN = 8;

export function teamFullName(data, id) {
  if (!id) return 'A definir';
  return data.teamMap[id]?.name ?? id;
}

export function teamShortName(data, id) {
  if (!id) return 'A definir';
  if (TEAM_SHORT_NAMES[id]) return TEAM_SHORT_NAMES[id];
  const full = teamFullName(data, id);
  if (full.length <= MAX_SHORT_LEN) return full;
  return id;
}

export function teamShortLabelHTML(data, id) {
  const full = teamFullName(data, id);
  const short = teamShortName(data, id);
  const title = short !== full ? ` title="${full.replace(/"/g, '&quot;')}"` : '';
  return `<span class="team-name__text"${title}>${short}</span>`;
}
