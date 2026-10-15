import type { IncomingHttpHeaders } from "node:http";
import {
  getProxyIdentity,
  type ProxyIdentity,
  type ProxyIdentityConfig,
} from "./lib/proxy-identity.ts";

// Empty strings count as unset, so `IDENTITY_USER_ID_HEADER=` in an env file means "not configured".
function fromEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function identityConfigFromEnv(): ProxyIdentityConfig {
  return {
    userIdHeader: fromEnv("IDENTITY_USER_ID_HEADER"),
    usernameHeader: fromEnv("IDENTITY_USERNAME_HEADER"),
    userIdQuery: fromEnv("IDENTITY_USER_ID_QUERY"),
    usernameQuery: fromEnv("IDENTITY_USERNAME_QUERY"),
  };
}

/** Log one warning at startup when production has no way to identify anyone. */
export function warnIfIdentityUnconfigured(
  config: ProxyIdentityConfig,
  warn: (message: string) => void,
): void {
  if (process.env.NODE_ENV !== "production") return;
  if (config.userIdHeader && config.usernameHeader) return;
  warn(
    "IDENTITY_USER_ID_HEADER and IDENTITY_USERNAME_HEADER are not both set; " +
      "every request will be treated as unauthenticated and /ws will close with 4401",
  );
}

/** Adapt Node's header object to the `Headers` the pure resolver expects. */
export function resolveIdentity(
  rawHeaders: IncomingHttpHeaders,
  url: string,
  config: ProxyIdentityConfig,
): ProxyIdentity | null {
  const headers = new Headers();
  for (const [name, value] of Object.entries(rawHeaders)) {
    if (typeof value === "string") headers.set(name, value);
  }
  return getProxyIdentity(headers, url, config);
}
