/**
 * Testes de placar no mata-mata com prorrogação e pênaltis.
 */
import {
  validateKnockoutFinish,
  resolveWinnerTeam,
  parsePenaltiesFromText,
  mapResultDetail,
} from '../backend/src/match-score.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(validateKnockoutFinish('r16', { homeScore: 2, awayScore: 1 }) === null, 'vitória no tempo');
assert(validateKnockoutFinish('r16', { homeScore: 1, awayScore: 1, homePenalties: 4, awayPenalties: 3 }) === null, 'empate + pen válido');
assert(
  validateKnockoutFinish('r16', { homeScore: 1, awayScore: 1 }) !== null,
  'empate sem pen deve falhar ao encerrar',
);

assert(
  resolveWinnerTeam({
    home: 'BRA', away: 'ARG', homeScore: 1, awayScore: 1, homePenalties: 5, awayPenalties: 4,
  }) === 'BRA',
  'vencedor por pênaltis',
);

assert(
  parsePenaltiesFromText('Argentina win 4-3 on penalties')?.homePenalties === 4,
  'parse pen do texto',
);

assert(mapResultDetail('PEN') === 'pen', 'status PEN');
assert(mapResultDetail('AET') === 'aet', 'status AET');

console.log('test-knockout-penalties: OK');
