// Fibonacci-ish deck with a half-point card. "?" means unsure and "☕" means needs a break;
// neither counts toward stats.
export const DECK = ["0", "0.5", "1", "2", "3", "5", "8", "13", "21", "?", "☕"] as const;

// Only these cards count toward average/min/max and can be saved to Jira. The regex allows a
// decimal part because "0.5" is a card; the DECK check still rejects anything else.
export function isNumericCard(card: string): boolean {
  return (DECK as readonly string[]).includes(card) && /^\d+(\.\d+)?$/.test(card);
}
