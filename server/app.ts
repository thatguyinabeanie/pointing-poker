import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { healthRoutes } from "./routes/health.ts";
import { registerSpa } from "./routes/spa.ts";
import { wsRoutes } from "./ws.ts";

export interface BuildAppOptions {
  // Tests pass false so no Vite dev server or dist/ lookup happens.
  serveClient?: boolean;
  // TODO(step 3): jira, heartbeatMs
}

export async function buildApp({
  serveClient = true,
}: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

  // Registered before @fastify/vite so its upgrade listener is attached first; Vite's HMR
  // socket then shares the same HTTP server in dev.
  await app.register(fastifyWebsocket, { options: { maxPayload: 4096 } });
  await app.register(healthRoutes);
  await app.register(wsRoutes);

  if (serveClient) {
    await registerSpa(app, { dev: process.env.NODE_ENV !== "production" });
  }

  return app;
}
