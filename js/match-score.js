/**
 * Placar no mata-mata — exibição e leitura de prorrogação/pênaltis.
 */

export function isKnockoutPhase(phase) {
  return Boolean(phase && phase !== 'group');
}

export function formatMatchScore(match) {
  const hs = match.homeScore ?? '–';
  const as = match.awayScore ?? '–';
  let suffix = '';
  if (match.homePenalties != null && match.awayPenalties != null) {
    suffix = ` <span class="score-pen">(${match.homePenalties}×${match.awayPenalties} pen)</span>`;
  } else if (match.resultDetail === 'aet') {
    suffix = ' <span class="score-aet">prorrogação</span>';
  }
  return `${hs} × ${as}${suffix}`;
}

export function readScoreEditor(wrap) {
  const home = wrap.querySelector('[data-side="home"]')?.value ?? '';
  const away = wrap.querySelector('[data-side="away"]')?.value ?? '';
  const homePen = wrap.querySelector('[data-side="home-pen"]')?.value ?? '';
  const awayPen = wrap.querySelector('[data-side="away-pen"]')?.value ?? '';
  const resultDetail = wrap.querySelector('[data-result-detail]')?.value ?? '';
  return {
    id: wrap.dataset.matchId,
    home,
    away,
    homePenalties: homePen,
    awayPenalties: awayPen,
    resultDetail,
  };
}

export function scoreEditorKey({ home, away, homePenalties, awayPenalties, resultDetail }) {
  return [home, away, homePenalties, awayPenalties, resultDetail].join('|');
}

export function knockoutExtraFieldsHTML(match, { compact = false } = {}) {
  const hp = match.homePenalties ?? '';
  const ap = match.awayPenalties ?? '';
  const rd = match.resultDetail || 'ft';
  const extraClass = compact ? 'score-editor__extra' : 'score-editor__extra score-editor__extra--bracket';
  const ftLabel = compact ? '90 min' : '90m';
  const aetLabel = compact ? 'Prorrogação' : 'Prorr.';
  const penLabel = compact ? 'Pênaltis' : 'Pen.';
  const penInputs = compact
    ? `<span class="score-editor__pen-label">Pen:</span>
      <input type="number" min="0" max="20" inputmode="numeric" data-side="home-pen" value="${hp}" aria-label="Pênaltis mandante" placeholder="–" />
      <span class="score-editor__sep">×</span>
      <input type="number" min="0" max="20" inputmode="numeric" data-side="away-pen" value="${ap}" aria-label="Pênaltis visitante" placeholder="–" />`
    : `<input type="number" min="0" max="20" inputmode="numeric" data-side="home-pen" value="${hp}" aria-label="Pênaltis mandante" placeholder="–" class="bracket-slot__input bracket-slot__input--pen" />
      <span class="score-editor__sep">×</span>
      <input type="number" min="0" max="20" inputmode="numeric" data-side="away-pen" value="${ap}" aria-label="Pênaltis visitante" placeholder="–" class="bracket-slot__input bracket-slot__input--pen" />`;
  return `
    <div class="${extraClass}" title="Placar após 90'+prorrogação. Informe pênaltis se houver empate.">
      <select data-result-detail aria-label="Tipo de resultado">
        <option value="ft" ${rd === 'ft' ? 'selected' : ''}>${ftLabel}</option>
        <option value="aet" ${rd === 'aet' ? 'selected' : ''}>${aetLabel}</option>
        <option value="pen" ${rd === 'pen' ? 'selected' : ''}>${penLabel}</option>
      </select>
      ${penInputs}
    </div>`;
}
