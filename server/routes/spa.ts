import { resolve } from "node:path";
import fastifyVite from "@fastify/vite";
import type { FastifyInstance } from "fastify";

// Repo root, where vite.config.ts lives (dev) and where @fastify/vite starts its search for
// dist/vite.config.json (prod).
const ROOT = resolve(import.meta.dirname, "../..");

// Called on the root instance rather than registered as an encapsulated plugin: in dev, Vite's
// middlewares run from an onRequest hook, and they must also see URLs with no Fastify route
// (/@vite/client, /src/main.tsx), which only root-level hooks do.
export async function registerSpa(app: FastifyInstance, { dev }: { dev: boolean }): Promise<void> {
  if (dev) {
    // Vite's HMR socket shares this HTTP server and upgrades GET / itself. @fastify/websocket
    // also routes every upgrade through Fastify, and for a plain route like GET / it completes a
    // second handshake and closes, so the browser sees two "101" responses on one socket and its
    // HMR client drops. Hijacking here stops Fastify from touching the socket Vite owns.
    // (server.hmr.port does not help: @fastify/vite pins hmr.server to this server, so Vite keeps
    // listening here while the browser is told to dial the other port.)
    app.addHook("onRequest", async (request, reply) => {
      const protocol = request.headers["sec-websocket-protocol"];
      if (request.ws && (protocol === "vite-hmr" || protocol === "vite-ping")) reply.hijack();
    });
  }
  await app.register(fastifyVite, { root: ROOT, dev, spa: true });
  app.get("/", (_request, reply) => reply.html());
  await app.vite.ready();
}
