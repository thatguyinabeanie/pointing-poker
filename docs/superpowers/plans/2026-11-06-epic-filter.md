# Epic Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the room narrow the queue to one or more open epics, the same way the Type filter (decision 50) narrows it by ticket type.

**Architecture:** The selection is room state (`QueueSettings.epicKeys`), applied in the queue's JQL as `AND parent in (...)`, so the per-section cap and counts apply after filtering. The server lists the project's open epics (`Snapshot.epics`) and keeps only known keys, as it does for types. The client gets an Epic select after Type, sharing the Type menu's draft logic through one extracted hook.

**Tech Stack:** Fastify 5 + zod on Node 26 (type stripping), Vite React 19 + MUI 9, Biome.

**Spec:** the approved design in `/Users/gmendoza/.claude/plans/we-need-a-filter-spicy-sky.md` (approved by the user 11/05/2026). Its decision table is the authority:

| Question | Decision |
|---|---|
| Scope | Whole room. Stored in `QueueSettings`, applied in the Jira query |
| Selection | Several epics, checkbox menu like Type. Empty = all epics |
| Menu list | ~~Open epics of the project (not Done)~~ Replaced 11/06/2026 (Task 3): epics that have tickets needing points |
| "No epic" option | Not now |
| Placement | Header, after Type, before Refresh |

Branch: `hand-of-cards`, in the same PR as the hand-of-cards redesign (user, 11/06/2026). The empty local `epic-filter` branch is not used.

## Global Constraints

- No tests in v1 (decision 6). Never add test files or a test script. Verification is the gate, throwaway `node -e` checks, and the controller's browser check.
- Gate: `npm run format && npm run lint && npm run tsc:check && npm run build`, each command run on its own and unpiped.
- Server: erasable syntax only (no `enum`, no parameter properties, no `namespace`); relative imports carry `.ts`; read env only through `env()` inside functions; never log the Jira token.
- No message body carries a user identifier.
- Epic list JQL, verbatim: `project = <jqlQuote(key)> AND issuetype = Epic AND statusCategory != Done ORDER BY Rank ASC`.
- Queue clause, verbatim shape: `AND parent in (<keys through jqlQuote, ", "-joined>)`, next to `typeFilter`.
- `MAX_EPICS = 100`. Cache key `epics:${projectKey}`, through the existing `cacheGet` / `cachePut`.
- Zod: `epicKeys: z.array(z.string().trim().regex(/^[A-Z][A-Z0-9_]*-\d+$/i).max(64)).max(30).optional()`.
- Copy: label "Epic"; closed value "All epics", the one epic's name, or "N epics" (for example "2 epics"); `title` lists the full names, comma-separated.
- Decision log entry number: 52 (51 is the hand of cards). US dates (11/06/2026). No em-dashes in code comments or docs.
- Commits end with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01EiJnVkDqKJXWhptSWiELB5`
  Push after each commit. Never force-push, never push to `main`.

## Review Focus

1. **An epic is closed or deleted in Jira while it is selected.** The next list refresh drops it from the selection and refetches the queue once; the queue never loops on a Jira 400. (Task 1, Step 2 node check.)
2. **A project has no issue type named "Epic"** (Jira answers 400 to the list JQL). One warn log, the Epic menu is empty and disabled, the queue is unfiltered, and the Type filter still works. (Task 1, Step 4 and the controller's check.)
3. **Someone else changes the epic selection while my menu is open.** My draft is dropped on close, exactly as the Type menu does today. (Task 2, Step 1 keeps that logic byte-for-byte.)
4. **Type and Epic filters together.** The JQL carries both clauses, and section counts match the filtered list. (Task 1, Step 4 reads the built clause; the controller's browser check.)
5. **The header at 1200px with four selects.** One row at `lg`, long epic names truncated with the full list in `title`. (Task 2, controller's browser check.)

---

### Task 1: Server: list epics, store the selection, filter the queue

**Files:**
- Modify: `shared/protocol.ts` (`QueueSettings` ~89, `Snapshot` ~153)
- Modify: `server/jira.ts` (`JiraClient` interface ~38, new `listEpics` near `listIssueTypes` ~699, `searchQueue` clause ~768, `searchTickets` comment ~1119, returned object ~1156)
- Modify: `server/game.ts` (`GameState` ~36, `createInitialState` ~56, `setQueueSettings` ~299, new `setEpics` after `setIssueTypes` ~366, `viewFor` ~428)
- Modify: `server/ws.ts` (zod schema ~30-43, `fetchIssueTypes` ~285 and its seq ~166, call sites ~385, ~670, ~683)
- Modify: `server/app.ts` (~22-30, the unconfigured client)
- Modify: `docs/spec/02-server.md`

**Interfaces:**
- Produces (`shared/protocol.ts`): `QueueSettings.epicKeys: string[]` (epic issue keys; empty means all epics), and `Snapshot.epics: QueueEpic[]` (the menu list, in rank order). `QueueEpic` already exists (`key`, `name`, `color`).
- Produces (`server/jira.ts`): `listEpics(projectKey: string): Promise<Result<QueueEpic[]>>` on `JiraClient`.
- Produces (`server/game.ts`): `setEpics(state: GameState, epics: QueueEpic[]): Result`, and `setQueueSettings` accepts `partial.epicKeys`.
- Produces (`server/game.ts`, module-private): `keepKnown(selected: readonly string[], known: Iterable<string>): string[]`, deduplicated, in selection order. Both `setQueueSettings` (types and epics) and `setIssueTypes` / `setEpics` use it instead of their inline filters.
- Consumes: `searchIssues(jql, maxResults)`, `epicColors(keys)`, `jqlQuote`, `cacheGet` / `cachePut`, `sameNames` (`shared/constants.ts`).

- [ ] **Step 1: Protocol and game state.** Add the two fields. `GameState.epics: QueueEpic[]`, initially `[]`, exposed by `viewFor`. Initial `queueSettings.epicKeys` is `[]`. In `setQueueSettings`: keep only keys in `state.epics` (Jira answers 400 to `parent in (...)` with an unknown key), clear `epicKeys` and `epics` on a project change next to `issueTypes`, and add `epicKeys` to the `changed` check with `sameNames`. Write `setEpics` as the mirror of `setIssueTypes`: it drops selected keys no longer listed (an epic closed or deleted), and an empty list keeps the selection. Extract `keepKnown` and use it in all four places; keep the existing why-comments.

- [ ] **Step 2: Check the game rules.**

```sh
node -e 'import("./server/game.ts").then((g) => {
  const e = (k) => ({ key: k, name: k, color: null });
  let s = g.createInitialState({ defaultProjectKey: "CIVIS" });
  s = g.setEpics(s, [e("CIVIS-1"), e("CIVIS-2")]).state;
  s = g.setQueueSettings(s, { epicKeys: ["CIVIS-1", "CIVIS-9", "CIVIS-1"] }).state;
  console.log(s.queueSettings.epicKeys.join(","));
  s = g.setEpics(s, [e("CIVIS-2")]).state;
  console.log(s.queueSettings.epicKeys.length);
  s = g.setQueueSettings(s, { epicKeys: ["CIVIS-2"] }).state;
  s = g.setEpics(s, []).state;
  console.log(s.queueSettings.epicKeys.join(","));
  s = g.setQueueSettings(s, { projectKey: "OTHER" }).state;
  console.log(s.queueSettings.epicKeys.length, s.epics.length);
  s = g.setIssueTypes(s, ["Story", "Bug"]).state;
  s = g.setQueueSettings(s, { issueTypes: ["Bug", "Nope", "Bug"] }).state;
  console.log(s.queueSettings.issueTypes.join(","));
})'
```

Expected, five lines: `CIVIS-1`, `0`, `CIVIS-2`, `0 0`, `Bug`. The last line proves the Type rules did not change through `keepKnown`.

- [ ] **Step 3: `listEpics` in `server/jira.ts`.** Reuse `searchIssues` with the epic list JQL from Global Constraints and `MAX_EPICS`, then color the keys with `epicColors`; `name` is the epic's summary. Cache like `listIssueTypes`. A failed search (including Jira's 400 for a project with no "Epic" type) returns the failure; the caller decides. Add `listEpics: fail` to the unconfigured client in `server/app.ts`.

- [ ] **Step 4: Filter the queue.** In `searchQueue`, build an `epicFilter` next to `typeFilter` and append it to `clause`, so the board, no-board and count paths all filter the same way and the cap applies after filtering. Extend the existing comment to cite decision 52. `searchTickets` stays unfiltered: update its comment to say both filters are skipped and why (one person's lookup must find any ticket). Read the built clause back with a throwaway `node -e` or by reasoning, and paste the clause for `issueTypes: ["Bug"]`, `epicKeys: ["CIVIS-1", "CIVIS-2"]` into the report.

- [ ] **Step 5: Wire `server/ws.ts`.** Add `epicKeys` to the zod schema (Global Constraints). `fetchIssueTypes` and the new epic fetch differ only in the Jira call, the game setter, the selection field and the log label, so replace `fetchIssueTypes` with one factory, each fetcher keeping its own seq counter:

```ts
function filterListFetcher<T>(opts: {
  label: string; // "issue types" | "epics", used in the debug and warn logs
  load: (projectKey: string) => Promise<JiraResult<T[]>>;
  apply: (state: GameState, list: T[]) => game.Result;
  selected: (settings: QueueSettings) => string[];
}): () => Promise<void>
```

Use whatever the existing import names are for the Jira `Result` type and the game module. The body is today's `fetchIssueTypes`: stale-seq and project-change guard, warn on failure, apply, broadcast, and an awaited `fetchQueue()` when `sameNames` says the selection changed. `const fetchIssueTypes = filterListFetcher({...})` and `const fetchEpics = filterListFetcher({...})`. Call `fetchEpics` everywhere `fetchIssueTypes` is called today (bootstrap ~385, project change ~670, `refreshProjects` ~683), the same way each site calls `fetchIssueTypes`. Keep the existing comments that explain the awaited refetch and the unreported failures.

- [ ] **Step 6: `docs/spec/02-server.md`.** Document `listEpics` (JQL, cap, cache, colors), `QueueSettings.epicKeys` and `Snapshot.epics`, `setEpics` and the known-key rule, the queue clause, and `filterListFetcher`, next to the matching Type filter text.

- [ ] **Step 7: Gate, commit, push.** Gate expected: all four exit 0. Re-run the Step 2 check after the gate and paste both outputs into the report.

### Task 2: Client: the Epic select, the shared hook, and the decision

**Files:**
- Create: `client/src/useRoomMultiSelect.ts` (next to `useGameSocket.ts`)
- Modify: `client/src/components/QueueControls.tsx` (Type select ~85-158 switches to the hook; new Epic select after Type; `SELECT_FORM_SX` ~35)
- Modify: `client/src/App.tsx` (~234, pass `epics`)
- Modify: `docs/spec/03-client.md`, `docs/spec/08-decision-log.md`

**Interfaces:**
- Consumes: `Snapshot.epics: QueueEpic[]`, `QueueSettings.epicKeys: string[]` (Task 1); `epicHex(color)` from `client/src/lib/epicColors.ts`; `sameNames` from `shared/constants.ts`.
- Produces: `useRoomMultiSelect({ roomValue, resetKey, disabled, onSend }: { roomValue: string[]; resetKey: string | null; disabled: boolean; onSend: (next: string[]) => void }): { value: string[]; open: boolean; onOpen: () => void; onChange: (next: string[]) => void; onClose: () => void }`. `value` is the draft while open and `roomValue` while closed.
- Produces: `QueueControls` takes a new prop `epics: QueueEpic[]`.

- [ ] **Step 1: Extract `useRoomMultiSelect`.** Move the Type menu's draft logic out of `QueueControls.tsx` unchanged: the session captured at open, the `lastSent` / `sentFrom` refs and the effect that clears them when the room's value changes, send-once-on-close, dropping the draft when the room changed, and closing on a `resetKey` change or when `disabled` turns true. Keep every existing why-comment with the code it explains, worded for a generic selection. The Type select then uses the hook with `roomValue: settings.issueTypes`, `resetKey: settings.projectKey`, `onSend: (issueTypes) => onChangeSettings({ issueTypes })`. Behavior must not change; say in the report which lines moved verbatim and which were renamed.

- [ ] **Step 2: The Epic select.** After Type, before Refresh, the same structure as Type: label "Epic", `displayEmpty`, shrunk label, `multiple`, the closed value and `title` from Global Constraints (names resolved from `epics`, the key as the fallback for a key not in the list). Each menu row: a `Checkbox`, a small round color dot from `epicHex(epic.color)`, the epic name, and the key as secondary text. Disabled when `epics` is empty or `disabled`. The hook gets `roomValue: settings.epicKeys`, `resetKey: settings.projectKey`, `onSend: (epicKeys) => onChangeSettings({ epicKeys })`. Pass `epics={snapshot.epics}` from `App.tsx`.

- [ ] **Step 3: Header width.** From `lg` to `xl`, cap the four selects at 130px (`SELECT_FORM_SX`, today 160px) so one header row still fits at a 1200px layout. Leave a comment that the value was chosen to fit four selects and is checked in the browser; the controller measures it and may change it.

- [ ] **Step 4: Docs.** `08-decision-log.md` entry 52, "Epic filter (11/06/2026)", in the format of entry 50: the user's choices from the decision table, why it is in the JQL (cap and counts after filtering), why only known keys are kept (Jira 400), the project-change and closed-epic rules, the failed-list behavior, search stays unfiltered, the menu sends once on close through the shared hook, the 130px header cap, and that it shipped in the same PR as decision 51. Add a row to "Where each decision is specified" if entry 50 has one. `03-client.md`: the Epic select, `useRoomMultiSelect`, and the header widths, next to the Type select text.

- [ ] **Step 5: Gate, commit, push.** Gate expected: all four exit 0. Browser check (controller): the Epic menu lists the epics (see Task 3) with color dots; picking two and closing refetches once in both tabs; Type + Epic narrow together with matching counts; a project change clears the Epic filter and reloads the menu; search still finds tickets outside the selected epics; the header is one row at 1200px and 1440px and wraps cleanly at phone width.

### Task 3: The menu lists the epics that have tickets needing points

Why: the controller's browser check on 11/06/2026 found that CIVIS has more than 100 open epics. The first 100 by rank did not include the epics of the tickets in the queue (the "AWS Quick Sight" epics), so they could not be picked. The user chose (11/06/2026) to list only the epics that have tickets still needing points.

**Files:**
- Modify: `server/jira.ts` (`listEpics` and its JQL; `MAX_EPICS`)
- Modify: `server/ws.ts` (when the epic list is fetched)
- Modify: `docs/spec/02-server.md`, `docs/spec/03-client.md`, `docs/spec/08-decision-log.md` (decision 52)

**Interfaces:**
- Changes: `listEpics(settings: QueueSettings): Promise<Result<QueueEpic[]>>`. It takes the room's settings instead of a project key, because the list depends on the Type filter.
- Unchanged: `Snapshot.epics`, `QueueSettings.epicKeys`, `setEpics`, `keepKnown`, the queue's `parent in (...)` clause, and the whole client.

- [ ] **Step 1: New list query.** `project = <jqlQuote(key)> AND <the queue's needs-pointing clause with the Type filter, without the Epic filter> AND parent is not EMPTY ORDER BY Rank ASC`. Request only the `parent` field. Page through the results up to `MAX_EPIC_SCAN = 1000` tickets, so a large queue still finds every epic. Collect each distinct epic-level parent with the existing `parseEpic`, which skips a sub-task's story parent. Keep the order of first appearance, which is rank order. Color the epics with `epicColors`. Share the needs-pointing clause with `searchQueue` through one helper, so the two cannot drift apart. No cache: the list must follow the queue. Remove `MAX_EPICS` and the `issuetype = Epic` query.
- [ ] **Step 2: When it runs.** Fetch the epic list with every queue fetch, through the existing `filterListFetcher`, because the list changes when tickets are pointed and when the Type filter changes. Keep the stale guards. A selected epic whose tickets are all pointed drops out of the list, so `setEpics` drops it and the queue refetches once. That is wanted, because there is nothing left to point in it. Make sure this cannot loop: the second queue fetch yields the same list, and `sameNames` stops it.
- [ ] **Step 3: Docs.** Decision 52 says the user replaced "open epics of the project" on 11/06/2026, and why (more than 100 open epics in CIVIS, and the queue's epics missing). Update 02-server.md (the query, the scan cap, when it runs) and the menu text in 03-client.md. The menu is no longer disabled for a project with no "Epic" type. It is disabled when no ticket needing points has an epic.
- [ ] **Step 4: Gate, commit, push.** Gate expected: all four exit 0. Browser check (controller): the AWS Quick Sight epics appear in the menu and can be picked; the queue filters in both tabs; pointing the last ticket of a selected epic drops it from the menu and the queue widens.

### Task 4: Polish: the layout looks finished and stays stable in every state

Why: on 11/06/2026 the user looked at the app and said "things feel broken", then ruled "we need to make things look good and stable always". The controller's audit at a wide window found the following:
- At `lg` the Queue and Ticket cards stop where their content ends, leaving a large blank area. The old bottom bar used to hide it.
- While idle, the hand is a 50% ghost of light-gray outlines that reads as a rendering glitch.
- In the peek, each card covers the next card's top-center value, so only your raised card and ☕ show a number. The spec says the values read in the peek; the mock had the same flaw.
- The hand and the pill float over the ticket text with nothing behind them, so text runs right up to them and looks cluttered.

**Files:**
- Modify: `client/src/components/Layout.tsx`, `client/src/components/Hand.tsx`, `client/src/lib/handLayout.ts`
- Modify: `docs/spec/03-client.md`, `docs/spec/08-decision-log.md` (decision 51, a dated note on the user's 11/06/2026 polish ruling)

**Interfaces:** none change. `Hand` props, `data-hand-open`, `--floating-height` and `--floating-center` stay.

- [ ] **Step 1: Full-height panes at `lg`.** Each pane's card (the Paper inside the scroll area, or the pane itself, whichever draws the border) fills the height under the header (`PANE_MAX_HEIGHT`) instead of stopping at its content. Below `lg`, nothing changes.
- [ ] **Step 2: A steady hand.** Remove the 0.5 opacity. While disabled, the cards are solid white, their values use `text.disabled`, the cursor is the default, and nothing lifts. The toolbar gets `aria-disabled="true"` and a `title` of "Start a round to vote". It never hides, so nothing appears or disappears between idle, voting and revealed.
- [ ] **Step 3: Values in the peek.** In the closed peek, put each value at the card's top-left corner, the way a fanned hand of real cards shows its index: 11px bold with about 4px of padding. Raise `REST.dx` from 11 to 14 so the visible strip at the top of each card is wide enough for "0.5", "13" and "21". Compute the visible width from the pose and say it in a comment. The open arc keeps the centered 18px value. Re-run the Task 3 handLayout check from the hand-of-cards plan with the new `REST`: `fitStep` and `cardPose(…, true, …)` must not change.
- [ ] **Step 4: A backdrop behind the floating group.** Add a fade band behind the hand and the pill: a gradient from transparent to `background.paper`, `var(--floating-height)` plus 24px tall, fixed to the bottom of the window. At `lg` it spans the Ticket column (Layout already measures its box). Below `lg` it spans the window. Use `pointer-events: none` and put it below the floating group in the stacking order. Text then fades out before it reaches the cards, instead of running behind them.
- [ ] **Step 5: Docs.** Update 03-client.md (pane heights, the disabled hand, the corner index, the fade band, `REST.dx` 14). Add to decision 51 a dated note: the user's 11/06/2026 polish ruling replaces the spec's dimmed idle peek and its 11px step.
- [ ] **Step 6: Gate, commit, push.** Gate expected: all four exit 0. Browser check (controller), at the wide window and at 1200px, in idle, voting and revealed:
  - nothing looks broken
  - nothing shifts between states
  - the peek's values are readable
  - no text runs behind the hand or pill

### Task 6: The results move into the players strip

Why: on 11/06/2026 the user, looking at the floating results pill, said it "would be better if it was on the same bar as the names with point cards". This replaces spec decision D5 (a floating results pill) and the D6 layout (the hand peeking beside the pill).

**Files:**
- Rename: `client/src/components/ResultsPill.tsx` to `client/src/components/RoundResults.tsx`. The component becomes `RoundResults`, with the same props, and no longer renders as a floating card.
- Modify: `client/src/components/RoundControls.tsx`, `client/src/components/Players.tsx`, `client/src/App.tsx`, `client/src/components/Layout.tsx`
- Modify: `docs/spec/03-client.md`, `docs/spec/08-decision-log.md` (decision 51, a dated note)

**Interfaces:**
- `RoundResults({ round, stats, ticket, deck, disabled, jiraSave, onSave, onNext })`, the same props as `ResultsPill`. It keeps `usePointsPick`, the chart, "Avg · Median", the chip, Points, Save (`aria-label="Save to Jira"`, with the spinner) and Next (`{ type: "reset", clearTicket: true }`), all unchanged in behavior.
- `RoundControls` renders `RoundResults` in `revealed`, in place of the "Revealed" text, followed by Reset.
- The floating group holds only the hand, in every phase.

- [ ] **Step 1: Results in the strip.**
  - In `revealed`, the strip's right side reads, left to right: chart, "Avg · Median", chip, Points, Save, Next, Reset.
  - Compact controls fit the 52px strip: small size, a Points select about 32px tall, and no card frame, shadow or radius.
  - Below `lg` the strip wraps, so the results take their own row under the pills.
- [ ] **Step 2: Compact mode stays phase-independent.** This is decision 48's rule and the user's "stable always". The reserve becomes the revealed layout's width. Measure the widest revealed controls (Points "0.5", a three-bar chart, "Spread 13–21") and round up. The names then do not change between voting and revealed. The cost is that with many players the names switch to initials sooner; say so in a comment.
- [ ] **Step 3: The floating group is only the hand.** Remove the pill, the pill fade rule, and the below-`lg` stacking from Layout. Keep the hand centered on the Ticket column at `lg` (clamped 16px inside the window) and on the window below `lg`. Simplify the hand's room measurement only where the pill was the reason for it. Keep the measured-center rule, since the clamp can still move the hand.
- [ ] **Step 4: Docs.**
  - 03-client.md: replace the ResultsPill section with RoundResults in the strip, and update Layout, the floating group, the opacity exceptions and the stacking.
  - Decision 51 gets a dated note (11/06/2026) that the user moved the results into the strip, replacing D5 and the D6 "beside the pill" layout.
- [ ] **Step 5: Gate, commit, push.** Gate expected: all four exit 0.
  - Browser check (controller) after a reveal: the strip shows the results and Reset on one 52px row at `lg`; Points, Save and Next work; a changed vote updates the results live; the hand stays put when the round is revealed; names do not switch between full and initials at the reveal.
  - At phone width: the results wrap onto their own row.

### Task 5: Search the epics, with the queue's epics on top

Why: on 11/06/2026 the user asked for "a way to search for epics" and to show "epics in queue … at the top". Asked what goes below them, the user chose all the other open epics in the project.

**Files:**
- Modify: `shared/protocol.ts` (`QueueEpic`)
- Modify: `server/jira.ts`, `server/ws.ts`
- Modify: `client/src/components/QueueControls.tsx`
- Modify: `docs/spec/02-server.md`, `docs/spec/03-client.md`, `docs/spec/08-decision-log.md` (decision 52)

**Interfaces:**
- Changes: `QueueEpic` gains `inQueue: boolean`. `Snapshot.epics` lists the queue's epics first (`inQueue: true`, in rank order of first appearance, from the Task 3 scan), then every other open epic of the project (`inQueue: false`, `ORDER BY Rank ASC`). Each key appears once.
- Unchanged: `setEpics`, `keepKnown` (the known list is the whole union), the queue's `parent in (...)` clause, and `useRoomMultiSelect`'s send-once-on-close behavior.

- [ ] **Step 1: The open-epics list.** Query `project = <jqlQuote(key)> AND issuetype = Epic AND statusCategory != Done ORDER BY Rank ASC`, fetching `summary` only. Page it up to `MAX_OPEN_EPICS = 1000`. Cache it under `openEpics:${projectKey}` with the existing cache, because it does not follow the queue. If it fails (a project with no "Epic" type answers 400), log one warn and use only the queue's epics. `listEpics` returns the union, colored with one `epicColors` call.
- [ ] **Step 2: Effects.** A selected epic whose tickets are all pointed is still open, so it stays in the list and stays selected. The queue then shows no tickets for it. Remove the Task 3 rule that dropped it, and update its comments and docs. A closed or deleted epic still drops out.
- [ ] **Step 3: Search in the menu.** Keep the MUI `Select` as the closed control, so the header's width and the shared hook do not change. Inside the menu add:
  - A sticky search field at the top (placeholder "Search epics"). It filters by name or key, case-insensitive. Its `onKeyDown` stops propagation for everything except Escape, so typing never triggers the Select's type-ahead.
  - Two `ListSubheader` groups: "In the queue" and "Other open epics". A group with no matches is hidden.
  - Focus on the search field when the menu opens (`MenuProps.autoFocus: false`, focus the field).
  - Clearing the search when the menu closes.
  - Keeping selected epics visible and checked even when the search hides them, by always listing them (filter only the unselected rows).
  - An empty state, "No epics match", when nothing matches.
- [ ] **Step 4: Docs.** Decision 52 records the user's 11/06/2026 search request and the grouping choice. Update 02-server.md (the union, the cache, the failure path) and 03-client.md (the menu, search, groups).
- [ ] **Step 5: Gate, commit, push.** Gate expected: all four exit 0. Browser check (controller):
  - "Quick" finds both AWS Quick Sight epics under "In the queue".
  - A search for a key finds that epic.
  - Arrow keys and Enter work in the list after typing.
  - Escape closes the menu and sends the selection once.
  - The menu scrolls with the search field pinned at the top.
