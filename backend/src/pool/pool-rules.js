/**
 * Regras de pontuação do bolão — recreativo, sem premiação monetária.
 * Versão 2 — configurável via JSONB em pool_score_rules.
 */

export const DEFAULT_SCORE_RULES = {
  version: 2,
  exactScore: 10,
  correctResult: 5,
  correctWinnerGoals: 2,
  correctLoserGoals: 2,
};

export const RECREATIONAL_DISCLAIMER =
  'Bolão recreativo: este sistema não aceita apostas, pagamentos, prêmios, carteiras, taxas ou qualquer transação financeira. Combinações entre participantes são de responsabilidade exclusiva dos envolvidos, fora desta plataforma.';

export function buildScoringRulesHtml(rules = DEFAULT_SCORE_RULES) {
  const r = normalizeRules(rules);
  return `
<h3>Como funciona a pontuação</h3>
<ul>
  <li><strong>Placar exato:</strong> ${r.exactScore} pontos</li>
  <li><strong>Resultado correto</strong> (vitória/empate, placar errado): ${r.correctResult} pontos</li>
  <li><strong>Placar do vencedor correto</strong> (sem placar exato): +${r.correctWinnerGoals} pontos</li>
  <li><strong>Placar do perdedor correto</strong> (sem placar exato): +${r.correctLoserGoals} pontos</li>
  <li>Os bônus de vencedor/perdedor só valem em jogos com vitória (não se aplicam a empates)</li>
  <li><strong>Sem palpite:</strong> 0 pontos</li>
  <li><strong>Palpite fora do prazo:</strong> não permitido</li>
</ul>
<h3>Tempo regulamentar, prorrogação e pênaltis</h3>
<ul>
  <li>O palpite vale para o placar do <strong>tempo regulamentar (90 minutos)</strong>, incluindo acréscimos</li>
  <li><strong>Prorrogação:</strong> gols marcados na prorrogação <strong>não</strong> entram na comparação do palpite</li>
  <li><strong>Pênaltis:</strong> a disputa oficial usa o placar dos 90 min; se você palpitou empate e o jogo empatou no tempo regulamentar, conta como resultado correto, mesmo que a classificação tenha sido decidida nos pênaltis</li>
  <li>No mata-mata, o sistema compara palpite × resultado registrado dos 90 min — não há palpite separado para vencedor nos pênaltis</li>
</ul>
<h3>Prazos (horário de Brasília)</h3>
<ul>
  <li>Criação do bolão: até <strong>1 hora</strong> antes da primeira partida</li>
  <li>Adesão ao bolão: até <strong>10 minutos</strong> antes da primeira partida</li>
  <li>Palpites: editáveis até <strong>10 minutos</strong> antes do início de cada partida</li>
  <li>Após o apito inicial, o palpite é bloqueado automaticamente</li>
</ul>
<h3>Desempate no ranking</h3>
<ol>
  <li>Maior pontuação total</li>
  <li>Maior número de placares exatos</li>
  <li>Maior número de acertos de resultado (vitória/empate)</li>
  <li>Maior número de palpites enviados no prazo</li>
  <li>Participante que aderiu primeiro</li>
</ol>
<p><em>${RECREATIONAL_DISCLAIMER}</em></p>
`;
}

/** @deprecated use buildScoringRulesHtml() */
export const SCORING_RULES_HTML = buildScoringRulesHtml();

export function matchOutcome(home, away) {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'draw';
}

/** Palpite e resultado oficiais dos 90 min (prorrogação/pênaltis não alteram a comparação). */
export function calculatePredictionPoints(prediction, actual, rules = DEFAULT_SCORE_RULES) {
  if (!prediction || actual?.homeScore == null || actual?.awayScore == null) {
    return { points: 0, exact: false, resultHit: false };
  }

  const r = normalizeRules(rules);
  const ph = prediction.home_score ?? prediction.homeScore;
  const pa = prediction.away_score ?? prediction.awayScore;
  const ah = actual.homeScore;
  const aa = actual.awayScore;

  if (ph === ah && pa === aa) {
    return { points: r.exactScore, exact: true, resultHit: true };
  }

  let points = 0;
  const predictedOutcome = matchOutcome(ph, pa);
  const actualOutcome = matchOutcome(ah, aa);
  const resultHit = predictedOutcome === actualOutcome;
  if (resultHit) points += r.correctResult;

  // Bônus de vencedor/perdedor:
  // - só quando o resultado (vencedor) foi acertado
  // - não se aplica para empate
  if (resultHit && actualOutcome !== 'draw') {
    const predictedWinnerGoals = predictedOutcome === 'home' ? ph : pa;
    const predictedLoserGoals = predictedOutcome === 'home' ? pa : ph;
    const actualWinnerGoals = actualOutcome === 'home' ? ah : aa;
    const actualLoserGoals = actualOutcome === 'home' ? aa : ah;

    if (predictedWinnerGoals === actualWinnerGoals) points += r.correctWinnerGoals;
    if (predictedLoserGoals === actualLoserGoals) points += r.correctLoserGoals;
  }

  return { points, exact: false, resultHit };
}

export function normalizeRules(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SCORE_RULES };
  const winnerGoals = raw.correctWinnerGoals ?? raw.correctHomeGoals;
  const loserGoals = raw.correctLoserGoals ?? raw.correctAwayGoals;
  return {
    version: raw.version ?? 2,
    exactScore: Number(raw.exactScore ?? DEFAULT_SCORE_RULES.exactScore),
    correctResult: Number(raw.correctResult ?? DEFAULT_SCORE_RULES.correctResult),
    correctWinnerGoals: Number(winnerGoals ?? DEFAULT_SCORE_RULES.correctWinnerGoals),
    correctLoserGoals: Number(loserGoals ?? DEFAULT_SCORE_RULES.correctLoserGoals),
  };
}
