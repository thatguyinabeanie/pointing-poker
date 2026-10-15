import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { env } from "./env.ts";
import { heartbeat } from "./heartbeat.ts";
import { createJiraClient, type JiraClient, notConfigured } from "./jira.ts";
import { redact } from "./log.ts";
import { healthRoutes } from "./routes/health.ts";
import { registerSpa } from "./routes/spa.ts";
import { wsPreClose, wsRoutes } from "./ws.ts";

export interface BuildAppOptions {
  // Tests pass false so no Vite dev server or dist/ lookup happens.
  serveClient?: boolean;
  // Overrides the client built from the JIRA_* environment variables.
  jira?: JiraClient;
  // Heartbeat interval; defaults to 25s (the ALB idle timeout is 60s).
  heartbeatMs?: number;
}

// Every method resolves to the same not_configured failure, so the app runs without Jira.
function unconfiguredJira(): JiraClient {
  const fail = async () => notConfigured();
  return {
    storyPointsFieldId: fail,
    getIssue: fail,
    setStoryPoints: fail,
    listProjects: fail,
    listBoards: fail,
    boardType: fail,
    searchQueue: fail,
    searchTickets: fail,
  };
}

export async function buildApp({
  serveClient = true,
  jira: jiraOverride,
  heartbeatMs = 25_000,
}: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = env();
  const app = Fastify({ logger: { level: config.LOG_LEVEL, redact } });

  let jira = jiraOverride;
  if (!jira) {
    const { JIRA_BASE_URL, JIRA_API_TOKEN_USERNAME, JIRA_API_TOKEN_PASSWORD } = config;
    if (JIRA_BASE_URL && JIRA_API_TOKEN_USERNAME && JIRA_API_TOKEN_PASSWORD) {
      jira = createJiraClient({
        baseUrl: JIRA_BASE_URL,
        email: JIRA_API_TOKEN_USERNAME,
        token: JIRA_API_TOKEN_PASSWORD,
        fieldOverride: config.JIRA_STORY_POINTS_FIELD,
        logger: app.log,
      });
    } else {
      const missing = (
        [
          ["JIRA_BASE_URL", JIRA_BASE_URL],
          ["JIRA_API_TOKEN_USERNAME", JIRA_API_TOKEN_USERNAME],
          ["JIRA_API_TOKEN_PASSWORD", JIRA_API_TOKEN_PASSWORD],
        ] as const
      )
        .filter(([, value]) => !value)
        .map(([name]) => name);
      // Names only. All three missing means Jira is simply off, which is not worth a warning.
      if (missing.length < 3) {
        app.log.warn({ missing }, "Jira is partly configured; running without Jira");
      }
      jira = unconfiguredJira();
    }
  }

  // Registered before @fastify/vite so its upgrade listener is attached first; Vite's HMR
  // socket then shares the same HTTP server in dev. preClose must be the plugin option: a
  // separate hook would run after the plugin's default one has already closed sockets without 1001.
  await app.register(fastifyWebsocket, {
    options: { maxPayload: 4096 },
    errorHandler(error, socket, request) {
      request.log.error({ err: error }, "ws error");
      socket.terminate();
    },
    preClose: wsPreClose(app),
  });
  await app.register(healthRoutes);
  await app.register(wsRoutes, { jira });
  await heartbeat(app, { intervalMs: heartbeatMs });

  if (serveClient) {
    await registerSpa(app, { dev: config.NODE_ENV !== "production" });
  }

  return app;
}
