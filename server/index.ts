import { buildApp } from "./app.ts";
import { env } from "./env.ts";
import { identityConfigWarning, identityMode } from "./identity.ts";

// Loaded here rather than with `node --env-file-if-exists`: on Node 26.12 that flag makes
// `--watch-path` track imported modules again, and Vite's per-start temp config file
// (node_modules/.vite-temp) then restarts `npm run dev` in an endless loop. The image never
// contains a .env (.dockerignore), so this is a no-op in production.
try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const app = await buildApp();
const { PORT, JIRA_BASE_URL, JIRA_API_TOKEN_USERNAME, JIRA_API_TOKEN_PASSWORD, ALLOWED_ORIGINS } =
  env();

// 0.0.0.0 because the platform's auth proxy reaches the container over its network interface, not loopback.
await app.listen({ host: "0.0.0.0", port: PORT });
app.log.info(`identity mode: ${identityMode()}`);
const identityWarning = identityConfigWarning();
if (identityWarning !== null) app.log.warn(identityWarning);
// Booleans only; never log the values.
app.log.info(
  {
    jiraConfigured: Boolean(JIRA_BASE_URL && JIRA_API_TOKEN_USERNAME && JIRA_API_TOKEN_PASSWORD),
    allowedOriginsSet: Boolean(ALLOWED_ORIGINS?.length),
  },
  "startup config",
);

// app.close() runs the websocket plugin's preClose (1001 to every socket, configured in app.ts).
// The timer is the backstop if a peer never finishes the close handshake.
let shuttingDown = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, "shutting down");
    setTimeout(() => process.exit(1), 5000).unref();
    app.close().then(
      () => process.exit(0),
      (err) => {
        app.log.error({ err }, "close failed");
        process.exit(1);
      },
    );
  });
}
