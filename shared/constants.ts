// A Jira issue key. The project part follows the same rule as JIRA_DEFAULT_PROJECT and the
// setQueueSettings projectKey (letter first, then letters, digits or underscores), so a bare
// number typed in a project like AB2 or MY_PROJ builds a key that passes this check.
export const ISSUE_KEY = /^[A-Z][A-Z0-9_]*-\d+$/i;

// People type just the number of a ticket in the room's project ("14417" for PP-14417). Both
// loading a ticket and searching expand it here so the two boxes cannot disagree. Without a
// project the input is returned unchanged.
export function expandBareIssueNumber(input: string, projectKey: string | null): string {
  return /^\d+$/.test(input) && projectKey !== null ? `${projectKey}-${input}` : input;
}

// Shared so the client's debounce gate and the server's check cannot drift apart.
export const MIN_QUERY_LENGTH = 2;

// Order-insensitive: the Type menu sends names in click order, and the JQL `in (...)` ignores
// order, so a reordered selection is not a change. Shared so the server's change check and the
// menu's close-time dispatch agree on what counts as a change. Both lists are free of repeats.
export function sameNames(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((name) => set.has(name));
}
