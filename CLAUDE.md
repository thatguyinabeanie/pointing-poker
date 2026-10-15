# CLAUDE.md

This file gives guidance to Claude Code when working in this repository.

## Commands

```sh
npm run dev          # Fastify with Vite hosted in-process, serves on 3838 with HMR
npm run build        # vite build, client only (there is no server build)
npm run start        # node server/index.ts
npm run lint         # biome ci .
npm run format       # biome check --write .
npm run tsc:check    # tsc for the client and the server projects
npm run image:build  # Docker image for linux/amd64 (scripts/docker-build.sh)
npm run image:push   # push the image (scripts/docker-push.sh)
npm run image:run    # run the image locally on 3838 (scripts/docker-run.sh)
```

Before committing, run the whole gate:

```sh
npm run format && npm run lint && npm run tsc:check && npm run build
```

Toolchain: Node 26 and npm 12 are pinned in `mise.toml`, and `.node-version` must match the
Dockerfile's `FROM` tag. Run `mise trust && mise install` on a new machine.

There are no tests in v1 (decision in `docs/spec/08-decision-log.md`). Do not add test files or a
test script.

## Architecture

1. `client/` is a Vite React app (MUI) with one page and one WebSocket per browser tab.
2. `server/app.ts` builds a Fastify 5 app that serves the client through `@fastify/vite` and
   handles `/ws` through `@fastify/websocket`.
3. `server/game.ts` is a pure state machine. `server/ws.ts` wires it to sockets and sends each
   viewer their own snapshot (`viewFor`).
4. `server/jira.ts` is the only code that talks to Jira (read a ticket, write Story Points).
5. `shared/` holds the protocol types and the deck, imported by both client and server. There is
   no database. All state is in memory.

## Constraints that are not obvious from the code

- **Single replica.** Game state is in process memory. Two instances would each run their own
  rooms and would not see each other's votes.
- **Identity comes only from the auth proxy's headers** (names from `IDENTITY_USER_ID_HEADER`
  and `IDENTITY_USERNAME_HEADER`), read in `server/identity.ts`. No message body carries a user identifier, so never add one.
- **Dev overrides are gated.** `DEV_USER_ID`, `DEV_USERNAME`, and `?devUser=` are
  honored only when `NODE_ENV` is not `production`. `?devUser=` also needs `ALLOW_DEV_USER=1`.
  The Dockerfile sets `NODE_ENV=production`.
- **Never log the Jira token.** It is never sent to the browser either.
- **Read env lazily.** Call `env()` from `server/env.ts` inside functions. Do not parse
  `process.env` at module scope, because the build imports these modules without the real values.
- **Erasable syntax only on the server.** Node 26 runs the `.ts` files directly through type
  stripping, so no `enum`, no parameter properties, and no `namespace`. `erasableSyntaxOnly`
  in the tsconfig enforces this.
- **Relative imports need explicit `.ts` extensions** (`import { DECK } from '../shared/deck.ts'`).
  Node requires them at runtime.

## Conventions

- Comments explain why, not what. Cite the bug or the reason a choice was made.
- Failures are discriminated results (`{ ok: false, reason }`), not exceptions, so the caller
  can choose the response.
- Commit messages state the problem, the reasoning, and what was verified.

## Gotchas

- `*/` inside a JSDoc block ends the comment early. Do not put a glob such as `server/**/*.ts`
  inside `/** */`.
- Tools cannot read `.env*` files (they are deny-listed). Change `.env.example` instead, and
  keep it to variable names with no values.
- Vite's HMR socket shares the Fastify server. A dev-only `onRequest` hook in
  `server/routes/spa.ts` hijacks `vite-hmr` upgrades so `@fastify/websocket` leaves them to Vite.
  Do not set `server.hmr.port`; `@fastify/vite` pins HMR to this server and the setting breaks it
  (verified, see `docs/spec/04-infra.md` V3).

## Git

- The repo `thatguyinabeanie/pointing-poker` is public on GitHub.
- Never force-push.
- Never push directly to `main`. Work on a feature branch and open a pull request.
