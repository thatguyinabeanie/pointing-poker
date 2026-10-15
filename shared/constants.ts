// A Jira issue key. The project part follows the same rule as JIRA_DEFAULT_PROJECT and the
// setQueueSettings projectKey (letter first, then letters, digits or underscores), so a bare
// number typed in a project like AB2 or MY_PROJ builds a key that passes this check.
export const ISSUE_KEY = /^[A-Z][A-Z0-9_]*-\d+$/i;

// Shared so the client's debounce gate and the server's check cannot drift apart.
export const MIN_QUERY_LENGTH = 2;
