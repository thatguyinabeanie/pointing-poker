import type { FastifyInstance } from "fastify";

// The hosting platform's health check points here; there is no Docker HEALTHCHECK.
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/status", async () => ({ ok: true }));
  // TODO(step 3): GET /api/me
}
