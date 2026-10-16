import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";

// Sockets that answered the last ping. A WeakSet so closed sockets are collected without cleanup.
const alive = new WeakSet<WebSocket>();

// Call once per accepted socket. Marks it alive now and again on every pong.
export function trackSocket(socket: WebSocket): void {
  alive.add(socket);
  socket.on("pong", () => alive.add(socket));
}

// Every interval: terminate sockets that never answered the previous ping, ping the rest.
// 25s because the ALB idle timeout is 60s, so one missed pong window (up to 50s) is tolerated.
export async function heartbeat(app: FastifyInstance, opts: { intervalMs: number }): Promise<void> {
  const timer = setInterval(() => {
    let terminated = 0;
    for (const client of app.websocketServer.clients) {
      if (client.readyState !== client.OPEN) continue;
      if (!alive.has(client)) {
        client.terminate();
        terminated += 1;
        continue;
      }
      alive.delete(client);
      try {
        client.ping();
      } catch {
        // The socket closed between the readyState check and the ping; its close event cleans up.
      }
    }
    if (terminated > 0) app.log.info({ terminated }, "heartbeat terminated dead sockets");
  }, opts.intervalMs);
  timer.unref();

  app.addHook("onClose", async () => {
    clearInterval(timer);
  });
}
