// Splitting on the same separators people use in usernames (`jane.doe`, `jane_doe`, `jane-doe`)
// so "jane.doe" gets "JD" instead of "JA".
export function initials(name: string): string {
  const words = name.split(/[\s._-]+/).filter((word) => word.length > 0);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
