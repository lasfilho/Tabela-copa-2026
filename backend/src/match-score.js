/**
 * Regras de placar no mata-mata (90'+prorrogação + pênaltis).
 */

export function isKnockoutPhase(phase) {
  return Boolean(phase && phase !== 'group');
}

export function mapResultDetail(apiStatus) {
  const code = String(apiStatus || '').trim().toUpperCase();
  if (code === 'PEN' || code.includes('PENALTY')) return 'pen';
  if (code === 'AET' || code.includes('EXTRA')) return 'aet';
  return 'ft';
}

export function parsePenaltiesFromText(text) {
  if (!text) return null;
  const m = String(text).match(/(?:pen|pens|pênalt|penalt)[^\d]*(\d+)\s*[-–:]\s*(\d+)/i)
    || String(text).match(/\((\d+)\s*[-–]\s*(\d+)\s*(?:pen|pens|pênalt)/i)
    || String(text).match(/(\d+)\s*[-–]\s*(\d+)\s+on\s+pen/i);
  if (!m) return null;
  const homePen = Number(m[1]);
  const awayPen = Number(m[2]);
  if (!Number.isFinite(homePen) || !Number.isFinite(awayPen) || homePen < 0 || awayPen < 0) return null;
  return { homePenalties: homePen, awayPenalties: awayPen };
}

export function parsePenaltiesFromEvent(ev) {
  const hp = Number(ev?.intHomePenaltyScore);
  const ap = Number(ev?.intAwayPenaltyScore);
  if (Number.isFinite(hp) && Number.isFinite(ap) && hp >= 0 && ap >= 0) {
    return { homePenalties: hp, awayPenalties: ap };
  }
  const text = [ev?.strResult, ev?.strDescription, ev?.strEvent].filter(Boolean).join(' ');
  return parsePenaltiesFromText(text);
}

export function resolveWinnerTeam({ home, away, homeScore, awayScore, homePenalties, awayPenalties }) {
  if (homePenalties != null && awayPenalties != null) {
    if (homePenalties > awayPenalties) return home;
    if (awayPenalties > homePenalties) return away;
  }
  if (homeScore > awayScore) return home;
  if (awayScore > homeScore) return away;
  return null;
}

export function validateKnockoutFinish(phase, { homeScore, awayScore, homePenalties, awayPenalties }) {
  if (!isKnockoutPhase(phase)) return null;
  if (homeScore !== awayScore) return null;
  if (homePenalties != null && awayPenalties != null && homePenalties !== awayPenalties) return null;
  return 'No mata-mata, empate no tempo regulamentar/prorrogação exige placar dos pênaltis com vencedor';
}
