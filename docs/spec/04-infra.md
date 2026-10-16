# Pointing Poker: infrastructure spec

Audience: the build session finishing the scaffold, and whoever sets up the platform service and GitHub Actions. The repo at `~/source/pointing-poker` (commit `5665462`) is the source of truth for file contents. "Verified" means the scaffold spike, run October 15, 2026.

## 1. Toolchain

- Pins: `mise.toml` (`node = "26"`, `npm = "12"`) and `.node-version` (`26`). Keep them in step; the Dockerfile asserts `.node-version` against its `FROM` tag.
- Verified: mise 2026.4.5, Node v26.12.0, npm 12.2.0. First run: `mise trust`, then `mise install`. A global gitignore on the author's machine ignores `*mise.toml`, so `.gitignore` carries `!mise.toml`.
- Verified image tags: `node:26-alpine`.
- TypeScript 7.0.2 only type-checks. The server runs as `.ts` through Node 26 type stripping, with no server build step.
- Rules, enforced by the tsconfig files: relative imports use the real `.ts` extension (`allowImportingTsExtensions`); only erasable syntax, so no `enum`, `namespace` or constructor parameter properties (`erasableSyntaxOnly`); type-only imports use `import type` (`verbatimModuleSyntax`), or Node fails at runtime; TS 7 defaults `types` to `[]`, so ambient types are listed.
- Node idioms in use: `process.loadEnvFile()` (`server/index.ts`, a missing `.env` is ignored) and `import.meta.dirname` (`server/routes/spa.ts`).
- Biome 2.5.15 uses `"rules": { "preset": "recommended" }`. Do not run `biome migrate`: verified that it rewrites the deprecated `rules.recommended: true` to `preset: "none"`, and running it again undoes the hand-written preset.

## 2. Repo files

- `package.json`: `"type": "module"`, `engines.node` `>=26`, no `test` script (no tests by decision). Runtime: `@fastify/vite` 10.0.0, `@fastify/websocket` 11.3.4, `fastify` 5.12.7, `zod` 4.6.7 (zod is not imported yet). The scaffold predates `sanitize-html`, so it is in neither list; build step 2 adds `sanitize-html` to `dependencies` and `@types/sanitize-html` to dev. Dev: `vite` 8.3.4, `@vitejs/plugin-react` 6.1.2, `react` 19.3.1, `@mui/material` and `@mui/icons-material` 9.5.0, `typescript` 7.0.2, `@biomejs/biome` 2.5.15, `@types/node` 26.6.5. Scripts, verbatim:

```json
  "scripts": {
    "dev": "node --watch-path=server --watch-path=shared server/index.ts",
    "build": "vite build",
    "start": "node server/index.ts",
    "lint": "biome ci .",
    "format": "biome check --write .",
    "tsc:check": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.server.json"
  },
```

- `mise.toml`, verbatim:

```toml
[tools]
# Keep in sync with .node-version, which the Dockerfile asserts against its FROM tag.
node = "26"
npm = "12"
```

- `Dockerfile`: section 4. `.node-version`: `26`.
- `.dockerignore`: excludes `node_modules`, `dist`, env files (keeps `.env.example`), tests, git and CI folders, docs, `Dockerfile`, `.claude`. It keeps `client/` and `vite.config.ts`, which the build stage needs.
- `.gitignore`: `/node_modules`, `/dist`, env files except `.env.example`, `mise.local.toml`, and `!mise.toml`.
- `vite.config.ts`, verbatim:

```ts
import { viteFastify } from "@fastify/vite/plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  base: "/",
  build: {
    // viteFastify appends "/client" to this for the client environment, so the bundle lands in
    // dist/client and its resolved config in dist/vite.config.json. Setting "../dist/client"
    // here would produce dist/client/client.
    outDir: "../dist",
    // outDir sits outside the Vite root, so Vite refuses to empty it without this.
    emptyOutDir: true,
  },
  // viteFastify writes dist/vite.config.json at build time; @fastify/vite reads that JSON in
  // production instead of this file, which is why the runtime image needs neither this file nor vite.
  plugins: [react(), viteFastify({ spa: true })],
});
```

- `tsconfig.base.json`, verbatim:

```json
{
  "compilerOptions": {
    "target": "es2024",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    // Node runs server/*.ts directly by stripping types, so imports must name the real .ts file
    // and only erasable syntax (no enums, no parameter properties) is allowed.
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "resolveJsonModule": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

- `tsconfig.json` (client; includes `client`, `shared`, `vite.config.ts`), verbatim:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "lib": ["es2024", "dom", "dom.iterable"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    // TypeScript 7 defaults `types` to [], so ambient types must be listed explicitly.
    "types": ["vite/client"]
  },
  "include": ["client", "shared", "vite.config.ts"]
}
```

- `tsconfig.server.json` (server; includes `server`, `shared`), verbatim:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "lib": ["es2024"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "types": ["node"]
  },
  "include": ["server", "shared"]
}
```

- `biome.json`, verbatim:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.15/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "includes": ["**", "!!dist"] },
  "formatter": { "enabled": true, "indentStyle": "space", "lineWidth": 100 },
  "javascript": { "formatter": { "quoteStyle": "double" } },
  "linter": {
    "enabled": true,
    "rules": { "preset": "recommended" },
    "domains": { "react": "all" }
  }
}
```

- `.github/workflows/ci.yml`: section 5. The image buildspecs were removed (section 6).

## 3. Dev workflow

- `npm run dev` restarts the server only when `server/` or `shared/` changes. Client edits go through Vite's hot update on port 3838.
- Plain `node --watch` loops: Vite 8 writes `node_modules/.vite-temp/*.mjs` on every start and watch mode restarts on it. Verified: `--watch --env-file-if-exists=.env` restarted 8 to 9 times (`v1b.log`, `v1c.log`), and adding `--watch-path` flags still restarted 12 times (`v1d.log`). The final command shows no restarts (`v3*.log`). The cause, per the comment in `server/index.ts`: on Node 26.12, `--env-file-if-exists` makes `--watch-path` track imported modules again.
- `.env` edits need a manual `npm run dev` restart, since the watcher does not watch `.env`.
- Two-player flow (planned, not built): `ALLOW_DEV_USER=1` with `?devUser=alice` and `?devUser=bob` in two browser profiles (`02-server.md` section 5, `03-client.md` section 9). Not runnable yet: `server/identity.ts` is missing and `server/ws.ts` is an echo stub. Today's only dev identity is `DEV_USER_ID` and `DEV_USERNAME`, one per process.

## 4. Build and image

| Stage | Base | What it does | Hands off to |
|---|---|---|---|
| `base` | `node:26-alpine` | `WORKDIR`; asserts `.node-version` matches the tag | All stages |
| `deps` | `base` | `npm ci` (all dependencies) | `build` |
| `deps-prod` | `base` | `npm ci --omit=dev` | `runner` (`node_modules`) |
| `build` | `base` | `COPY . .`, `npm run build` into `dist/` | `runner` (`dist/`) |
| `runner` | `node:26-alpine` | `NODE_ENV=production`, port 3838, user `app`, no `HEALTHCHECK` | Ships |

```dockerfile
# Multi-stage Dockerfile for Pointing Poker (Fastify 5 serving a Vite-built React SPA).
# Node runs server/*.ts directly via built-in type stripping, so there is no server build.
#
# Stages:
#   base      - node:26-alpine, asserts the tag below hasn't drifted from .node-version.
#   deps      - full `npm ci` (incl. devDependencies), needed to run `vite build`.
#   deps-prod - production-only `npm ci --omit=dev` for the runtime image. vite still lands here
#               because it is a required peer of @fastify/vite, but nothing imports it at runtime.
#   build     - runs `vite build` into dist/ (dist/client + dist/vite.config.json).
#   runner    - the image that ships: non-root, port 3838, no HEALTHCHECK (the app serves
#               GET /api/status for the platform's health check instead).

FROM node:26-alpine AS base
WORKDIR /app

# .node-version is the single source of truth for the Node major version (bare major, e.g.
# "22", no "v" prefix -- see the repo's global constraints). Docker's FROM directive can't
# read a file at build time, so this asserts the hardcoded tag above hasn't drifted from
# that file instead of trying to parameterize FROM.
COPY .node-version ./.node-version
RUN set -eu; \
    expected="$(cat .node-version)"; \
    actual="$(node -e "console.log(process.versions.node.split('.')[0])")"; \
    if [ "$expected" != "$actual" ]; then \
      echo "Dockerfile base image (node:26-alpine) no longer matches .node-version ($expected). Update the FROM line." >&2; \
      exit 1; \
    fi

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS deps-prod
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:26-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3838

RUN addgroup -S app && adduser -S app -G app

COPY --from=deps-prod --chown=app:app /app/node_modules ./node_modules

# All of dist/, not just dist/client: in production @fastify/vite reads the resolved config
# that the viteFastify plugin wrote to dist/vite.config.json at build time. That is also why
# vite.config.ts is not copied; production never loads it.
COPY --from=build --chown=app:app /app/dist ./dist

# package.json is needed at runtime: "type": "module", and @fastify/vite locates the app root
# by walking up to it.
COPY --chown=app:app package.json ./
COPY --chown=app:app server ./server
COPY --chown=app:app shared ./shared

# Recorded for traceability only; nothing in the build depends on its value.
ARG COMMIT_HASH_SHORT=unknown
LABEL org.opencontainers.image.revision=${COMMIT_HASH_SHORT}

USER app

EXPOSE 3838

CMD ["node", "server/index.ts"]
```

- `dist/` holds `client/` and `vite.config.json`. Verified outcome (a): production reads `dist/vite.config.json`, serves `dist/client` with `@fastify/static`, and never loads `vite.config.ts` or imports `vite`.
- `build.outDir` is `"../dist"`: the plugin appends `/client`, so `"../dist/client"` produced `dist/client/client`.
- `vite` stays in `npm ci --omit=dev` as a required peer of `@fastify/vite`. Verified: `node_modules` is 65MB with it and 45MB without. Removing it by hand still booted, but running without a required peer is unsupported.
- Verified: image size 347MB. The container runs as `app`, and `/app` holds `dist`, `node_modules`, `package.json`, `server` and `shared`.
- Line 17 uses `"22"` as the example. The real value is `26` (section 10).

## 5. CI (GitHub Actions)

`.github/workflows/ci.yml` has two jobs. `checks` runs on every push and pull request: checkout, `jdx/mise-action` (Node 26 and npm 12 from `mise.toml`), `npm ci`, `npm run lint`, `npm run tsc:check`, `npm run build`, then `npm audit --omit=dev --audit-level=high`. Each gate after install runs with `if: ${{ !cancelled() }}`, so one run reports every failure. The audit uses `--omit=dev` on purpose: the lint toolchain drags in advisories that never reach a deployed container, and failing on those trains people to ignore the gate.

`publish` needs `checks` and runs on every branch push (`startsWith(github.ref, 'refs/heads/')`), never on pull requests or tag pushes. Skipping pull requests keeps the Docker Hub secrets away from fork PRs. Actions are pinned to major tags (`actions/checkout@v7`, `jdx/mise-action@v5`, `docker/*@v4/v6/v7`). The workflow has `permissions: contents: read` and a concurrency group that cancels an older run on the same ref.

No test step (no tests by decision).

## 6. Image builds

### Image build and push

Three scripts in `scripts/` (also `npm run image:build`, `image:push`, `image:run`) build, publish and smoke-test the image. The image is `gabemendoza1/pointing-poker` on Docker Hub.

- `docker-build.sh` builds for `linux/amd64` with `docker buildx build --load`. The hosting platform runs amd64, so this cross-builds from Apple Silicon. It refuses a dirty tree unless `ALLOW_DIRTY=1`.
- Tags: `<short-sha>` always, and `latest` only from a clean `main`. `IMAGE_REPO` and `TAG` override the defaults.
- `docker-push.sh` pushes `<short-sha>`, and `latest` under the same rules. It does not run `docker login`, and it prints the manifest platform to confirm `linux/amd64` landed.
- `docker-run.sh` runs the built image on port 3838, passes `.env` with `--env-file` when the file exists, and prints the `/api/status` and `/api/me` curl commands.

Open point: the platform service must be able to pull the image. A private Docker Hub repo needs registry credentials on the Platform side, or the repo must be public. Confirm with the Platform admins before the first deploy. The console also keeps an allowlist of public images in `data/public_images`, so check whether that applies.

Every branch push publishes `:<short-sha>`, `:<branch>` (sanitized, `build/v1` becomes `build-v1`) and `:<branch>-<run-number>` (for example `build-v1-57`, a fixed tag per CI run) to Docker Hub from the `publish` job in `.github/workflows/ci.yml` (linux/amd64, on GitHub's amd64 runners), so a branch can be tried on the platform. Merges to `main` also publish `:latest` (`enable={{is_default_branch}}`), so a branch push never overwrites what is deployed (decision 37). The scripts remain for local builds and smoke tests.

Setup the user does outside the repo:

1. In GitHub repo settings, add secrets `DOCKERHUB_USERNAME` (`gabemendoza1`) and `DOCKERHUB_TOKEN` (a Docker Hub access token with read and write scope).
2. Make the Docker Hub repo public. The platform's pre-deploy image check uses its own Docker Hub account, so private images fail; it has no pull-secret support.

The two security-review notes inherited from the buildspecs (build-cache reuse and overwritable branch tags) no longer apply.

## 7. Deploy settings

Set these on the platform service. The first rows come from the draft `docs/spec/drafts/deploy.md` (not in the repo yet; build step 6 copies it to `docs/deploy.md`). The last three are optional variables from `02-server.md` section 4, which the scaffold does not read yet.

| Setting | Value | Why |
|---|---|---|
| The platform's port setting (the app reads `PORT`) | `3838` | Matches `EXPOSE`; the server binds `0.0.0.0`. |
| The platform's health-check path setting | `/api/status` | No `HEALTHCHECK`; the platform polls this route. |
| The proxy read timeout setting | `3600` | WebSocket insurance. The auth proxy default is 15 seconds. |
| The proxy write timeout setting | `3600` | WebSocket insurance. The auth proxy default is 30 seconds. |
| replicas / maxReplicas | `1` / `1` | Game state lives in memory. |
| `JIRA_API_TOKEN` credential | Attach | Injected as `JIRA_API_TOKEN_USERNAME` and `JIRA_API_TOKEN_PASSWORD`. |
| `JIRA_BASE_URL` | Your Jira site, for example `https://example.atlassian.net` (no default in the repo) | Jira REST calls and ticket links. |
| `JIRA_STORY_POINTS_FIELD` | Optional | Unset: found through the Jira field list. |
| `LOG_LEVEL` | Optional, default `info` | `debug` for more detail. |
| `JIRA_DEFAULT_PROJECT` | Optional, no default | Seeds the queue's project. |
| `ALLOWED_ORIGINS` | Optional | Only if the WebSocket Origin check fails behind the auth proxy. |
| `IDENTITY_USER_ID_HEADER`, `IDENTITY_USERNAME_HEADER` | Set to the header names the auth proxy injects | No defaults in the repo. Unset in production means unauthenticated: `/ws` closes with 4401. Production logs one startup warning naming both variables (no values) when they are not both set. |

Do not set `ALLOW_DEV_USER` or `DEV_USER_ID` and `DEV_USERNAME` in production. The image sets `NODE_ENV=production`, which disables them anyway.

On Demand scheduling is fine: a sleeping container loses the room, and the next visitor starts empty. Publish the service report, because identity arrives only through the auth proxy's headers. One team per instance, one replica.

## 8. Outside-the-repo checklist

1. Publish the image to Docker Hub (section 6, Image build and push) and settle how the Service pulls it.
2. Add the `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` repo secrets, and make the Docker Hub repo public (section 6).
3. Create a platform service that pulls the image from that registry.
4. Create a Custom credential `JIRA_API_TOKEN`: Atlassian email as username, API token as password.
5. Set `JIRA_BASE_URL` on the service, then apply section 7.

## 9. Verification results

Spike run, October 15, 2026, commit `5665462`. `npm run lint`, `npm run tsc:check` and `npm run build` pass. No tests were written or run.

- V1 (type stripping, watch mode): `node server/index.ts` starts under Node 26 with no build step, pass. The `--watch --env-file-if-exists` loop is in section 3. Final command `node --watch-path=server --watch-path=shared server/index.ts` with `process.loadEnvFile()`, pass.
- V2 (production, outcome a): `npm ci --omit=dev` and `npm run build` (both in `docker-build.log`), then `docker build -t pointing-poker .` and `docker run --rm -p 3838:3838 pointing-poker`. `curl -i localhost:3838/api/status` and `/` return 200, hashed assets return 200, `/nope` returns 404. The curl lines follow the plan's verification step 3; exact transcripts were not kept.
- V3 (HMR): both plugins answered one upgrade, so the browser saw two `101 Switching Protocols` and failed with "RSV1 must be clear". `server.hmr.port` does not help: in Vite 8 it is a deprecated alias for `server.ws.*`, and `@fastify/vite` pins HMR to Fastify's server. Fix, commit `5665462`: a dev-only `onRequest` hook in `server/routes/spa.ts` calls `reply.hijack()` for upgrades with `Sec-WebSocket-Protocol` `vite-hmr` or `vite-ping`. After the fix: one `101`, HMR `connected`, `/ws` echo works, edits push a full reload. Headless only.

## 10. Known gaps

- Real-browser HMR check is owed. V3 was checked headlessly.
- Optional: drop `vite` from the runtime image (about 20MB, and a required peer today). Not done.
- `.env.example` does not exist in the repo (inference). It is not in `git ls-files`, `git status --untracked-files=all` is clean, and `.gitignore` un-ignores it, so an untracked copy would show. A direct read was blocked by policy, so its contents are unchecked. When created it holds names only, and it should list `ALLOWED_ORIGINS` and `JIRA_DEFAULT_PROJECT`, which the `docs/spec/drafts/deploy.md` TODO and the plan's list omit.
- `docs/deploy.md` does not exist yet; its draft is `docs/spec/drafts/deploy.md`. The repo has only a stub `README.md`.
- Dockerfile line 17 says `"22"`; it should read `26`.- `zod` and `@types/ws` are declared but not imported yet.
- The stale `'../dist/client'` and `server.hmr.port` mentions in `01-overview.md` and `05-build-plan.md` were patched when the spec bundle was assembled.
