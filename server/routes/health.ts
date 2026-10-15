import type { FastifyInstance } from "fastify";
import { resolveIdentity } from "../identity.ts";

// The hosting platform's health check points here; there is no Docker HEALTHCHECK.
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/status", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return { ok: true };
  });

  // Lets the client learn who the auth proxy says it is. 401 when no identity is present
  // (production default when the IDENTITY_* header names are unset).
  app.get("/api/me", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const identity = resolveIdentity(request);
    if (!identity) return reply.code(401).send({ error: "unauthenticated" });
    return { userId: identity.userId, username: identity.username };
  });
}
