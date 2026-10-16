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

15. **Queue scoped by project, optional board, and the needs-pointing label.** The team's main project has thousands of open unpointed tickets and no pointing label existed, so an unfiltered list is useless.
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
29. **Repo is now public, and pre-PR history was squashed (10/15/2026).** This supersedes the private visibility in decision 24. Before the first PR the history was squashed so no internal names remain in any commit.
30. **A ticket needs pointing if labeled or unpointed (10/15/2026).** The queue JQL is now `labels = X OR points is EMPTY`, and the "Labeled only" switch (still on by default, wire field `needsPointingOnly`) narrows it to labeled tickets so a pointed-but-labeled ticket can be re-pointed. This refines decision 15.
31. **Optional default board by name or id (10/15/2026).** `JIRA_DEFAULT_BOARD` takes a board name or numeric id and is resolved against the default project's boards at bootstrap, before the first queue fetch. A missing, unknown or ambiguous value falls back to no board, with one warn log.
32. **Queue mirrors the board's backlog page (10/15/2026).** With a board selected, the queue is read through the Agile API as sections: active sprints, then future sprints, then the backlog, each in rank order and capped at 50 tickets, with the board's own filter applied by Jira. The client shows the sections with collapsible headers; collapse state is per viewer (localStorage). Without a board the queue is one plain section. This replaces the single-JQL `filter = <id>` approach from decision 15 for boards.
33. **The "Labeled only" switch now defaults off (10/15/2026).** This is the user's decision and supersedes the default-on setting in decision 30. The `needs-pointing` label is not in use yet, so with the switch on the queue would start empty. The queue shows labeled or unpointed tickets by default, and board scoping plus sprint sections keep the list manageable.
34. **Label support removed; the queue is "not Done and unpointed" (10/15/2026).** This is the user's decision and supersedes the label parts of decisions 15, 30 and 33. The queue clause is only `statusCategory != Done AND <points field> is EMPTY`, so every unpointed ticket in a To Do status (Untriaged and Backlog alike) shows. The label paths were narrowing the queue: "Labeled only" hid unpointed Backlog tickets such as CIVIS-5661, which Jira confirms match the points rule. Removed: the "Labeled only" and "Clear label on save" switches, post-save label removal, and `JIRA_NEEDS_POINTING_LABEL`. The Story Points field-id logic (`cf[NNNNN]` or `"Story Points"`) is unchanged.
35. **Search text and the points pick survive a refresh, per tab (10/15/2026).** This is the user's decision. Room state already lives on the server; these two were plain React state and were lost on refresh. Both go to `sessionStorage` (`pp.search.query`, `pp.points.pick`), not `localStorage`, so two open tabs never overwrite each other. The points pick is tagged with the ticket key and round and is used only when both match during a reveal, so a new reveal or ticket never keeps a stale pick. Collapsed queue sections stay in `localStorage` (decision 32). No server or protocol change.
36. **Keep the production startup warning for missing identity header names (10/15/2026).** This is the user's decision. In production, when `IDENTITY_USER_ID_HEADER` and `IDENTITY_USERNAME_HEADER` are not both set, `index.ts` logs one warning at startup (`identityConfigWarning()` in `server/identity.ts`) naming the variables only, never values. Why: a deploy missing the header names otherwise rejects every user with 4401 and the logs give no hint. Dev and local runs never warn.
37. **Every branch push publishes an image; `:latest` stays main-only (10/15/2026).** This is the user's decision and refines decision 27. The `publish` job now runs on any branch push (not pull requests, not tags) and tags `:<short-sha>`, `:<branch>` (sanitized, `build/v1` becomes `build-v1`) and `:<branch>-<run-number>` (for example `build-v1-57`; the run number is GitHub's per-workflow run counter, and a re-run keeps the same number), so a branch can be tried on the hosting platform before it merges. `:latest` is enabled only on the default branch, because it is what the platform deploys and a branch must never overwrite it.
38. **UI redesign: slim header, two-column layout, two-line queue rows, ticket tabs, card-style players (10/16/2026).** This is the user's decision. Inside the published report the app's navy `AppBar` sat under the platform nav and wasted vertical space, and the panes and bottom bar used room poorly. The header is now one slim light row (queue controls left, title centered, status dot and username right), `Layout` has two columns at `lg+` (queue and main) with comments moved into a Description and Comments tab view, queue rows are two lines and clickable, the bottom bar is a `1fr auto 1fr` grid, and players render as avatars holding cards with outliers marked after reveal. Client only: no protocol, server or `shared/` change, and behavior of the queue, voting and saving is unchanged. Full design: [`docs/superpowers/specs/2026-10-16-ui-redesign-design.md`](../superpowers/specs/2026-10-16-ui-redesign-design.md). `03-client.md` describes the new components; the files under `reference/` and the mock are the earlier design and are not kept in sync.

39. **The queue pane is resizable, and the width is remembered per viewer (10/16/2026).** This is the user's decision and extends decision 38. The fixed one-third queue column was too narrow for long ticket titles for some viewers and too wide for others. At `lg+` a divider with a grip now sits between the panes: drag it, use the arrow keys, or double-click to reset. The width is clamped to 260px through half the row and stored in px in `localStorage` (`pp.layout.queueWidth`), so it is a per-browser convenience and never reaches the server. Below `lg` the layout still stacks with no handle. Client only. Described in `03-client.md` under Layout.

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
