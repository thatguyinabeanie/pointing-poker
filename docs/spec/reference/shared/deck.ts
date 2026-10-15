export const DECK = ["0", "1", "2", "3", "5", "8", "13", "21", "?", "☕"] as const;

// Only these cards count toward average/min/max and can be saved to Jira.
export function isNumericCard(card: string): boolean {
  return (DECK as readonly string[]).includes(card) && /^\d+$/.test(card);
}
