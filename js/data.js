const TOURNAMENT = {
  name: 'Copa do Mundo FIFA 2026',
  hosts: ['Canadá', 'México', 'Estados Unidos'],
  start: '2026-06-11',
  end: '2026-07-19',
};

const TEAMS = {
  MEX: { name: 'México', flag: 'mx', group: 'A' },
  RSA: { name: 'África do Sul', flag: 'za', group: 'A' },
  KOR: { name: 'Coreia do Sul', flag: 'kr', group: 'A' },
  CZE: { name: 'Tchéquia', flag: 'cz', group: 'A' },
  CAN: { name: 'Canadá', flag: 'ca', group: 'B' },
  BIH: { name: 'Bósnia e Herzegovina', flag: 'ba', group: 'B' },
  QAT: { name: 'Catar', flag: 'qa', group: 'B' },
  SUI: { name: 'Suíça', flag: 'ch', group: 'B' },
  BRA: { name: 'Brasil', flag: 'br', group: 'C' },
  MAR: { name: 'Marrocos', flag: 'ma', group: 'C' },
  HAI: { name: 'Haiti', flag: 'ht', group: 'C' },
  SCO: { name: 'Escócia', flag: 'gb-sct', group: 'C' },
  USA: { name: 'Estados Unidos', flag: 'us', group: 'D' },
  PAR: { name: 'Paraguai', flag: 'py', group: 'D' },
  AUS: { name: 'Austrália', flag: 'au', group: 'D' },
  TUR: { name: 'Turquia', flag: 'tr', group: 'D' },
  GER: { name: 'Alemanha', flag: 'de', group: 'E' },
  CUW: { name: 'Curaçao', flag: 'cw', group: 'E' },
  CIV: { name: 'Costa do Marfim', flag: 'ci', group: 'E' },
  ECU: { name: 'Equador', flag: 'ec', group: 'E' },
  NED: { name: 'Holanda', flag: 'nl', group: 'F' },
  JPN: { name: 'Japão', flag: 'jp', group: 'F' },
  SWE: { name: 'Suécia', flag: 'se', group: 'F' },
  TUN: { name: 'Tunísia', flag: 'tn', group: 'F' },
  BEL: { name: 'Bélgica', flag: 'be', group: 'G' },
  EGY: { name: 'Egito', flag: 'eg', group: 'G' },
  IRN: { name: 'Irã', flag: 'ir', group: 'G' },
  NZL: { name: 'Nova Zelândia', flag: 'nz', group: 'G' },
  ESP: { name: 'Espanha', flag: 'es', group: 'H' },
  CPV: { name: 'Cabo Verde', flag: 'cv', group: 'H' },
  KSA: { name: 'Arábia Saudita', flag: 'sa', group: 'H' },
  URU: { name: 'Uruguai', flag: 'uy', group: 'H' },
  FRA: { name: 'França', flag: 'fr', group: 'I' },
  SEN: { name: 'Senegal', flag: 'sn', group: 'I' },
  IRQ: { name: 'Iraque', flag: 'iq', group: 'I' },
  NOR: { name: 'Noruega', flag: 'no', group: 'I' },
  ARG: { name: 'Argentina', flag: 'ar', group: 'J' },
  ALG: { name: 'Argélia', flag: 'dz', group: 'J' },
  AUT: { name: 'Áustria', flag: 'at', group: 'J' },
  JOR: { name: 'Jordânia', flag: 'jo', group: 'J' },
  POR: { name: 'Portugal', flag: 'pt', group: 'K' },
  COD: { name: 'RD Congo', flag: 'cd', group: 'K' },
  UZB: { name: 'Uzbequistão', flag: 'uz', group: 'K' },
  COL: { name: 'Colômbia', flag: 'co', group: 'K' },
  ENG: { name: 'Inglaterra', flag: 'gb-eng', group: 'L' },
  CRO: { name: 'Croácia', flag: 'hr', group: 'L' },
  GHA: { name: 'Gana', flag: 'gh', group: 'L' },
  PAN: { name: 'Panamá', flag: 'pa', group: 'L' },
};

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

function buildGroupMatches() {
  const roundRobin = [
    [0, 1], [2, 3],
    [0, 2], [1, 3],
    [0, 3], [1, 2],
  ];
  const dates = {
    A: ['2026-06-11', '2026-06-12', '2026-06-18', '2026-06-18', '2026-06-24', '2026-06-24'],
    B: ['2026-06-12', '2026-06-13', '2026-06-18', '2026-06-19', '2026-06-24', '2026-06-25'],
    C: ['2026-06-13', '2026-06-13', '2026-06-19', '2026-06-19', '2026-06-25', '2026-06-25'],
    D: ['2026-06-12', '2026-06-13', '2026-06-19', '2026-06-20', '2026-06-25', '2026-06-25'],
    E: ['2026-06-13', '2026-06-14', '2026-06-20', '2026-06-20', '2026-06-26', '2026-06-26'],
    F: ['2026-06-14', '2026-06-14', '2026-06-20', '2026-06-21', '2026-06-26', '2026-06-26'],
    G: ['2026-06-14', '2026-06-15', '2026-06-21', '2026-06-21', '2026-06-27', '2026-06-27'],
    H: ['2026-06-15', '2026-06-15', '2026-06-21', '2026-06-22', '2026-06-27', '2026-06-27'],
    I: ['2026-06-15', '2026-06-16', '2026-06-22', '2026-06-22', '2026-06-27', '2026-06-27'],
    J: ['2026-06-16', '2026-06-16', '2026-06-22', '2026-06-23', '2026-06-27', '2026-06-27'],
    K: ['2026-06-16', '2026-06-17', '2026-06-23', '2026-06-23', '2026-06-27', '2026-06-27'],
    L: ['2026-06-17', '2026-06-17', '2026-06-23', '2026-06-24', '2026-06-27', '2026-06-27'],
  };
  const times = ['19:00', '15:00', '21:00', '18:00', '21:00', '21:00'];
  const matches = [];
  let id = 1;

  GROUPS.forEach((group) => {
    const teams = Object.entries(TEAMS)
      .filter(([, t]) => t.group === group)
      .map(([code]) => code);

    roundRobin.forEach((pair, i) => {
      matches.push({
        id: `G${group}-${id++}`,
        phase: 'group',
        group,
        date: dates[group][i],
        time: times[i % times.length],
        home: teams[pair[0]],
        away: teams[pair[1]],
        venue: `Sede Grupo ${group}`,
        homeScore: null,
        awayScore: null,
      });
    });
  });

  return matches;
}

const KNOCKOUT_TEMPLATE = [
  { id: 'R32-1', phase: 'r32', date: '2026-06-28', time: '17:00', label: '2º A vs 2º B', home: null, away: null, venue: 'Los Angeles' },
  { id: 'R32-2', phase: 'r32', date: '2026-06-28', time: '20:30', label: '1º E vs 3º A/B/C/D/F', home: null, away: null, venue: 'Houston' },
  { id: 'R32-3', phase: 'r32', date: '2026-06-29', time: '17:00', label: '1º F vs 2º C', home: null, away: null, venue: 'Boston' },
  { id: 'R32-4', phase: 'r32', date: '2026-06-29', time: '20:30', label: '1º C vs 2º F', home: null, away: null, venue: 'Nova York' },
  { id: 'R32-5', phase: 'r32', date: '2026-06-30', time: '17:00', label: '1º I vs 3º C/D/F/G/H', home: null, away: null, venue: 'Dallas' },
  { id: 'R32-6', phase: 'r32', date: '2026-06-30', time: '20:30', label: '2º E vs 2º I', home: null, away: null, venue: 'Miami' },
  { id: 'R32-7', phase: 'r32', date: '2026-07-01', time: '17:00', label: '1º A vs 3º C/E/F/H/I', home: null, away: null, venue: 'Cidade do México' },
  { id: 'R32-8', phase: 'r32', date: '2026-07-01', time: '20:30', label: '1º L vs 3º E/H/I/J/K', home: null, away: null, venue: 'Atlanta' },
  { id: 'R32-9', phase: 'r32', date: '2026-07-02', time: '17:00', label: '1º D vs 3º B/E/F/I/J', home: null, away: null, venue: 'San Francisco' },
  { id: 'R32-10', phase: 'r32', date: '2026-07-02', time: '20:30', label: '1º G vs 3º A/E/H/I/J', home: null, away: null, venue: 'Seattle' },
  { id: 'R32-11', phase: 'r32', date: '2026-07-03', time: '17:00', label: '2º K vs 2º L', home: null, away: null, venue: 'Toronto' },
  { id: 'R32-12', phase: 'r32', date: '2026-07-03', time: '20:30', label: '1º H vs 2º J', home: null, away: null, venue: 'Los Angeles' },
  { id: 'R32-13', phase: 'r32', date: '2026-07-04', time: '17:00', label: '1º B vs 3º E/F/G/I/J', home: null, away: null, venue: 'Vancouver' },
  { id: 'R32-14', phase: 'r32', date: '2026-07-04', time: '20:30', label: '2º D vs 2º G', home: null, away: null, venue: 'Dallas' },
  { id: 'R32-15', phase: 'r32', date: '2026-07-05', time: '17:00', label: '1º J vs 2º H', home: null, away: null, venue: 'Miami' },
  { id: 'R32-16', phase: 'r32', date: '2026-07-05', time: '20:30', label: '1º K vs 3º D/E/I/J/L', home: null, away: null, venue: 'Kansas City' },
  { id: 'R16-1', phase: 'r16', date: '2026-07-06', time: '17:00', label: 'Vencedor R32-1 vs Vencedor R32-3', home: null, away: null, venue: 'Philadelphia' },
  { id: 'R16-2', phase: 'r16', date: '2026-07-06', time: '20:30', label: 'Vencedor R32-2 vs Vencedor R32-4', home: null, away: null, venue: 'Houston' },
  { id: 'R16-3', phase: 'r16', date: '2026-07-07', time: '17:00', label: 'Vencedor R32-5 vs Vencedor R32-7', home: null, away: null, venue: 'Nova York' },
  { id: 'R16-4', phase: 'r16', date: '2026-07-07', time: '20:30', label: 'Vencedor R32-6 vs Vencedor R32-8', home: null, away: null, venue: 'Mexico City' },
  { id: 'R16-5', phase: 'r16', date: '2026-07-08', time: '17:00', label: 'Vencedor R32-9 vs Vencedor R32-11', home: null, away: null, venue: 'Dallas' },
  { id: 'R16-6', phase: 'r16', date: '2026-07-08', time: '20:30', label: 'Vencedor R32-10 vs Vencedor R32-12', home: null, away: null, venue: 'Seattle' },
  { id: 'R16-7', phase: 'r16', date: '2026-07-09', time: '17:00', label: 'Vencedor R32-13 vs Vencedor R32-15', home: null, away: null, venue: 'Atlanta' },
  { id: 'R16-8', phase: 'r16', date: '2026-07-09', time: '20:30', label: 'Vencedor R32-14 vs Vencedor R32-16', home: null, away: null, venue: 'Boston' },
  { id: 'QF-1', phase: 'qf', date: '2026-07-10', time: '17:00', label: 'Vencedor R16-1 vs Vencedor R16-2', home: null, away: null, venue: 'Boston' },
  { id: 'QF-2', phase: 'qf', date: '2026-07-10', time: '20:30', label: 'Vencedor R16-3 vs Vencedor R16-4', home: null, away: null, venue: 'Los Angeles' },
  { id: 'QF-3', phase: 'qf', date: '2026-07-11', time: '17:00', label: 'Vencedor R16-5 vs Vencedor R16-6', home: null, away: null, venue: 'Miami' },
  { id: 'QF-4', phase: 'qf', date: '2026-07-11', time: '20:30', label: 'Vencedor R16-7 vs Vencedor R16-8', home: null, away: null, venue: 'Kansas City' },
  { id: 'SF-1', phase: 'sf', date: '2026-07-14', time: '20:00', label: 'Vencedor QF-1 vs Vencedor QF-2', home: null, away: null, venue: 'Dallas' },
  { id: 'SF-2', phase: 'sf', date: '2026-07-15', time: '20:00', label: 'Vencedor QF-3 vs Vencedor QF-4', home: null, away: null, venue: 'Atlanta' },
  { id: 'BRONZE', phase: 'bronze', date: '2026-07-18', time: '17:00', label: '3º lugar', home: null, away: null, venue: 'Miami' },
  { id: 'FINAL', phase: 'final', date: '2026-07-19', time: '15:00', label: 'Final', home: null, away: null, venue: 'Nova York/Nova Jersey' },
].map((m) => ({ ...m, homeScore: null, awayScore: null, group: null }));

const INITIAL_MATCHES = [...buildGroupMatches(), ...KNOCKOUT_TEMPLATE];

const PHASE_LABELS = {
  group: 'Fase de grupos',
  r32: 'Oitavas de final (32)',
  r16: 'Oitavas de final (16)',
  qf: 'Quartas de final',
  sf: 'Semifinais',
  bronze: 'Disputa de 3º lugar',
  final: 'Final',
};
