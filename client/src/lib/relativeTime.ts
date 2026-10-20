const relative = new Intl.RelativeTimeFormat("en", { style: "narrow" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["month", 30 * 86400],
  ["week", 7 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

// Narrow style renders "2d ago"; the "ago" is dropped so the label stays short beside the author.
// Anything under a minute, or dated in the future by clock skew, reads "just now".
export function relativeTime(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(seconds)) return "";
  for (const [unit, size] of UNITS) {
    if (seconds >= size) {
      return relative.format(-Math.floor(seconds / size), unit).replace(/\s*ago$/, "");
    }
  }
  return "just now";
}
