import { isNumericCard } from "../../../shared/deck.ts";
import type { Snapshot } from "../../../shared/protocol.ts";

// Ties go to the higher value: when the room is split, the cautious estimate is the bigger one.
// `deck` is accepted so only cards actually in play are considered.
export function suggestPoints(stats: Snapshot["stats"], deck: readonly string[]): string | null {
  if (!stats) return null;
  let best: string | null = null;
  let bestCount = 0;
  for (const [card, count] of Object.entries(stats.counts)) {
    if (!isNumericCard(card) || !deck.includes(card) || count <= 0) continue;
    if (
      count > bestCount ||
      (count === bestCount && best !== null && Number(card) > Number(best))
    ) {
      best = card;
      bestCount = count;
    }
  }
  return best;
}
