import type { FastifyInstance } from "fastify";
import { identityConfigFromEnv, resolveIdentity } from "./identity.ts";

// TODO(step 3): replace this echo with origin check, identity, game dispatch and snapshots.
export async function wsRoutes(app: FastifyInstance): Promise<void> {
  const identityConfig = identityConfigFromEnv();
  app.get("/ws", { websocket: true }, (socket, request) => {
    const identity = resolveIdentity(request.headers, request.url, identityConfig);
    request.log.info({ userId: identity?.userId }, "ws connected");
    // Attached synchronously: @fastify/websocket drops messages that arrive before a listener exists.
    socket.on("message", (raw) => {
      try {
        socket.send(JSON.stringify({ echo: JSON.parse(raw.toString()) }));
      } catch {
        socket.send(JSON.stringify({ error: "invalid json" }));
      }
    });
  });
}
