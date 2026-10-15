/**
 * Identity resolution for requests that arrive through the hosting platform's auth proxy.
 *
 * On every authenticated request the proxy deletes any inbound copies of the identity headers
 * (and the legacy query params, on older proxy versions) and only then sets them itself, from
 * the sealed auth cookie. Nothing a client puts on the wire survives into the values this
 * module reads, which is why headers (and, for older proxies, query params) are trustworthy
 * here and a request body is not.
 *
 * The header and query-param names are deployment config, not code: callers pass them in via
 * `ProxyIdentityConfig` (see `server/identity.ts`, which reads them from the environment).
 *
 * Deliberately a pure function of its arguments (apart from the dev-only env override below):
 * it takes a `Headers` and the request URL as plain arguments so a test can call it with a
 * constructed `Headers` and a string URL, with no server context required.
 */

export interface ProxyIdentity {
  userId: number;
  username: string;
}

export interface ProxyIdentityConfig {
  /** Header carrying the numeric user id. Unset means no header source is available. */
  userIdHeader?: string;
  /** Header carrying the username. */
  usernameHeader?: string;
  /** Legacy query param for the user id, for proxies that predate header injection. */
  userIdQuery?: string;
  /** Legacy query param for the username. */
  usernameQuery?: string;
}

/**
 * Strict positive-integer-with-no-leading-zero parse for the identity key. Rejects empty
 * strings, "NaN", floats, negatives, and anything with stray characters or whitespace, so a
 * malformed header can only ever produce `null` and never `NaN` or a coerced junk value.
 */
function parsePositiveInt(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Both values are required for a source to count as a real identity. */
function buildIdentity(
  userIdRaw: string | null | undefined,
  usernameRaw: string | null | undefined,
): ProxyIdentity | null {
  const userId = parsePositiveInt(userIdRaw);
  if (userId === null) return null;

  const username = usernameRaw?.trim() ?? "";
  if (username === "") return null;

  return { userId, username };
}

/**
 * Resolve the acting user's identity from an incoming request.
 *
 * Resolution order: the first source whose user-id key is present wins. A present-but-malformed
 * value fails closed (returns `null`) rather than falling through to a less trustworthy source:
 *
 *   1. Headers set by the auth proxy (names from `config`).
 *   2. Legacy query params (names from `config`).
 *   3. Development-only env var override (`DEV_USER_ID` / `DEV_USERNAME`). Inert whenever
 *      `process.env.NODE_ENV === "production"`: this is the one way a deployed instance could
 *      otherwise be tricked into a fake identity, so it must never run in production regardless
 *      of what's in the environment.
 *
 * With no names configured in production, every request is unauthenticated (returns `null`).
 *
 * @param headers Request headers. Lookups are case-insensitive because the `Headers` API
 *   normalizes keys; callers must pass a real `Headers` instance, not a plain object.
 * @param requestUrl The request's URL, used only for the query-param fallback.
 * @param config Header and query-param names to read.
 */
export function getProxyIdentity(
  headers: Headers,
  requestUrl: string,
  config: ProxyIdentityConfig,
): ProxyIdentity | null {
  if (config.userIdHeader && config.usernameHeader) {
    const headerUserId = headers.get(config.userIdHeader);
    if (headerUserId !== null) {
      return buildIdentity(headerUserId, headers.get(config.usernameHeader));
    }
  }

  if (config.userIdQuery && config.usernameQuery) {
    const url = new URL(requestUrl, "http://localhost");
    const queryUserId = url.searchParams.get(config.userIdQuery);
    if (queryUserId !== null) {
      return buildIdentity(queryUserId, url.searchParams.get(config.usernameQuery));
    }
  }

  if (process.env.NODE_ENV !== "production") {
    const devUserId = process.env.DEV_USER_ID;
    if (devUserId !== undefined) {
      return buildIdentity(devUserId, process.env.DEV_USERNAME);
    }
  }

  return null;
}
