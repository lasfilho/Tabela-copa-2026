/**
 * Chaveamento visual — alinhado ao bracket fixo FIFA (M73–M104).
 * Metade esquerda (SF-1): QF-1 + QF-2. Metade direita (SF-2): QF-3 + QF-4.
 * 1º Grupo C (R32-4) → lado direito. 2º Grupo C (R32-3) → lado esquerdo.
 */
import { flagUrl } from './data-service.js';
import { getWinner } from './engine.js';
import { formatMatchScore, isKnockoutPhase, knockoutExtraFieldsHTML } from './match-score.js';
import { teamFullName, teamShortName } from './team-names.js';

/** SF-1 — semifinal Dallas (M101): vencedores M97 e M98 */
const LEFT_TREE = {
  id: 'SF-1',
  left: {
    id: 'QF-1',
    left: {
      id: 'R16-1',
      left: { id: 'R32-2', leaf: true },
      right: { id: 'R32-5', leaf: true },
    },
    right: {
      id: 'R16-2',
      left: { id: 'R32-1', leaf: true },
      right: { id: 'R32-3', leaf: true },
    },
  },
  right: {
    id: 'QF-2',
    left: {
      id: 'R16-5',
      left: { id: 'R32-11', leaf: true },
      right: { id: 'R32-12', leaf: true },
    },
    right: {
      id: 'R16-6',
      left: { id: 'R32-9', leaf: true },
      right: { id: 'R32-10', leaf: true },
    },
  },
};

/** SF-2 — semifinal Atlanta (M102): vencedores M99 e M100 */
const RIGHT_TREE = {
  id: 'SF-2',
  left: {
    id: 'QF-3',
    left: {
      id: 'R16-3',
      left: { id: 'R32-4', leaf: true },
      right: { id: 'R32-6', leaf: true },
    },
    right: {
      id: 'R16-4',
      left: { id: 'R32-7', leaf: true },
      right: { id: 'R32-8', leaf: true },
    },
  },
  right: {
    id: 'QF-4',
    left: {
      id: 'R16-7',
      left: { id: 'R32-15', leaf: true },
      right: { id: 'R32-14', leaf: true },
    },
    right: {
      id: 'R16-8',
      left: { id: 'R32-13', leaf: true },
      right: { id: 'R32-16', leaf: true },
    },
  },
};

function bracketTeamName(data, id) {
  return teamShortName(data, id);
}

function matchMap(data) {
  return Object.fromEntries(data.matches.map((m) => [m.id, m]));
}

function bracketScoreCell(match, side, canEdit) {
  const val = side === 'home' ? match.homeScore : match.awayScore;
  if (canEdit) {
    return `<input type="number" min="0" max="20" inputmode="numeric" data-side="${side}" value="${val ?? ''}" aria-label="Placar" class="bracket-slot__input" />`;
  }
  return `<span class="bracket-slot__val">${val != null ? val : '–'}</span>`;
}

function renderTeamBox(data, code, winner, align, projected = false) {
  const won = code && winner === code;
  const tbd = !code;

  if (tbd) {
    return `<div class="bracket-slot__team bracket-slot__team--tbd" title="Aguardando classificação">
      <span class="bracket-slot__placeholder">—</span>
    </div>`;
  }

  const prov = projected ? 'Provisório (classificação atual) — ' : '';
  return `<div class="bracket-slot__team ${won ? 'bracket-slot__team--winner' : ''}${projected ? ' bracket-slot__team--projected' : ''}" title="${prov}${teamFullName(data, code)}">
    <img class="bracket-slot__flag" src="${flagUrl(data.teamMap[code])}" alt="" width="22" height="15" />
    <span class="bracket-slot__name">${bracketTeamName(data, code)}</span>
  </div>`;
}

function renderSlot(data, match, side, winner, align, canEdit, projected = false) {
  const code = side === 'home' ? match.home : match.away;
  const won = code && winner === code;
  const scoreFirst = align !== 'right';
  const scoreHtml = `<div class="bracket-slot__score">${bracketScoreCell(match, side, canEdit)}</div>`;
  const teamHtml = renderTeamBox(data, code, winner, align, projected && !!code);

  return `<div class="bracket-slot${won ? ' bracket-slot--winner' : ''}">
    ${scoreFirst ? scoreHtml + teamHtml : teamHtml + scoreHtml}
  </div>`;
}

function renderBracketFixture(data, match, helpers, align = 'left') {
  if (!match) {
    return '<div class="bracket-fixture bracket-fixture--empty">—</div>';
  }

  const { canEditScores, autoSaveScores } = helpers;
  const winner = getWinner(match);
  const alignClass = align === 'right' ? 'bracket-fixture--right' : align === 'center' ? 'bracket-fixture--center' : 'bracket-fixture--left';
  const liveClass = match.status === 'live' ? 'bracket-fixture--live' : '';
  const finishedClass = match.status === 'finished' ? 'bracket-fixture--finished' : '';
  const projectedClass = match.bracketProjected ? 'bracket-fixture--projected' : '';

  const editorOpen = canEditScores
    ? `<div class="score-editor score-editor--bracket${autoSaveScores ? ' score-editor--autosave' : ''}" data-match-id="${match.id}" data-phase="${match.phase || ''}">`
    : '<div class="bracket-fixture__body">';
  const editorClose = canEditScores && !autoSaveScores
    ? `<button type="button" class="visually-hidden" data-save-score="${match.id}">Salvar</button></div>`
    : '</div>';
  const extraReadonly = !canEditScores && match.status === 'finished'
    && (match.homePenalties != null || match.resultDetail === 'aet' || match.resultDetail === 'pen')
    ? `<div class="bracket-fixture__pen">${formatMatchScore(match)}</div>`
    : '';
  const penEditor = canEditScores && isKnockoutPhase(match.phase)
    ? knockoutExtraFieldsHTML(match)
    : '';

  return `<div class="bracket-fixture ${alignClass} ${liveClass} ${finishedClass} ${projectedClass}" data-match="${match.id}" title="${match.label || match.id}">
    ${editorOpen}
      ${renderSlot(data, match, 'home', winner, align, canEditScores, match.bracketProjected)}
      ${renderSlot(data, match, 'away', winner, align, canEditScores, match.bracketProjected)}
      ${penEditor}
    ${editorClose}
    ${extraReadonly}
  </div>`;
}

function renderSubtree(node, data, byId, helpers, align) {
  if (node.leaf) {
    return `<div class="bracket-leaf">${renderBracketFixture(data, byId[node.id], helpers, align)}</div>`;
  }

  const match = byId[node.id];
  return `<div class="bracket-subtree">
    <div class="bracket-subtree__fork">
      ${renderSubtree(node.left, data, byId, helpers, align)}
      ${renderSubtree(node.right, data, byId, helpers, align)}
    </div>
    <div class="bracket-subtree__join">
      ${renderBracketFixture(data, match, helpers, align)}
    </div>
  </div>`;
}

export function renderKnockoutBracket(data, helpers, { projected = false } = {}) {
  const byId = matchMap(data);
  const intro = projected
    ? 'Chaveamento com base na <strong>classificação atual</strong> dos grupos — cruzamentos provisórios, atualizados a cada rodada.'
    : 'Chaveamento eliminatório · classificação da fase de grupos confirmada.';

  return `
    <p class="bracket-intro">${intro}</p>
    ${projected ? '<p class="bracket-intro bracket-intro--note">Jogos em itálico podem mudar conforme os resultados da 3ª rodada. Líder do Grupo C fica no <strong>lado direito</strong> da chave (como no simulador ge).</p>' : ''}
    <div class="bracket-championship">
      <div class="bracket-side bracket-side--left">
        ${renderSubtree(LEFT_TREE, data, byId, helpers, 'left')}
      </div>

      <div class="bracket-hub">
        <div class="bracket-trophy" aria-hidden="true">🏆</div>
        <div class="bracket-hub__block bracket-hub__block--final">
          <span class="bracket-hub__title">Final</span>
          ${renderBracketFixture(data, byId.FINAL, helpers, 'center')}
        </div>
        <div class="bracket-hub__block bracket-hub__block--bronze">
          <span class="bracket-hub__title">3º lugar</span>
          ${renderBracketFixture(data, byId.BRONZE, helpers, 'center')}
        </div>
      </div>

      <div class="bracket-side bracket-side--right">
        ${renderSubtree(RIGHT_TREE, data, byId, helpers, 'right')}
      </div>
    </div>
    <p class="bracket-hint">${helpers.autoSaveScores ? 'Placar salvo automaticamente ao editar' : helpers.canEditScores ? 'Digite o placar e pressione Enter para salvar' : 'Modo somente leitura'}</p>`;
}
