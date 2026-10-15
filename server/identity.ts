import type { IncomingHttpHeaders } from "node:http";
import { env } from "./env.ts";
import { getProxyIdentity, type ProxyIdentityConfig } from "./lib/proxy-identity.ts";

export interface Identity {
  userId: number;
  username: string;
}

/** Build a WHATWG Headers from Node's header object; Headers gives case-insensitive lookup. */
export function toHeaders(req: { headers: IncomingHttpHeaders }): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      try {
        headers.append(name, item);
      } catch {
        // Headers rejects names or values it considers invalid; skip that entry only.
      }
    }
  }
  return headers;
}

export function identityConfigFromEnv(): ProxyIdentityConfig {
  const e = env();
  return {
    userIdHeader: e.IDENTITY_USER_ID_HEADER,
    usernameHeader: e.IDENTITY_USERNAME_HEADER,
    userIdQuery: e.IDENTITY_USER_ID_QUERY,
    usernameQuery: e.IDENTITY_USERNAME_QUERY,
  };
}

/** Stable dev-only id: 32-bit FNV-1a of the name, offset past any real platform id. */
function devUserId(name: string): number {
  let h = 2166136261;
  for (const char of name) {
    h ^= char.codePointAt(0) as number;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h + 1_000_000;
}

const DEV_USER_PATTERN = /^[\w.-]{1,32}$/;

function devUserAllowed(): boolean {
  const e = env();
  return e.NODE_ENV !== "production" && e.ALLOW_DEV_USER === "1";
}

/**
 * Identity comes only from the auth proxy's headers (or query params for older proxies),
 * never from a message body. Order: proxy headers, proxy query params, ?devUser= (dev only),
 * then DEV_USER_ID/DEV_USERNAME (dev only, enforced inside getProxyIdentity).
 */
export function resolveIdentity(req: {
  headers: IncomingHttpHeaders;
  url: string;
}): Identity | null {
  const config = identityConfigFromEnv();
  const headers = toHeaders(req);
  const url = new URL(req.url, "http://localhost");

  const proxyPresent =
    (config.userIdHeader !== undefined && headers.has(config.userIdHeader)) ||
    (config.userIdQuery !== undefined && url.searchParams.has(config.userIdQuery));
  if (proxyPresent) {
    // A present but malformed proxy value fails closed to null, and devUser is ignored.
    return getProxyIdentity(headers, req.url, config);
  }

  const devUser = url.searchParams.get("devUser");
  if (devUser !== null && devUserAllowed()) {
    if (!DEV_USER_PATTERN.test(devUser)) return null;
    return { userId: devUserId(devUser), username: devUser };
  }

  return getProxyIdentity(headers, req.url, config);
}

/** Reported at startup as `identity mode: proxy|dev`. */
export function identityMode(): "proxy" | "dev" {
  const e = env();
  if (e.NODE_ENV === "production") return "proxy";
  return e.ALLOW_DEV_USER === "1" || e.DEV_USER_ID !== undefined ? "dev" : "proxy";
}

/** Log one warning at startup when production has no way to identify anyone. */
export function warnIfIdentityUnconfigured(
  config: ProxyIdentityConfig,
  warn: (message: string) => void,
): void {
  if (env().NODE_ENV !== "production") return;
  if (config.userIdHeader && config.usernameHeader) return;
  warn(
    "IDENTITY_USER_ID_HEADER and IDENTITY_USERNAME_HEADER are not both set; " +
      "every request will be treated as unauthenticated and /ws will close with 4401",
  );
}
