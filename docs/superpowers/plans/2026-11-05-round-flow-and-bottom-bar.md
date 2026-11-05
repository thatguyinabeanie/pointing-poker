# Round Flow and Two-Tier Bottom Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let votes change after the reveal, add an Auto-advance room switch, show the median, and
replace the crowded bottom bar with a fixed-height two-tier bar.

**Architecture:** The server stays the source of truth. `server/game.ts` holds the pure state
changes (vote rule, history refresh, `autoAdvance`, `nextQueueKey`, `median`), and `server/ws.ts`
wires the post-save advance. The client reads everything from the snapshot. The bar becomes a
players row (`Players` + new `RoundSummary`) above the existing deck and actions grid.

**Tech Stack:** Node 26 (type stripping), Fastify 5, zod, React 19, MUI 9, Biome.

**Spec:** `docs/superpowers/specs/2026-11-05-round-flow-and-bottom-bar-design.md`

## Global Constraints

- No test files and no test script (decision 6). Each task is verified with the gate plus throwaway
  `node -e` checks and manual browser checks.
- Gate before every commit: `npm run format && npm run lint && npm run tsc:check && npm run build`.
- Server code is erasable syntax only (no `enum`, no parameter properties, no `namespace`).
- Relative imports carry explicit `.ts` / `.tsx` extensions.
- Failures are discriminated results (`{ ok: false, reason }`), not exceptions.
- Comments explain why, not what. No `*/` globs inside `/** */`.
- No new dependencies. Amber `#F1A137` is for Save only. Light mode only.
- Identity never comes from a message body. Never log the Jira token.
- Commit messages state the problem, the reasoning, and what was verified, and end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01EiJnVkyDGzL31TggqHznfq
  ```
- Push after every task's commit (`git push`). The branch is `round-flow-and-bottom-bar`.
- Docs are updated in the task that changes the behavior. Decision log entries are appended, never
  renumbered, dated 11/05/2026, and start with "This is the user's decision."

## Review Focus

1. **Compact-mode flicker.** If compact mode is decided by measuring the visible pills, dropping
   names makes them fit, so the row switches back to full, and that loops. It must be measured
   against a hidden full-width copy (Task 4, Step 2).
2. **A manual points pick wiped by a vote change.** Adding the suggestion as an effect dependency
   must still restore a stored pick for the same ticket and round (Task 1, Step 4 check).
3. **Auto-advance after a mid-save reset.** The round must be checked again after both awaits
   (the Jira write and `fetchQueue`), not only before (Task 2, Step 3).
4. **Saving the last queue ticket, or a ticket from search.** `nextQueueKey` returns `null` for
   the last key and the first key for an unknown one (Task 2, Step 2 check).
5. **Withdrawing every vote after the reveal.** The history row keeps its last values, and its
   `revoted` flag is not set (Task 1, Step 2 check).

---

### Task 1: Votes can change after the reveal

**Files:**
- Modify: `server/game.ts` (`vote`, new `refreshRevealedRow` next to `recordReveal`)
- Modify: `client/src/App.tsx:183` (deck `disabled`)
- Modify: `client/src/components/ActionBar.tsx:64-83` (re-suggest effect)
- Modify: `docs/spec/08-decision-log.md` (entry 45), `docs/spec/02-server.md`, `docs/spec/03-client.md`

**Interfaces:**
- Produces: `refreshRevealedRow(state: GameState): GameState`, exported from `server/game.ts`.
  It returns the same object when there is no ticket, no row for the ticket, or zero votes.

- [ ] **Step 1: Change `vote()` in `server/game.ts`**

  Accept `phase === "voting" || phase === "revealed"`. Keep `fail("not_voting")` for idle. After
  the `withPlayers` edit, pass the result through `refreshRevealedRow` when the phase is
  `revealed`, and through `autoRevealIfReady` otherwise. That function already ignores
  non-voting phases, but keeping the branch explicit documents the intent.

- [ ] **Step 2: Add `refreshRevealedRow(state)`**

  Recompute `average`, `min`, `max`, `consensus` from `summarize(state.players.values())` and
  `voters` from the players with a non-null vote. Replace the matching row in place (same index).
  Keep `revoted`, `savedPoints`, `revealedAt`. Return `state` unchanged when `ticket` is null,
  no row matches, or `voters === 0`. Add a why-comment: it does not use `recordReveal` because
  `recordReveal` marks any existing row as re-voted.

  Check (throwaway, not committed):
  ```sh
  node --input-type=module -e '
  import * as g from "./server/game.ts";
  let s = g.createInitialState();
  for (const id of [1,2]) s = g.join(s,{userId:id,username:"u"+id}).state;
  s = {...s, ticket:{key:"X-1",summary:"s",issueType:"Task",status:"To Do",url:"u",currentPoints:null,descriptionHtml:null,comments:[],assignee:null,priority:null,labels:[],history:[],historyTruncated:false}, phase:"voting"};
  s = g.vote(s,1,"3").state; s = g.vote(s,2,"5").state;   // auto-reveal fires
  console.log(s.phase, s.history[0].average, s.history[0].revoted);
  s = g.vote(s,2,"3").state;
  console.log(s.history[0].average, s.history[0].consensus, s.history[0].revoted);
  s = g.vote(s,1,"3").state; s = g.vote(s,2,"3").state;  // withdraw both
  console.log(s.history[0].average, s.history[0].voters);
  console.log(g.vote({...s, phase:"idle"},1,"3").ok);'
  ```
  Expected output:
  ```
  revealed 4 false
  3 true false
  3 1
  false
  ```

- [ ] **Step 3: Enable the deck during the reveal in `client/src/App.tsx`**

  `disabled={disabled || snapshot.phase === "idle"}` on `<Deck>`. Update the comment on `selected`
  if it still says "while voting" only.

- [ ] **Step 4: Re-suggest points when the votes move (`ActionBar.tsx`)**

  Compute `const suggestion = suggestPoints(stats, deck);` in the component body and add
  `suggestion` to the existing effect's dependency list (`[phase, ticketKey, round, suggestion]`).
  The effect body stays as is: a stored pick for this ticket and round wins, otherwise it sets
  the suggestion. Update the `biome-ignore` reason to say `stats` is still omitted, and that
  `suggestion` is in the list so a vote change after the reveal re-suggests.

  Manual check (in Task 5): pick a value by hand, then change a vote. The pick stays. Without a
  manual pick, the select follows the most common vote.

- [ ] **Step 5: Docs**

  - Decision 45 ("Votes can change after the reveal"): the reason (a split room could only move
    on), the toggle still applies, history refreshes in place without `revoted`, auto-reveal is
    unaffected, and suggestions follow unless picked by hand.
  - `02-server.md`: the vote rule and `refreshRevealedRow`.
  - `03-client.md`: the deck's disabled rule and the ActionBar re-suggest.

- [ ] **Step 6: Gate, commit, push**

  Run the gate. Expected: all four commands exit 0. Commit "Let votes change after the reveal"
  with the why. Push.

---

### Task 2: Auto-advance room switch

**Files:**
- Modify: `shared/protocol.ts` (`Snapshot.autoAdvance`, `ClientCommand` `setAutoAdvance`)
- Modify: `server/game.ts` (`GameState.autoAdvance`, `createInitialState`, `setAutoAdvance`,
  `nextQueueKey`, `viewFor`)
- Modify: `server/ws.ts` (schema entry, switch case, `saveEstimate`)
- Modify: `client/src/App.tsx` (header switch)
- Modify: `docs/spec/08-decision-log.md` (entry 46), `docs/spec/02-server.md`, `docs/spec/03-client.md`

**Interfaces:**
- Produces: `Snapshot.autoAdvance: boolean`;
  `ClientCommand` member `{ type: "setAutoAdvance"; enabled: boolean }`;
  `setAutoAdvance(state: GameState, enabled: boolean): Result`;
  `nextQueueKey(queue: QueueState, currentKey: string | null): string | null`.

- [ ] **Step 1: Room state and command**

  Add `autoAdvance: boolean` to `GameState` (comment: room-wide, kept across rounds, a restart
  turns it off), `autoAdvance: false` in `createInitialState`, `autoAdvance: state.autoAdvance` in
  `viewFor`, and `setAutoAdvance` (it just sets the field, with no reveal side effect). In `ws.ts`
  add `z.object({ type: z.literal("setAutoAdvance"), enabled: z.boolean() })` and a switch case
  that mirrors `setAutoReveal`.

- [ ] **Step 2: `nextQueueKey(queue, currentKey)` in `server/game.ts`**

  Flatten `queue.sections` in order to keys. If `currentKey` is in the list, return the first
  later key that is not `currentKey`, or `null`. If it is not in the list, return the first key,
  or `null` when empty.

  Check (throwaway):
  ```sh
  node --input-type=module -e '
  import { nextQueueKey } from "./server/game.ts";
  const it = (k) => ({ key:k, summary:"", issueType:"", status:"", url:"", epic:null });
  const q = { loading:false, error:null, fetchedAt:null, sections:[
    { id:"sprint-1", name:"S", kind:"active", total:2, items:[it("A-1"), it("A-2")] },
    { id:"backlog", name:"Backlog", kind:"backlog", total:1, items:[it("A-3")] } ] };
  console.log(nextQueueKey(q,"A-2"), nextQueueKey(q,"A-3"), nextQueueKey(q,"Z-9"),
    nextQueueKey({...q, sections:[]},"A-1"));'
  ```
  Expected: `A-3 null A-1 null`

- [ ] **Step 3: Advance after a successful save (`server/ws.ts` `saveEstimate`)**

  Record `const nextKey = game.nextQueueKey(state.queue, key);` next to `round` and `key`, before
  the Jira write. At the end of the `runAsync` block, after `await fetchQueue()`, add:
  if `state.autoAdvance && state.round === round && nextKey !== null`, then
  `await loadTicket(nextKey)`. Add a why-comment that the round is checked again here because a
  reset or ticket load can land during either await. Log
  `log.info({ key, nextKey }, "auto-advance")` before loading.

- [ ] **Step 4: Header switch in `client/src/App.tsx`**

  Add `onAutoAdvanceToggle` (same shape as `onAutoRevealToggle`, dispatching
  `{ type: "setAutoAdvance", enabled }`) and a second `FormControlLabel` + small `Switch` labeled
  "Auto-advance" right after Auto-reveal, with `sx={{ ml: 1, mr: 0, flexShrink: 0, whiteSpace: "nowrap" }}`.

- [ ] **Step 5: Docs**

  - Decision 46 ("Auto-advance after a save"): the reason, default off and why, the room-state
    shape, the next-ticket rule, and the cases where it does not advance.
  - `02-server.md`: state, command, `nextQueueKey`, and the post-save step.
  - `03-client.md`: the header switch.

- [ ] **Step 6: Gate, commit, push**

  Run the gate (exits 0). Commit "Add an Auto-advance room switch" with the why. Push.

---

### Task 3: Median in the reveal stats

**Files:**
- Modify: `shared/protocol.ts` (`Snapshot.stats.median: number | null`)
- Modify: `server/game.ts` (`summarize`)
- Modify: `docs/spec/08-decision-log.md` (entry 47), `docs/spec/02-server.md`

**Interfaces:**
- Produces: `Snapshot["stats"]` gains `median: number | null`. It is used by `RoundSummary` in
  Task 4.

- [ ] **Step 1: Add `median` to `summarize()`**

  Return `median: null` in the no-numeric branch. Otherwise sort a copy ascending, take the middle
  value (odd count) or the mean of the two middle values (even count), and round to one decimal
  the same way as `average`.

  Check (throwaway):
  ```sh
  node --input-type=module -e '
  import { summarize } from "./server/game.ts";
  const p = (...v) => v.map((vote, i) => ({ userId:i, username:"", connections:1, vote }));
  console.log(summarize(p("3","8","3","5","2","3","?")).median,
    summarize(p("3","5")).median, summarize(p("0.5","1","2")).median, summarize(p("?","☕")).median);'
  ```
  Expected: `3 4 1 null`

- [ ] **Step 2: Docs**

  Decision 47 ("Median in the reveal stats"): numeric votes only, the even-count rule, and that
  it is not on history rows. Update `02-server.md` where `summarize` and the stats shape are
  described.

- [ ] **Step 3: Gate, commit, push**

  Gate exits 0. The client compiles unchanged, since nothing reads `median` yet. Commit "Add the
  median to the reveal stats". Push.

---

### Task 4: Two-tier bottom bar

**Files:**
- Create: `client/src/components/RoundSummary.tsx` (the right side of the players row)
- Modify: `client/src/components/Players.tsx` (pills, compact mode, renders `RoundSummary`)
- Modify: `client/src/App.tsx` (the `bottom` slot becomes two rows)
- Modify: `client/src/components/ActionBar.tsx` (labels and widths)
- Modify: `client/src/components/Layout.tsx` (fixed bar height at `lg`)
- Modify: `docs/spec/08-decision-log.md` (entry 48), `docs/spec/03-client.md`

**Interfaces:**
- Consumes: `Snapshot["stats"]` with `median` (Task 3).
- Produces: `RoundSummary({ phase, stats, votedCount, connectedCount }: { phase: Phase; stats: Snapshot["stats"]; votedCount: number; connectedCount: number })`.
  `Players` keeps its current props (`players`, `phase`, `meId`, `stats`).

- [ ] **Step 1: `RoundSummary.tsx`**

  - **Idle:** render nothing.
  - **Voting:** `"{votedCount} of {connectedCount} voted"` (`body2`).
  - **Revealed:** a row of three parts.
    1. A bar chart (`role="img"`).
       - One bar per card in `DECK` order that is in `stats.counts`. Bars are 16px wide, the
         max height is 18px, and each bar's height is proportional to its count.
       - The card value goes under each bar as a 10px caption.
       - Bars are `primary.main` at 40% alpha, or `text.disabled` for non-numeric cards
         (use `isNumericCard`).
       - `aria-label` lists the counts, for example `"2: 1 vote, 3: 3 votes"`.
    2. Text: `Avg {average ?? "–"} · Median {median ?? "–"}`, bold numbers.
    3. One outlined small `Chip`:
       - `color="success"`, label "Consensus", when `stats.consensus`.
       - `color="warning"`, label `Spread {min}–{max}`, when `min !== null`.
       - Default color, label "No numeric votes", otherwise.
  - Walk `DECK` for order. Copy the existing comment from `Players.tsx` about why
    `Object.entries` can't be used.

- [ ] **Step 2: Rework `Players.tsx` into the players row**

  - **Layout:** a row with the pills on the left (`flex: 1`, `minWidth: 0`, `flexWrap: "nowrap"`,
    `overflow: "hidden"`) and `RoundSummary` on the right (`flexShrink: 0`). The vote count moves
    into `RoundSummary`. The old stats chips are removed.
  - **Pill:** an `li` with background `action.hover`, radius 16px, padding `3px 8px 3px 3px`,
    and gap 6px. It holds a 26px avatar, the short name (`caption`/13px, bold for me), and the
    mini card. The card keeps the current back, dashed, face-up and outlier styles and aria
    labels, but shows inline (18×24) instead of absolutely positioned. Keep the me ring,
    offline dimming (opacity 0.35), and `findOutliers`.
  - **Short name:** use the username as given, truncated with ellipsis at `maxWidth: 96`. No new
    helper is needed.
  - **Compact mode:**
    - Render a second, hidden copy of the full pills (`aria-hidden`, `visibility: hidden`,
      `position: absolute`, `height: 0`, `overflow: hidden`, `whiteSpace: nowrap`).
    - Attach a `ResizeObserver` to the visible pills container.
    - `compact = hiddenCopy.scrollWidth > container.clientWidth`.
    - In compact mode every pill hides its name and gets `title={username}`. The card's
      `aria-label` already carries the name.
    - Add a why-comment: it measures the hidden copy so that dropping names cannot flip the
      decision back, which would loop.
  - The row is a fixed `height: 44px`, with `borderBottom: 1px solid divider` and `pb: 1`.

- [ ] **Step 3: `App.tsx` bottom slot**

  The `bottom` becomes a column: `<Players …/>`, then the existing grid with an empty first cell
  (`<Box />`), `Deck`, and `ActionBar`. The grid becomes `gridTemplateColumns: { xs: "1fr", lg: "1fr auto 1fr" }`
  with `mt: 1`. Keep the `ActionBar` `justifySelf` box.

- [ ] **Step 4: `ActionBar.tsx` labels**

  - `RESET_LABEL.revealed` becomes `"Next"`.
  - The Save button text is `"Save"` with `aria-label="Save to Jira"`.
  - The points `FormControl` is `sx={{ minWidth: 96 }}`, with the label "Points".
  - Update the component comment, which says stats live in Players, to name `RoundSummary`.

- [ ] **Step 5: `Layout.tsx` fixed height**

  - Replace `BOTTOM_BAR_FALLBACK_HEIGHT = 88` and `BOTTOM_BAR_MAX_HEIGHT = 140` with
    `BOTTOM_BAR_HEIGHT = 148`. That is 12 + 12 padding, a 44px players row, an 8px gap, and
    68px for the deck row including the selected card's 4px lift, so a little slack is left.
  - On the `Paper`, use `height: { lg: BOTTOM_BAR_HEIGHT }` in place of `minHeight`,
    `maxHeight` and `overflowY`.
  - Keep the `ResizeObserver` and the CSS variable, and use `BOTTOM_BAR_HEIGHT` as the var
    fallback.
  - Rewrite the heights comment: the bar is a fixed height at `lg` so the panes never jump, and
    the players row goes compact instead of wrapping.

- [ ] **Step 6: Docs**

  - Decision 48 ("Two-tier bottom bar"):
    - Why: both sides overflowed and the bar jumped.
    - The choice of C over the strip and the rail, from full-page mockups.
    - Compact mode.
    - The fixed 148px height.
    - The relabeled actions.
  - `03-client.md`:
    - Rewrite the Bottom bar paragraph and the pane-height bullets (`BOTTOM_BAR_HEIGHT`).
    - Rewrite the `Players` section.
    - Add `RoundSummary.tsx` to the file map.
    - Update the `ActionBar` labels.

- [ ] **Step 7: Gate, commit, push**

  Gate exits 0. Commit "Split the bottom bar into a players row and a deck row" with the why.
  Push.

---

### Task 5: End-to-end browser check (controller)

**Files:** none (fixes found here go back to the owning task's files, with their own commit).

- [ ] **Step 1: Start a dev server with dev users**

  Run `ALLOW_DEV_USER=1 npm run dev`. If port 3838 is taken by the user's own dev server, ask
  the user before stopping it. Open tabs at `http://localhost:3838/?devUser=alice`,
  `?devUser=bob`, and others as needed, at a 1440px-wide window. Jira-dependent checks (queue,
  save, auto-advance) need the user's `.env`. If Jira is not configured, report those checks as
  not run.

- [ ] **Step 2: Run the spec's Verification list**

  Every bullet in the spec's Verification section, plus Review Focus items 1 and 2. Expected
  results:
  - The bar height is identical (148px at `lg`) in idle, voting and revealed.
  - 12 or more users switch the pills to avatars only, with no flicker while the window is
    resized.
  - A manual points pick survives a vote change.

- [ ] **Step 3: Report**

  List each check as passed, failed (with what was seen), or not run (with why).

---

### Task 6: Tint epic chips with their epic color (added 11/05/2026, runs before Task 5)

The user asked for the epic chips on queue and search rows to have a background color so they
separate from the white row. The user picked a tint of the epic's own color over a neutral gray.

**Files:**
- Modify: `client/src/components/TicketRowFrame.tsx:79-107` (the epic chip `Stack`)
- Modify: `docs/spec/08-decision-log.md` (entry 49), `docs/spec/03-client.md` (the epic chip description)

**Interfaces:**
- Consumes: `epicHex(color: EpicColor | null): string` from `client/src/lib/epicColors.ts` (unchanged).

- [ ] **Step 1: Tint the chip**

  In the chip's `sx`, compute `const hex = epicHex(epic.color)` once for the chip and the dot.
  Set `bgcolor: alpha(hex, 0.12)` (`alpha` from `@mui/material/styles`) and change the inset
  outline to `inset 0 0 0 1px ${alpha(hex, 0.5)}`. Keep it an inset `boxShadow` so the row height
  is unchanged. The dot and the name text are unchanged, and the text stays `text.primary`. An
  epic with no Jira color gets the gray tint from `NO_COLOR_HEX` through `epicHex`, with no
  special case. Update the inset-shadow comment so it still explains the height reason.

- [ ] **Step 2: Docs**

  - Decision 49 ("Epic chips are tinted with the epic color"): the reason (the outlined chip
    blended into the white row), the 12% fill and 50% outline, and that it applies wherever
    `TicketRowFrame` shows an epic (queue and search rows; session history rows show no epic).
  - `03-client.md`: update the epic chip description.

- [ ] **Step 3: Gate, commit, push**

  The gate exits 0. Commit "Tint epic chips with their epic color" with the why. Push.
