import { buildApp } from "./app.ts";
import { identityConfigFromEnv, warnIfIdentityUnconfigured } from "./identity.ts";

// Loaded here rather than with `node --env-file-if-exists`: on Node 26.12 that flag makes
// `--watch-path` track imported modules again, and Vite's per-start temp config file
// (node_modules/.vite-temp) then restarts `npm run dev` in an endless loop. The image never
// contains a .env (.dockerignore), so this is a no-op in production.
try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const port = Number(process.env.PORT ?? 3838);
const app = await buildApp();
warnIfIdentityUnconfigured(identityConfigFromEnv(), (message) => app.log.warn(message));

// 0.0.0.0 because the platform's auth proxy reaches the container over its network interface, not loopback.
await app.listen({ host: "0.0.0.0", port });

// TODO(step 3): 1001 close to all sockets via preClose, and a 5s hard exit.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
