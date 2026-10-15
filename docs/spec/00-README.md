# Pointing Poker: handoff bundle

This bundle is the handoff for a Claude Opus coding session that will build Pointing Poker.
The design is closed. Your job is to build it, step by step, from `05-build-plan.md`.

Paths in this file are relative to this bundle folder, which lives at `docs/spec/` in the repo.

## What Pointing Poker is

Pointing Poker is a small, self-hosted estimation app that runs as a service on the hosting
platform. A team member picks a Jira ticket from a shared queue of unpointed tickets, or types a
key as a fallback. Everyone picks a card from a Fibonacci-style deck in private, the team reveals
the votes together, and the agreed number is saved to the ticket's Story Points field in Jira.
After a save, the app removes the `needs-pointing` label (if that switch is on) and refreshes the
queue. A search box in the same panel finds tickets by key or by text, and each person's search
results stay their own. Each deployed instance is one shared room, and its queue settings are
shared too. There is
no database, and identity comes from the headers the platform's auth proxy adds to each request.
The app never edits ticket text, only Story Points and the `needs-pointing` label.
The page uses the full width in LAYOUT C: three top panes side by side. LEFT (25%) holds the queue
and search. CENTER (42%) holds the selected ticket's description: key, summary, meta chips, and the
Jira-rendered description. RIGHT (33%) holds the comments, oldest first. A one-row sticky bottom bar
(88px) holds participant chips with vote status and values, the stats inline after reveal, the
deck in the middle, and the actions on the right. The target is laptop widths only (internal tool,
MacBook Pros, inside the platform's service report iframe). There is no phone layout work. Jira's HTML for the description and comments is sanitized on
the server before it reaches the browser.

## How to use this bundle

1. Read `01-overview.md` in full, then `05-build-plan.md` in full.
2. For each build step, read the spec files that step names (02, 03, 04, 06) before writing code.
3. Open `mocks/pointing-poker.html` in a browser for layout and copy. The same mock is published
   at https://claude.ai/artifact/TetbLQJUp7WmNTB3m4TfTh.
4. Reuse the code in `reference/` instead of rewriting it. Before writing any new function, search
   the repo for an existing one.

## Index

| File | What it is |
|---|---|
| `00-README.md` | This handoff and index |
| `01-overview.md` | Context, architecture, runtime and round diagrams, stack, repo layout, glossary |
| `02-server.md` | Server spec: scope, file map, shared contract, identity, routes, WebSocket protocol, Jira client, heartbeat, logging, error table, acceptance, and scaffold conflicts (section 13) |
| `03-client.md` | Client spec: file map, `useGameSocket`, App wiring, theme and entry files, Vite config, UI states, accessibility, acceptance |
| `04-infra.md` | Dockerfile, CI, deploy settings, and the step 0 results |
| `05-build-plan.md` | Ordered build steps with acceptance checks, known risks, and open questions |
| `06-templates.md` | Survey of starter templates and the verdict on what to start from |
| `07-branding.md` | MUI theme spec: Lato, the house-style palette, and the style rules the client follows |
| `08-decision-log.md` | Dated list of planning decisions, each with its one-line reason. Closed; do not re-litigate |
| `env-example.txt` | Variable names only, no values. The user copies it with `cp docs/spec/env-example.txt .env.example` (Claude Code cannot write `.env*` files in this repo) |
| `drafts/README.md` | Draft repo README. Build step 6 copies it to `README.md` |
| `drafts/CLAUDE.md` | Draft repo CLAUDE.md. Build step 6 copies it to `CLAUDE.md`, with the `npm test` gate removed |
| `drafts/deploy.md` | Draft deploy guide. Build step 6 copies it to `docs/deploy.md` |
| `mocks/pointing-poker.html` | Browser mock of the UI (LAYOUT C, house style: Navy #215470, Amber #F1A137, Lato, light-only). Also published at https://claude.ai/artifact/TetbLQJUp7WmNTB3m4TfTh |
| `reference/shared/protocol.ts` | Wire types shared by client and server |
| `reference/shared/deck.ts` | `DECK` and `isNumericCard` |
| `reference/shared/constants.ts` | `NEEDS_POINTING_LABEL` (types-only protocol.ts cannot hold runtime constants) |
| `reference/server/game.ts` | Pure game state machine |
| `reference/server/jira.ts` | Jira REST client |
| `reference/server/sanitize.ts` | Cleans Jira HTML with `sanitize-html` and replaces attachment images with links |
| `reference/client/src/theme.ts` | MUI theme built from the house-style palette in `07-branding.md` |
| `reference/client/src/lib/estimate.ts` | `suggestPoints`, the default Save value |
| `reference/client/src/components/` | `TopBar`, `QueuePanel`, `Layout` (LAYOUT C), `TicketDescription`, `TicketComments`, `HtmlBody`, `ParticipantChips`, `Deck`, `ActionBar`, `ErrorSnackbar` (all `.tsx`). There is no BottomBar file: `App.tsx` builds the bottom slot from ParticipantChips, Deck and ActionBar |

Files not in the bundle: `App.tsx` and `useGameSocket.ts` are written in the build session, and `server/lib/proxy-identity.ts` is already in the repo.

## Decisions made in planning (closed)

These are closed. Do not re-open them. Copied verbatim from the planning document.

- **Simplest possible architecture and frontend.** One team, one app, one shared room. Another
  team deploys its own instance of the service.
- **Identity comes from the auth proxy's headers.** The header names are set per deployment in
  `IDENTITY_USER_ID_HEADER` and `IDENTITY_USERNAME_HEADER`, with no defaults in the repo. No user
  management, no API key forwarding. Verified against the platform's source during planning: the
  proxy sets the identity headers before the WebSocket branch, so they are on the upgrade request too.
- **WebSockets** for realtime. The platform's auth proxy proxies WS upgrades explicitly. The load
  balancer in front has a 60s idle timeout, so the server pings every 25s.
- **Jira write-back is in v1** (Story Points), via the same credential used for reads.
- **No database.** Game state lives in memory. The platform service defaults to 1
  replica (verified against the platform's source during planning); the deploy doc pins it there.
- **Modern versions, verified against the npm registry on 2026-10-15** (see Stack). The user
  asked for latest Node LTS, TypeScript 7, and current tooling.
- **Runtime/framework: Node 26 + Fastify 5.** Bun was evaluated and rejected for v1: TS 7 is fine
  on Bun, but Bun's `ws` shim and `node:http` upgrade path have open bugs this month, which is
  exactly what `@fastify/websocket` sits on. Next.js rejected: no native WS server. Hono rejected:
  its Node WS story needed verification Fastify's did not.
- **Lint/format: Biome.** `typescript-eslint` (8.71, incl. canary) only supports TypeScript `<6.1`,
  so ESLint + TS 7 is not possible today. Biome has no TypeScript-version coupling.
- **New repo** at `~/source/pointing-poker`. Scaffolding follows the public
  template comparison in `06-templates.md`.

## Working rules for the build session

- Build with subagents, not inline. Name each agent `[Model] task`, for example
  `[Sonnet 5.5] client components`.
- Use cheaper models for narrow scopes: `[Sonnet 5.5]` or `[Haiku 5.5]`. Use Opus only for the
  WebSocket wiring in `server/ws.ts`.
- No tests. Do not write test files, add a test script, or run the test suite. Verification is
  lint, type check, build, Docker smoke, and manual browser checks.
- Commit small and often. Push regularly.
- Open a draft PR early with the label `> 90% ai generated`. If the label does not exist in the
  new repo, tell the user. Do not create it.
- Never read `.env` or print any secret, token, or key. Claude Code cannot write `.env*` files in
  this repo, so the variable names live in `docs/spec/env-example.txt`. The user copies it with
  `cp docs/spec/env-example.txt .env.example`. Keep the file to variable names with no values.
- Ask before anything outward-facing. That includes writing to a real Jira ticket and posting comments. Ask one question at a time.
- All design questions are closed. The resolutions are at the end of `05-build-plan.md`.
