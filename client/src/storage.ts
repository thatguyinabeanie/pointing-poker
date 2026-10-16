// Web Storage holds per-viewer conveniences only (collapsed sections, search text, points pick),
// so every failure is ignored and the in-memory state still works. Storage throws in private
// windows, when site data is blocked, and when it is full. Even reading `window.sessionStorage`
// can throw, which is why callers pass a name and the Storage object is fetched inside the try.
export type StoreName = "local" | "session";

function getStore(name: StoreName): Storage {
  return name === "local" ? window.localStorage : window.sessionStorage;
}

// Stored values come from an earlier build or another script, so callers validate the shape.
export function readJson<T>(
  name: StoreName,
  key: string,
  validate: (value: unknown) => T | null,
): T | null {
  try {
    const raw = getStore(name).getItem(key);
    return raw === null ? null : validate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeJson(name: StoreName, key: string, value: unknown): void {
  try {
    getStore(name).setItem(key, JSON.stringify(value));
  } catch {
    // Ignored: see the note at the top of the file.
  }
}

export function removeItem(name: StoreName, key: string): void {
  try {
    getStore(name).removeItem(key);
  } catch {
    // Ignored: see the note at the top of the file.
  }
}
