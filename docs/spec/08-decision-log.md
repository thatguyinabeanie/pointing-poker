# Pointing Poker: decision log

Dated 10/15/2026. These decisions were made during planning and are closed. The build session
must not re-litigate them. Each entry is the choice, then the one-line reason.

Numbers are stable references; new decisions are appended, never renumbered.

## Product and scope

1. **Simplest possible architecture.** One app, no extra services; fewer moving parts for a small internal tool.
2. **One team per instance, one shared room.** Another team deploys its own service instance instead of us building rooms and tenancy.
3. **Jira write-back is in v1.** Saving Story Points to the ticket is the point of the tool, using the same credential as reads.
4. **No editing of the Jira ticket body (description or comments) from the app in v1.** An "Open in Jira" button covers it. Revisit later if needed.
5. **No database.** Game state lives in memory and the platform service runs one replica by default.
6. **No tests.** Verification is lint, type check, build, Docker smoke and manual browser checks.

## Identity and transport

7. **Identity comes from the auth proxy's headers** (names set per deployment in `IDENTITY_USER_ID_HEADER` and `IDENTITY_USERNAME_HEADER`), not API key forwarding. The headers are present on WebSocket upgrades too, and there is no user management to build.
8. **WebSockets with 25s pings.** The ALB in front has a 60s idle timeout, so idle tabs would drop without them.
9. **Dev-only `?devUser` override, double-gated.** It needs `NODE_ENV` not set to production and `ALLOW_DEV_USER=1`, and the proxy identity headers always win, so it cannot be reached in production.

## Stack

10. **Modern versions, verified against npm on 10/15/2026.** The user asked for the latest LTS and current tooling.
11. **Node 26 + Fastify 5.** Bun was rejected (ws shim and `node:http` upgrade bugs open as of 10/2026, exactly what `@fastify/websocket` sits on). Next.js was rejected (no native WebSocket server). Hono was rejected (its Node WebSocket path was unverified).
12. **Biome instead of ESLint.** `typescript-eslint` caps TypeScript at below 6.1, so ESLint with TS 7 is not possible today.
13. **Vite 8 + React 19 + MUI 9 via `@fastify/vite` in spa mode.** One process and one port for API, `/ws` and the client in dev and prod.
14. **mise for the toolchain.** It pins the tool versions so local and CI runs match.

## Tickets

15. **Queue scoped by project, optional board, and the needs-pointing label.** The team's main project has 2,175 unpointed open tickets and no pointing label existed, so an unfiltered list is useless.
16. **Free-text search with per-user results.** Search is one person's lookup, so results go only to the requesting socket and are not room state.
17. **Full description and comments rendered from Jira HTML, sanitized on the server.** One place does the cleaning, and the client never trusts markup.

## UI and branding

18. **Layout C: queue, description, comments, and a one-row sticky bottom bar.** The team reads the ticket while voting, and the deck and actions stay reachable.
19. **Laptop widths only.** Internal tool on MacBook Pros inside the hosting platform's service report iframe; below `lg` things just stack.
20. **House style.** Navy #215470, Amber #F1A137 for Save only, Lato, light mode only.

## Process

21. **Buildspec security-review findings are inherited from the template and accepted.** They come from the template we copied, not from new code.
22. **`.env.example` is created by the user from `env-example.txt`.** Claude Code cannot write `.env*` files in this repo.
23. **Buildspecs removed; image pipeline to be decided before the first deploy (10/15/2026).** The user deleted `buildspec/`, and no registry or build pipeline is set up yet. CircleCI still runs lint, type check and build.
24. **Repo lives at `thatguyinabeanie/pointing-poker` (private), not an organization repo (10/15/2026).** The repo was created in the user's personal GitHub space.
25. **Image published to Docker Hub `gabemendoza1/pointing-poker` via repo scripts (10/15/2026).** `scripts/docker-build.sh` and `docker-push.sh` build linux/amd64 and tag by git SHA, with `latest` from clean main. CI did not push images at that point (see 27).
26. **CircleCI removed in favor of GitHub Actions (10/15/2026).** The repo lives on GitHub, so `.github/workflows/ci.yml` replaces `.circleci/config.yml` with the same gates.
27. **CI publishes to Docker Hub on main (10/15/2026).** The `publish` job pushes `:<short-sha>` and `:latest` as linux/amd64 after `checks` pass, using repo secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`.
28. **Docker Hub repo is public (10/15/2026).** The hosting platform cannot pull private images: its pre-deploy image check uses its own Docker Hub account, and it has no pull-secret support.

## Where each decision is specified

- Architecture, stack and repo layout: `01-overview.md`.
- Identity, WebSocket protocol, heartbeat, Jira client and sanitizing: `02-server.md`.
- Layout C, components, UI states and the Open in Jira button: `03-client.md`.
- Dockerfile, CI, deploy settings and step 0 results: `04-infra.md`.
- Order of work, risks and resolved questions: `05-build-plan.md`.
- Why the scaffold is hand-rolled and not based on another template: `06-templates.md`.
- Colors, type and brand rules: `07-branding.md`.

## Changing a decision

If the build hits a real blocker with one of these, stop and tell the user, one question at a
time, with the evidence. Do not work around it silently and do not reopen it for taste.
