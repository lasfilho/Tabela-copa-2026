/**
 * Correções pontuais quando openfootball/TheSportsDB divergem do placar oficial FIFA.
 * Aplicado após merge das fontes, antes de gravar no banco.
 */
export function applyGoalCorrections(matchId, goals, homeId, awayId) {
  if (matchId === 'GI-2' && homeId === 'NOR' && awayId === 'IRQ') {
    return goals.map((g) => {
      if (
        g.isOwnGoal
        && g.player === 'Aymen Hussein'
        && g.minute != null
        && g.minute >= 90
      ) {
        // Cabeceio de Haaland desviado para o gol — creditado ao artilheiro (FIFA/relatos).
        return {
          ...g,
          externalId: `${matchId}-c906`,
          player: 'Erling Haaland',
          teamId: 'NOR',
          isOwnGoal: false,
          countsForScorer: true,
          detail: 'Gol de cabeça',
          source: 'corrected',
        };
      }
      return g;
    });
  }
  return goals;
}
