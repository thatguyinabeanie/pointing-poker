# Pointing Poker: build plan

Run the steps in order unless a step says it can run in parallel. Do not start a step until the
previous step's acceptance checks pass, unless the step says otherwise.

## State at handoff

- `~/source/pointing-poker` has three commits: the scaffold, the shared deck and protocol types,
  and a minimal Fastify server with an MUI client shell.
- `package.json` is modified and not committed. `.dockerignore` is untracked.
- A dev boot of the scaffold has run and listened on port 3838. Re-verify in step 0.
- The three step 0 verifications are not recorded yet.
- The remote status of the repo was not checked at handoff.

## Summary

| Step | Goal | Model | Parallel? |
|---|---|---|---|
| 0 | Confirm scaffold boots; record three verifications | `[Sonnet 5.5]` | No |
| 1 | Promote reference modules; type check and lint pass | `[Sonnet 5.5]` x2 | Two agents in parallel |
| 2 | Server: env, identity, routes, ws, heartbeat | `[Sonnet 5.5]`, `[Opus]` for `ws.ts` only | Parts in parallel |
| 3 | Client: hook, App, theme, index.html | `[Sonnet 5.5]` x2 | Can run alongside step 2 |
| 4 | Local two-player smoke | Main session, with the user | No |
| 5 | Docker image smoke | `[Sonnet 5.5]` | Can run alongside step 4 |
| 6 | Docs: README, CLAUDE.md, docs/deploy.md | `[Haiku 5.5]` | Can run alongside step 5 |
| 7 | Feature branch and draft PR | Main session, with the user | No |
| 8 | Staging deploy checklist | User-driven | No |

Note on model split: the planning document assigned `game.ts`, `jira.ts`, and `identity.ts` to
Opus. This build plan uses Sonnet for them because they are promoted from `reference/` and need
no new design. Opus is used only for `ws.ts`. Change this if the user prefers otherwise.

## Step 0: confirm the scaffold and record three verifications

- **Goal:** Confirm the existing scaffold runs under Node 26. Record the answers that the
  planning document left open in `04-infra.md`.
- **Files touched:** `docs/spec/04-infra.md` (add the results; if the file already exists, add to
  it and do not replace it), `package.json` (only if a fix is needed).
- **Spec sections:** `04-infra.md` (verifications, production dist path). `01-overview.md`
  (stack).
- **Subagent:** `[Sonnet 5.5] scaffold check`. If the HMR fallback is needed, stop and bring it
  to the user. The fallback changes the design (see known risks).
- **Parallel:** No.
- **Acceptance:**
  - [ ] `node --version` prints `v26.x`.
  - [ ] `npm run dev` starts and the log shows `Server listening` on port 3838.
  - [ ] `npm run build` exits 0 and creates `dist/client/index.html`.
  - [ ] Production boot: copy the repo outside the repo tree, run `npm ci --omit=dev` there, set
        `NODE_ENV=production`, and start `node server/index.ts`. `curl -s -o /dev/null -w '%{http_code}' localhost:3838/`
        returns `200`, and `curl -s localhost:3838/api/status` returns `{"ok":true}`.
  - [ ] HMR: with `npm run dev` running and a browser open on the page, change a client file.
        The page updates without a reload, and the browser console shows no failed Vite HMR
        connection.
  - [ ] `04-infra.md` records: type stripping result; the production dist path answer (option a
        or b from the planning document); HMR result (fixed by the `reply.hijack()` hook in `server/routes/spa.ts`; `server.hmr.port` does not help).
  - [ ] Env example: the user runs `cp docs/spec/env-example.txt .env.example`. Claude Code cannot
        write `.env*` files in this repo, so this copy is the user's job. The source file lists
        variable names only, with no values.

## Step 1: promote reference modules

- **Goal:** Move the reference code into the repo, unchanged except where the repo's scaffold
  requires it. Type check and lint pass.
- **Files touched:** `shared/protocol.ts`, `shared/deck.ts`, `server/game.ts`, `server/jira.ts`,
  `client/src/components/*.tsx` (six files), `client/src/lib/estimate.ts`.
- **Spec sections:** `02-server.md` (sections 3 and 13: shared contract, scaffold conflicts).
  `03-client.md` (file map, components, estimate). `01-overview.md` (repo layout).
- **Subagents:** `[Sonnet 5.5] promote server modules` (game.ts, jira.ts) and
  `[Sonnet 5.5] promote client modules` (components, estimate.ts). The main session handles
  `shared/` after both finish: keep the scaffold's Biome-formatted `protocol.ts` and apply the
  reference `isNumericCard` to `deck.ts`.
- **Parallel:** The two subagents can run together. Shared types go after both.
- **Acceptance:**
  - [ ] `npm run tsc:check; echo "exit $?"` prints `exit 0`.
  - [ ] `npm run lint; echo "exit $?"` prints `exit 0`.
  - [ ] `grep -n "import" server/game.ts` shows only imports from `../shared/`. No I/O modules.
  - [ ] `grep -n "process.env" server/jira.ts` prints nothing. Config comes in through
        `createJiraClient`.
  - [ ] `shared/deck.ts` uses the reference `isNumericCard` from `02-server.md` section 3. The
        scaffold version accepts values such as `4` or `1.5`, which are not in the deck.
  - [ ] Every relative import in `server/`, `shared/`, and `client/src/` ends in `.ts` or `.tsx`
        as the file requires. Check with `grep -rn "from '\.\./shared/" server client/src`.
  - [ ] The commit message lists each file that differs from its reference copy, and why.

## Step 2: server

- **Goal:** A running Fastify server with HTTP routes, identity, the WebSocket endpoint, and
  heartbeat. The server builds its app through `buildApp` so it can be started or embedded.
- **Files touched:** `server/env.ts`, `server/log.ts`, `server/identity.ts`,
  `server/lib/proxy-identity.ts` (already in the repo),
  `server/routes/health.ts`, `server/routes/spa.ts`, `server/heartbeat.ts`, `server/ws.ts`,
  `server/app.ts`, `server/index.ts`, `server/sanitize.ts`.
- **Queue work (server):**
  - `server/env.ts` reads `JIRA_DEFAULT_PROJECT` (no default) and `JIRA_NEEDS_POINTING_LABEL`
    (default `needs-pointing`). `shared/constants.ts` (from the reference) holds the label default.
  - `server/jira.ts` gains: project search (`GET /rest/api/3/project/search`), boards for a project
    (`GET /rest/agile/1.0/board?projectKeyOrId=`), the board's filter id
    (`GET /rest/agile/1.0/board/{id}/configuration`), the queue search (`POST /rest/api/3/search/jql`,
    first 50), label removal (`PUT /rest/api/3/issue/{key}` with `update.labels remove`), and the ticket search
    (`POST /rest/api/3/search/jql`, exact key match or `text ~ "query*"`, top 10).
  - Queue JQL: `project = X AND statusCategory != Done`, plus
    `AND labels = needs-pointing` when the switch is on (labeled only), or
    `AND (labels = needs-pointing OR "Story Points" is EMPTY)` when it is off, plus `AND filter = <board filter id>` when a
    board is set, then `ORDER BY Rank ASC`.
  - `server/game.ts` stores the queue settings, the boards, the projects, and the queue. It stays
    pure: `ws.ts` fetches the data and hands it in.
  - `server/ws.ts` dispatches `setQueueSettings`, `refreshQueue`, `refreshProjects`, and
    `searchTickets`. Search results go back only to the sender, as `searchResults`. A project
    change reloads boards and the queue. After a successful save, with Clear label on save on, it
    removes the label and then refreshes the queue.
- **Ticket detail (server):**
  - `shared/protocol.ts`: `Ticket` gains `description` (sanitized HTML), `comments` (up to 50,
    oldest first), `assignee`, `priority`, and `labels`.
  - `server/jira.ts`: `getIssue` requests those fields and `expand=renderedFields`, so Jira returns
    HTML for the description and comment bodies.
  - `server/sanitize.ts` (new): `sanitize-html` allowlist. Attachment images are replaced by links.
    `sanitize-html` is a runtime dependency, so it goes in `dependencies`. The scaffold's
    `package.json` predates it, so install it explicitly first:
    `npm install sanitize-html && npm install -D @types/sanitize-html`.
- **Spec sections:** `02-server.md` (WebSocket protocol section 7, identity section 5, heartbeat
  section 8, logging section 9, error table section 10, and the scaffold conflicts in section 13).
- **Subagents:**
  - `[Sonnet 5.5] env, log, identity, proxy-identity`
  - `[Sonnet 5.5] health routes, spa routes, heartbeat, index.ts`
  - `[Sonnet 5.5] queue additions: jira.ts, game.ts, env.ts`
  - `[Sonnet 5.5] ticket detail: getIssue expansion, sanitize.ts`
  - `[Opus] ws.ts` (origin check, identity gate, registry, dispatch including the queue commands,
    staleness guards, close codes)
  - `[Sonnet 5.5] app.ts` after `ws.ts` merges
- **Parallel:** The first two subagents and the queue subagent run together. `ws.ts` waits for all three. `app.ts` waits for
  `ws.ts`.
- **Acceptance:**
  - [ ] `npm run tsc:check` and `npm run lint` exit 0.
  - [ ] `npm run dev` log has an `identity mode:` line.
  - [ ] `curl -s localhost:3838/api/status` returns `{"ok":true}`.
  - [ ] `curl -s -H 'X-User-Id: 1' -H 'X-Username: dev' localhost:3838/api/me` returns
        `{"userId":1,"username":"dev"}` (with `IDENTITY_USER_ID_HEADER=X-User-Id` and
        `IDENTITY_USERNAME_HEADER=X-Username` set for the check).
  - [ ] `curl -s -i localhost:3838/api/me` with no identity headers returns `401`
        (`02-server.md` section 6).
  - [ ] In the browser console on `http://localhost:3838/`, run
        `new WebSocket('ws://localhost:3838/ws').onclose = e => console.log(e.code)`
        with no dev identity set. Expect `4401`.
  - [ ] Bad origin closes with `1008`. From a shell, run
        `node -e "const W=require('ws');new W('ws://localhost:3838/ws',{headers:{Origin:'http://other.example',Host:'localhost:3838','X-User-Id':'1','X-Username':'dev'}}).on('close',c=>console.log(c))"`
        and expect `1008`. The `ws` package is already installed as a dependency of
        `@fastify/websocket`.
  - [ ] `grep -rn "process.env" server` shows only `server/env.ts`. The scaffold's `app.ts` and
        `index.ts` read it directly, which `02-server.md` section 13 flags.
  - [ ] `server/index.ts` has the hard-exit timer on SIGTERM, and `ws.ts` closes sockets with
        `1001` before shutdown (`02-server.md` section 8).
  - [ ] No file named `*.test.ts` exists under `server/`.
  - [ ] `grep -rn "search/jql\|project/search\|agile/1.0/board" server` shows each queue endpoint
        in `server/jira.ts` only.
  - [ ] Ticket detail: a description with a list, a link, a code block, and an image renders
        safely, and comments show oldest first.

## Step 3: client

- **Goal:** The single page works against the server: connects, shows the snapshot, sends
  commands, and reconnects.
- **Files touched:** `client/index.html`, `client/src/main.tsx`, `client/src/theme.ts`,
  `client/src/App.tsx`, `client/src/useGameSocket.ts`, `vite.config.ts` (root `client`,
  `build.outDir` `../dist` (the plugin appends `/client`), `emptyOutDir`, `base: '/'` per planning Verification step 4,
  `viteFastify` plugin). Queue work: `client/src/components/QueuePanel.tsx` (new),
  `client/src/components/TicketDescription.tsx` and `client/src/components/TicketComments.tsx` (new, replace TicketPanel; display only, no input),
  `client/src/components/ParticipantChips.tsx` (new, replaces ParticipantList; stats are inline in the bottom slot, so no StatsCard),
  `client/src/components/Layout.tsx` (new, LAYOUT C), and
  `client/src/App.tsx` (wires QueuePanel, TicketDescription, TicketComments, ParticipantChips, Deck, ActionBar and Layout, and builds the bottom slot inline, and sends the queue commands).
- **Spec sections:** `03-client.md` (section 3 hook, section 4 App wiring, section 5 main, theme,
  index.html, section 6 Vite config, section 7 UI states, section 8 accessibility, section 9
  acceptance checklist).
- **Branding:** apply the house-style theme from `07-branding.md` (`reference/client/src/theme.ts`).
  No custom CSS files.
- **Subagents:** `[Sonnet 5.5] useGameSocket.ts` and `[Sonnet 5.5] main, theme, index.html, App`, and `[Sonnet 5.5] QueuePanel, TicketDescription, TicketComments, ParticipantChips, and Layout`.
  The hook's return type is fixed in `03-client.md`, so the App agent can start in parallel.
- **Parallel:** Can run alongside step 2 once step 1 passes.
- **Acceptance:**
  - [ ] `npm run tsc:check` and `npm run lint` exit 0.
  - [ ] `npm run build` exits 0 and `dist/client/index.html` exists.
  - [ ] `http://localhost:3838/?devUser=alice` (with `ALLOW_DEV_USER=1` set by the user) shows
        the top bar with a Connected chip and "You are alice".
  - [ ] Without a dev identity, the page shows "open this inside the hosting platform" and does not keep
        retrying the socket (close code `4401` stops retries).
  - [ ] A killed server shows Reconnecting, and the page recovers when the server returns.
  - [ ] `grep -n "TextField" client/src/components/TicketDescription.tsx client/src/components/TicketComments.tsx` prints nothing. Manual key
        entry lives in QueuePanel, collapsed by default.
  - [ ] The queue list shows each item's key and summary.
  - [ ] Search: typing "dashboard" lists matches; typing a key finds that ticket.
  - [ ] `find client -name "*.css"` prints nothing. Styling comes from the theme.
  - [ ] Layout: at 1440px the three panes are visible with description and comments side by side;
        the bottom bar is always visible, one row, holding the participant chips, the deck, and the actions.

## Step 4: local two-player smoke

- **Goal:** The full round works with two people, against real Jira.
- **Files touched:** None, unless a bug is found.
- **Inputs needed from the user first:** a real Jira ticket key to read, a throwaway ticket
  for the Story Points write, and a throwaway ticket with the `needs-pointing` label for the
  queue checks. Ask before writing to Jira. The user fills in `.env` on their own
  machine. The build session must not read `.env`.
- **Subagent:** None. Run in the main session with the user.
- **Parallel:** Step 5 can run alongside this step.
- **Acceptance:**
  - [ ] Open `?devUser=alice` and `?devUser=bob` in two windows. Each shows the other as
        voted or not voted, with no card values.
  - [ ] Both vote, then reveal. Both windows show both cards and the stats.
  - [ ] The Save select defaults to the mode of the numeric votes, and a tie picks the higher value.
  - [ ] Save on the throwaway ticket. The Story Points value changes in Jira.
  - [ ] Close one window and reopen it as the same user. The vote is kept.
  - [ ] Edit a component file during `npm run dev`. The page updates without a reload.
  - [ ] Queue checks (two players, real Jira):
    - [ ] Alice and Bob see the same queue, in the same order.
    - [ ] Changing the project reloads the board list and the queue.
    - [ ] Turning the "Labeled only" switch off widens the queue to labeled or unpointed tickets; on narrows it to labeled tickets.
    - [ ] Picking a ticket from the queue loads it for both windows.
    - [ ] Saving removes the ticket from the queue, and removes the `needs-pointing` label from
          the ticket in Jira.

## Step 5: Docker image smoke

- **Goal:** The production image starts, serves the app, and reads identity from headers.
- **Files touched:** `Dockerfile` (new), `.dockerignore` (exists, check it), `.gitignore` (add
  `/dist`), `docs/spec/env-example.txt` (names only, including `JIRA_DEFAULT_PROJECT` and
  `JIRA_NEEDS_POINTING_LABEL`). The user copies it to `.env.example`.
- **Spec sections:** `04-infra.md` (Dockerfile stages, `.dockerignore`, `.env.example`). Until
  that file exists, the planning document's Dockerfile notes apply. `06-templates.md` for the
  template survey.
- **Subagent:** `[Sonnet 5.5] Dockerfile, .dockerignore, docs/spec/env-example.txt`.
- **Parallel:** Can run alongside step 4 and step 6.
- **Acceptance:**
  - [ ] Use `npm run image:build` and `npm run image:run` for the smoke (linux/amd64 image, `.env` passed when present).
  - [ ] `docker build -t pointing-poker .; echo "exit $?"` prints `exit 0`.
  - [ ] `docker run --rm pointing-poker ls -a` shows no `.env` file in the image.
  - [ ] `docker run --rm pointing-poker id -u` prints a non-zero uid (non-root user).
  - [ ] `docker run -d --rm --name pp-smoke -p 3838:3838 -e JIRA_BASE_URL=https://example.invalid pointing-poker`,
        then `curl -s localhost:3838/api/status` returns `{"ok":true}`. Retry until the log shows
        `Server listening`.
  - [ ] `curl -s -H 'X-User-Id: 1' -H 'X-Username: dev' localhost:3838/api/me` returns
        the user (with the container's `IDENTITY_*_HEADER` variables set to those names). The log shows `identity mode: proxy`, which `02-server.md` section 6 expects
        in production.
  - [ ] `docker stop pp-smoke`.
  - [ ] `docs/spec/env-example.txt` lists variable names only, with no values. It includes `ALLOWED_ORIGINS`,
        which the env table in `02-server.md` section 5 defines.

## Step 6: docs

- **Goal:** `README.md`, `CLAUDE.md`, and `docs/deploy.md` match what was built.
- **Files touched:** `README.md`, `CLAUDE.md`, `docs/deploy.md`. Start from the drafts in
  `docs/spec/drafts/` (`README.md`, `CLAUDE.md`, `deploy.md`), copied to the paths above.
- **Spec sections:** `04-infra.md` (deploy settings), `02-server.md` (env list).
- **Subagent:** `[Haiku 5.5] docs`.
- **Parallel:** Can run alongside step 5.
- **Fixes needed in the drafts:**
  - Remove the three TODO comments once steps 0 and 4 settle them: `README.md` (HMR port),
    `CLAUDE.md` (HMR port fallback), `docs/deploy.md` (`ALLOWED_ORIGINS` in `.env.example`).
  - `CLAUDE.md` gate ran `npm test`. The draft has it removed; check the copy has no test command,
    because the build has no test script (`02-server.md` sections 1 and 13).
- **Acceptance:**
  - [ ] `grep -rn "TODO" README.md CLAUDE.md docs/deploy.md` prints nothing.
  - [ ] Every script named in `CLAUDE.md` appears in `npm run` output.
  - [ ] Every env var named in the docs appears in `.env.example`.
  - [ ] No em-dashes in the docs.

## Step 7: create a feature branch and open a draft PR

- **Goal:** The repo `thatguyinabeanie/pointing-poker` already exists (public, personal space) and `main` is pushed. Create a feature branch and open a draft PR.
- **Files touched:** None.
- **Visibility:** public (changed from private, see decision 29 in `08-decision-log.md`).
- **Subagent:** None. Run in the main session.
- **Parallel:** No.
- **Acceptance:**
  - [ ] `gh repo view thatguyinabeanie/pointing-poker --json visibility,url` shows `PUBLIC`.
  - [ ] `git log --oneline -5` on `main` matches the local history.
  - [ ] `gh pr view --json isDraft,labels` shows `isDraft: true` and the label `> 90% ai generated`.
  - [ ] PR body is current and ends with the attribution line the session requires.
  - [ ] If the label is missing from the new repo, the user is told. The label is not created.

## Step 8: staging deploy checklist (user-driven)

The build session prepares this list. The user does the steps in the hosting platform.

- [ ] Container registry and build pipeline for the image chosen and set up (to be decided).
- [ ] GitHub repo secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` added, and the Docker Hub repo is public.
- [ ] Custom credential `JIRA_API_TOKEN` created (Atlassian email as username, API token as password).
- [ ] Platform service created, pulling the image from the registry. Settings from `docs/deploy.md` applied,
      including `replicas` and `maxReplicas` set to 1.
- [ ] `JIRA_BASE_URL` set on the service.
- [ ] Startup log says `identity mode: proxy`. `GET /api/me` returns the viewer.
- [ ] Service report opened in two browsers. A full round is played.
- [ ] One tab left idle for 90s keeps its socket.
- [ ] WebSocket Origin check passes behind the auth proxy. If not, `ALLOWED_ORIGINS` is set.
- [ ] Assets load at the service root. `base` changes only if the platform uses a path prefix.
- [ ] Add the `needs-pointing` label to 3 real tickets in Jira. Confirm all 3 appear in the
      queue with the switch on.

## Definition of done

- [ ] Steps 0 to 6 acceptance checks pass.
- [ ] `npm run lint`, `npm run tsc:check`, and `npm run build` pass. CI runs the same checks.
- [ ] The Docker image smoke passes.
- [ ] Step 4 ran with two people against a throwaway Jira ticket.
- [ ] The draft PR is open with the label, and its body matches the code.
- [ ] `04-infra.md` records the step 0 answers. No TODO comments remain in the docs.
- [ ] Step 8 checklist is handed to the user.

## Known risks

Taken from the planning document's step 0 assumptions and its Jira notes.

| Risk | Why it matters | If it fails |
|---|---|---|
| Node 26 runs `.ts` files directly | The server has no build step | Fall back to `tsx` or `tsup` and say so |
| `@fastify/vite` production dist path | Production may need `vite` at runtime | Option (a): drop `vite.config.ts` from the runner stage. Option (b): move `vite` and `@vitejs/plugin-react` to `dependencies`. Do not add a bundler |
| Vite HMR and `@fastify/websocket` both use the `upgrade` event | HMR may fail in dev | Already fixed: a dev-only `onRequest` hook in `server/routes/spa.ts` hijacks Vite's `vite-hmr` and `vite-ping` upgrades (`server.hmr.port` does not help; see `04-infra.md` V3). If it regresses, switch to `@fastify/static` plus a standalone Vite dev server that proxies `/api` and `/ws`, and tell the user |
| ALB 60s idle timeout | Idle tabs drop | 25s pings. Proxy timeouts set to 3600 as insurance |
| Origin check behind the auth proxy | The auth proxy may rewrite `Host` | Set `ALLOWED_ORIGINS` |
| Asset base path | The platform may mount under a prefix | Change `base` to `'./'` only if assets fail at the root |
| Single replica | Two instances split the rooms | Keep `replicas` and `maxReplicas` at 1 |
| On Demand scheduling | A sleeping container loses the room | Accepted in the plan. Switch to Always On if that is a problem |
| Jira write permissions | The planning document has no separate Jira permission note. Write-back uses the same token as reads, and the plan does not say whether that token can edit Story Points on every issue type | `02-server.md` section 10 covers 401 and 403 on load and 400 `field_not_editable` on save. Test on a throwaway ticket first |
| Story Points field lookup | The field name may differ or be missing | `JIRA_STORY_POINTS_FIELD` overrides the lookup. The plan says Story Points exists in the team's main project |
| Dev identity override | `?devUser=` must never work in production | Gated on `NODE_ENV` and `ALLOW_DEV_USER`. The Docker image sets `NODE_ENV=production` |
| Jira token for boards and labels | The queue reads projects and boards through the Agile API, and removes labels through the issue API. The token needs browse on projects and boards, and edit on issues (labels and Story Points) | Board calls fail with 401 or 403: the board list stays empty, and the project-only queue still works. Label removal fails: Story Points is still saved, but the ticket stays in the queue until someone removes the label |
| Label adoption | No ticket has `needs-pointing` yet. With the switch on (labeled only), the queue is empty. The team's main project has thousands of open unpointed tickets today | The team adds the label to the tickets it wants in the queue, or turns the switch off and scopes by board. Decide before launch |

## Resolved questions

The planning document left these open. They are decided, and the steps above reflect them.

1. **Repo visibility:** public (originally private; see `08-decision-log.md`), in the personal GitHub space (`thatguyinabeanie/pointing-poker`).
2. **Repo creation order:** the repo already exists, so no `gh repo create` runs. Step 7 creates a feature branch and a draft PR after steps 0 to 6.
3. **CI test step:** none. The build has no tests, so CI has no `test` step, and the `npm test`
   gate in CLAUDE.md is dropped (`02-server.md` sections 1 and 13).
