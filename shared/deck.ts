// Fibonacci-ish deck. "?" means unsure and "☕" means needs a break; neither counts toward stats.
export const DECK = ["0", "1", "2", "3", "5", "8", "13", "21", "?", "☕"] as const;

export function isNumericCard(card: string): boolean {
  return card !== "" && Number.isFinite(Number(card));
}
