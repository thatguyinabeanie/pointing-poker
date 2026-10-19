import type { FastifyBaseLogger } from "fastify";

/**
 * Pino redaction for Fastify's logger option. Fastify's default request serializer does not
 * log headers, so this is defense in depth.
 */
export const redact = {
  paths: [
    "req.headers.authorization",
    "req.headers.cookie",
    "*.authorization",
    "*.token",
    "*.password",
  ],
  censor: "[redacted]",
};

/** Child logger bound to a user id. Identity is logged as userId only, never the username. */
export function userLog(log: FastifyBaseLogger, userId: number): FastifyBaseLogger {
  return log.child({ userId });
}
