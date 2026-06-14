/**
 * Mapeia nomes TheSportsDB → códigos internos (teams.id).
 */
const TSDB_ALIASES = {
  mexico: 'MEX',
  'south africa': 'RSA',
  'south korea': 'KOR',
  korea: 'KOR',
  'czech republic': 'CZE',
  czechia: 'CZE',
  canada: 'CAN',
  'bosniaherzegovina': 'BIH',
  'bosnia herzegovina': 'BIH',
  'bosnia and herzegovina': 'BIH',
  qatar: 'QAT',
  switzerland: 'SUI',
  brazil: 'BRA',
  morocco: 'MAR',
  haiti: 'HAI',
  scotland: 'SCO',
  usa: 'USA',
  'united states': 'USA',
  paraguay: 'PAR',
  australia: 'AUS',
  turkey: 'TUR',
  germany: 'GER',
  curacao: 'CUW',
  curaao: 'CUW',
  'ivory coast': 'CIV',
  'cote divoire': 'CIV',
  ecuador: 'ECU',
  netherlands: 'NED',
  holland: 'NED',
  japan: 'JPN',
  sweden: 'SWE',
  tunisia: 'TUN',
  belgium: 'BEL',
  egypt: 'EGY',
  iran: 'IRN',
  'new zealand': 'NZL',
  spain: 'ESP',
  'cape verde': 'CPV',
  'saudi arabia': 'KSA',
  uruguay: 'URU',
  france: 'FRA',
  senegal: 'SEN',
  iraq: 'IRQ',
  norway: 'NOR',
  argentina: 'ARG',
  algeria: 'ALG',
  austria: 'AUT',
  jordan: 'JOR',
  portugal: 'POR',
  'dr congo': 'COD',
  'congo dr': 'COD',
  'democratic republic of the congo': 'COD',
  uzbekistan: 'UZB',
  colombia: 'COL',
  england: 'ENG',
  croatia: 'CRO',
  ghana: 'GHA',
  panama: 'PAN',
};

export function normalizeTeamName(name) {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function teamIdFromSportsDb(strTeam) {
  const key = normalizeTeamName(strTeam);
  if (TSDB_ALIASES[key]) return TSDB_ALIASES[key];
  const compact = key.replace(/\s/g, '');
  if (TSDB_ALIASES[compact]) return TSDB_ALIASES[compact];
  return null;
}
