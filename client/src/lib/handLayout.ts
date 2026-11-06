// Geometry for the hand of cards (spec section 2). No imports, so it can be checked straight from
// `node -e` without the client build.

// At rest: a tight fan. Per step from the middle: px sideways, degrees of tilt, px drop per step
// squared, so the cards sit on a shallow arc.
export const REST = { dx: 11, rot: 4, dy: 0.4 } as const;
// Open: the "Medium" spread the user kept in the playtest.
export const OPEN = { dx: 52, rot: 5, dy: 2.2 } as const;

export const CARD_WIDTH = 46;
export const CARD_HEIGHT = 64;

// The open step, shrunk when the full arc would not fit in the available width. The end cards'
// centers sit (cards - 1) steps apart, plus half a card on each side.
export function fitStep(available: number, cards: number): number {
  return Math.min(OPEN.dx, (available - CARD_WIDTH) / (cards - 1));
}

// `offset` is the card's index minus the middle index. The open drop is scaled by step / OPEN.dx
// so a narrowed arc keeps the same shape instead of turning into a deep U. Multiplying before the
// one division keeps the full-step result exact (55, not 55.00000000000001).
export function cardPose(
  offset: number,
  open: boolean,
  step: number,
): { x: number; y: number; rotate: number } {
  if (!open) {
    return { x: offset * REST.dx, y: offset * offset * REST.dy, rotate: offset * REST.rot };
  }
  return {
    x: offset * step,
    y: (OPEN.dy * step * offset * offset) / OPEN.dx,
    rotate: offset * OPEN.rot,
  };
}

// How far the open arc rises: the end cards' drop plus 20px, so 0 and ☕ land just above the
// bottom edge instead of being cut off.
export function openLift(cards: number, step: number): number {
  return 20 + cardPose((cards - 1) / 2, true, step).y;
}
