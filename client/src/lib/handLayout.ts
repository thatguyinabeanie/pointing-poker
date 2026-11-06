// Geometry for the hand of cards (spec section 2). No imports, so it can be checked straight from
// `node -e` without the client build.

// At rest: a tight fan. Per step from the middle: px sideways, degrees of tilt, px drop per step
// squared, so the cards sit on a shallow arc.
//
// dx is set by the corner index (11px bold, 4px inset, line-height 1), which must show in the strip
// each card leaves uncovered by the next. With dx 19 the gap between neighboring top-left corners,
// after the tilt, is 20.6 to 21.6px. The next card's extra 4° of tilt narrows the strip lower
// down, so across the value's ink (5.9 to 13.9px below the top) it is at least 20.3px. The widest
// value, "0.5" in Lato Bold, inks 14.8px wide, so it ends 18.8px in and clears the next card's
// border by 1.7px. The old 11 left about 12px, which hid every value but your raised card's and ☕.
// 14 left 15.3px and still cut "0.5", "13" and "21"; 18 clears "0.5" by only 0.7px.
export const REST = { dx: 19, rot: 4, dy: 0.4 } as const;
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

// Half the width of the resting fan: the end card's center plus its tilted half-width, reached at
// its outer top corner, which is inside the peek. The hand's root is this wide because Layout's
// window clamp keeps the root's box 16px inside the window and the closed hover zone is the root
// plus 20px a side: a narrower root would let the end cards run past the edge and out of the zone.
export function restHalfWidth(cards: number): number {
  const end = cardPose((cards - 1) / 2, false, 0);
  const tilt = (end.rotate * Math.PI) / 180;
  return end.x + (CARD_WIDTH / 2) * Math.cos(tilt) + (CARD_HEIGHT / 2) * Math.sin(tilt);
}

// How far the open arc rises: the end cards' drop plus 20px, so 0 and ☕ land just above the
// bottom edge instead of being cut off.
export function openLift(cards: number, step: number): number {
  return 20 + cardPose((cards - 1) / 2, true, step).y;
}
