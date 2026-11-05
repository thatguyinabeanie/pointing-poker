# Round flow and two-tier bottom bar

## Why

The user's feedback on 11/05/2026 covered three problems:

- After a reveal with no consensus, the room had no way to adjust. The only action was
  "Next ticket", which cleared the ticket. The user chose to let people change their vote after
  the reveal instead of adding a Re-vote button.
- Every ticket ended with a manual pick from the queue after saving. The user chose an
  "Auto-advance" room switch, next to Auto-reveal, that loads the next queue ticket after a
  successful save.
- The bottom bar felt crowded. At a 1440px laptop width the 11-card deck takes about 640px, so the
  players column and the actions column each get about 350px. After a reveal both overflow: the
  stats chips wrap on the left, and the points select, Save to Jira and Next ticket wrap on the
  right. The bar then grows to its 140px cap and scrolls, so the panes above jump. The user
  flagged the players and stats side, the actions side, and the height jump. The deck was fine.

The user also asked to see the median next to the average.

The layout was picked from three full-page mockups (a players strip above the ticket, a players
rail beside it, and a two-tier bar). The user chose the two-tier bar.

## Scope

1. Votes can change after the reveal.
2. Auto-advance room switch.
3. Median in the reveal stats.
4. Two-tier bottom bar with a fixed height.
5. Ticket type filter as a shared room setting (added 11/05/2026).

Out of scope: a Re-vote button, the median on session history rows, a "changed after reveal"
marker on cards, an observer role, and any change to how suggested points are picked (the most
common vote, ties to the higher card).

## 1. Changing votes after the reveal

### Server (`server/game.ts`)

- `vote()` accepts a vote when `phase` is `voting` or `revealed`. It still fails with
  `not_voting` when idle. The toggle is unchanged: voting the selected card again withdraws it,
  after the reveal too.
- `autoRevealIfReady` already returns early unless the phase is `voting`, so a vote after the
  reveal never reveals again.
- A vote during `revealed` refreshes the ticket's session history row in place. This is a new
  helper next to `recordReveal`, for example `refreshRevealedRow(state)`. It recomputes
  `average`, `min`, `max`, `consensus` and `voters` from the current votes, and keeps `revoted`,
  `savedPoints` and `revealedAt`. It must not go through `recordReveal`, because that sets
  `revoted` to true whenever a row already exists. If the votes drop to zero, the row keeps its
  last values. This matches `recordReveal`, where an empty reveal records nothing. The helper
  returns the same state object when there is no ticket or no row, so callers can skip work.
- Exception (added in the final review on 11/05/2026): when the reveal was empty (zero votes
  before this vote), the vote goes through `recordReveal` instead. The empty reveal wrote no
  row, so a refresh would find nothing to update and the vote would never reach History. With
  `recordReveal` the vote creates the row, or marks an existing row from an earlier round
  re-voted, the same way a fresh reveal would. Later votes in the same reveal refresh that row
  in place.
- Someone who joins during the reveal can vote. This needs no change: `join` adds the player and
  `vote` accepts them.
- The `jiraSave` status is left as is. A save that already happened stays saved, and Save stays
  available to save again.

### Client

- `App.tsx` disables the deck only when disconnected or idle:
  `disabled || snapshot.phase === "idle"`.
- Stats, outlier marks and the bar chart come from each snapshot, so they follow vote changes
  with no extra code.
- `ActionBar.tsx` re-suggests points when the suggestion changes during a reveal. Today the effect
  runs only on a phase, ticket or round change (`stats` is left out on purpose so a manual pick
  survives). Add the computed suggestion (`suggestPoints(stats, deck)`) as a dependency. When it
  changes and no manual pick is stored for this ticket and round (`pp.points.pick`), set
  `points` to the new suggestion. A stored manual pick for this ticket and round always wins.

## 2. Auto-advance

### Room state

- `GameState.autoAdvance: boolean`, default `false`, in `createInitialState`. `newRound` spreads
  state, so the setting survives rounds and tickets. Only a server restart turns it off.
- `Snapshot.autoAdvance` in `viewFor`, the same for every viewer.
- New command `{ type: "setAutoAdvance"; enabled: boolean }` in `ClientCommand`, a zod schema
  entry in `server/ws.ts`, and `game.setAutoAdvance(state, enabled)`.
- The default is off because with it on, a room that just saved jumps away from the results.
  The user accepted this default.

### Picking the next ticket

When Save is accepted (`saveEstimate` in `server/ws.ts`, before the Jira write starts), the
server records the next key from the current `state.queue`:

- Flatten `queue.sections` in order (active sprints, future sprints, backlog) into one key list.
- If the current ticket's key is in the list, the next key is the first entry after it that is
  not the current key.
- Otherwise (the ticket came from search or history), the next key is the first entry.
- No entries means no next key.

This is a pure function in `server/game.ts`, for example `nextQueueKey(queue, currentKey)`, so
the order rule lives in one place.

### After the save

In the existing `runAsync` block, after a successful write in the same round:

1. `markSave` and `markHistorySaved` run and the room is broadcast, as today. Everyone sees the
   "Saved N pts by name" toast.
2. `fetchQueue()` runs, as today.
3. If `state.autoAdvance` is on, `state.round` still equals the saved round, no ticket load is
   waiting on Jira (`loadsPending === 0`), and a next key was recorded, call the existing
   `loadTicket(nextKey)`. The round is checked again here, after the awaits, because someone
   may have reset or loaded a ticket while the save or the queue fetch was in flight. A load
   that has not finished yet has not changed the round, so the room-level `loadsPending`
   counter (shared by every socket, next to `loadSeq`) covers it; without it the advance would
   start later, take a newer `loadSeq`, and drop the player's load.

It does not advance when:

- The save failed. The error toast shows, as today.
- The round changed mid-save, or a ticket load is still in flight.
- A newer save was accepted after this one (the room-level `saveAttempt` counter), whether it is
  still pending or already failed. Added after the PR review on 11/05/2026: the write lock is
  released before the queue refetch, so a second Save can start during it, and an older save
  that advanced then would move the room under the newer write.
- No next key was recorded (empty queue). The room stays on the revealed ticket.
- The switch is off.

If `loadTicket` fails, the room stays where it is, and the existing load error goes to the
socket that saved. That is the socket that ran the command, so `loadTicket`'s existing error path
already reports it there.

### Client

`App.tsx` adds a second `FormControlLabel` + `Switch` labeled "Auto-advance" in the header
controls, right after Auto-reveal, wired the same way (`dispatch({ type: "setAutoAdvance",
enabled })`).

## 3. Median

- `summarize()` in `server/game.ts` adds `median: number | null` to the stats. It uses numeric
  votes only and is null when there are none. With an odd count it is the middle value. With an
  even count it is the mean of the two middle values. It is rounded to one decimal like `average`.
- `Snapshot.stats` in `shared/protocol.ts` gains `median`.
- `recordReveal` and the new history refresh keep using `summarize`. Session history rows do not
  store or show the median.

## 4. Two-tier bottom bar

### Structure

The bar (the `bottom` slot in `Layout`) has two rows inside the existing `Paper`:

1. **Players row:** `Players` (reworked). Fixed height 44px, with a 1px divider under it.
2. **Deck row:** the current `1fr auto 1fr` grid, with an empty left cell, `Deck` in the center
   and `ActionBar` on the right.

The bar has one fixed height in every phase. `Layout.tsx` drops the `minHeight` (88),
`maxHeight` (140) and `overflowY` rules on the bar. `BOTTOM_BAR_HEIGHT` (148) is the new fixed
height. The `ResizeObserver` that publishes `--bottom-bar-height` stays, because it also
covers the stacked layout below `lg` and font differences.

### Players row (`Players.tsx`)

- **Center: player pills.** The row uses the deck row's `1fr auto 1fr` grid at `lg`: an empty
  left cell, the pills in the center column so they sit centered over the deck, and the summary
  in the right cell. Below `lg` the pills and the summary stack, centered, and both wrap onto
  more lines instead of clipping or scrolling the page (PR review, 11/05/2026); only the
  fixed-height row at `lg` clips the pills. (Changed at the user's
  request on 11/05/2026; the first version had the pills left-aligned.) Each pill holds the
  avatar, the short name and a mini card. The card is a back while voted, a dashed outline while
  not voted, and the face-up value after the reveal, with outliers in the warning color, as
  today. The viewer's own pill has a bold name and the avatar ring, as today. Offline players
  stay dimmed.
- **Compact mode:** a hidden copy of the full pills (names always shown) is measured against the
  width the center column can take while staying centered: at `lg`,
  `rowWidth - 2 * Math.max(summaryWidth, SUMMARY_RESERVED_WIDTH) - 2 * columnGap`, and below
  `lg` the row width. The summary is counted on both sides so the pills stay centered on the
  deck instead of drifting left (the user's request on 11/05/2026). `SUMMARY_RESERVED_WIDTH`
  (400px) is a typical revealed summary (a 5-card chart, "Avg 4.5 · Median 4.5", a "Spread
  13–21" chip, measured at 390.4px and rounded up). It makes compact mode the same in both
  phases (the user's decision on 11/05/2026, after 7 players at 1440px showed names while
  voting and dropped them at the reveal): a team that fits keeps its names in both phases, and
  a team that does not is compact in both. The hidden copy sits in an absolutely positioned,
  clipped box (`inset: 0`, `overflow: hidden`, `pointer-events: none`) so it never widens the
  page. One `ResizeObserver` watches the row, the summary and the hidden copy. When they do not fit, every pill drops its name and shows only the avatar and
  card. The full name goes in `title` and in the card's `aria-label`. All pills switch together,
  so the row stays uniform. Compact mode is decided by measured width, not by a player count.
- **Right, while voting:** "N of M voted" (connected players), as today.
- **Right, after the reveal:**
  - A mini bar chart. There is one bar per voted card, in deck order. Height is proportional to
    the count. The card value is printed under each bar. "?" and "☕" bars are gray. The chart
    has a `role="img"` with an `aria-label` listing the counts, for example "2: 1 vote, 3: 3
    votes".
  - **Avg N · Median N**, with "–" for null values.
  - One chip. It is a green outlined **Consensus** when `stats.consensus` is true. Otherwise it
    is a warning-outlined **Spread min–max**. With no numeric votes it is a default outlined
    **No numeric votes**.
  - This replaces today's per-card count chips and the Consensus or No consensus chip.
- **Right, while idle:** empty.

### Actions (`ActionBar.tsx`)

- Voting: **Reveal**, **Reset**, unchanged.
- Revealed: the points select narrows to about 96px with the label "Points". Then **Save**
  (renamed from "Save to Jira", still the only amber control) and **Next** (renamed from "Next
  ticket").
- Idle: **Start round**, unchanged.
- The `aria-label` on Save stays "Save to Jira" so screen readers keep the full meaning.
- At `lg` the action row never wraps (`flexWrap: { xs: "wrap", lg: "nowrap" }`): at a 1200px
  layout "Next" wrapped and overflowed the 148px bar by 19px. Between `lg` and `xl` the deck
  gap is 4px, the cards' side padding 8px, the deck row's column gap 8px and the action
  buttons' side padding 12px, so the right cell (272px at 1200px) holds the revealed row with
  the Save spinner (256px). The empty left cell of the deck row is hidden below `lg`.

## 5. Ticket type filter

The user asked on 11/05/2026 for a way to filter the queue by ticket type. The user chose a
shared room filter applied in the Jira query (complete results) over a per-viewer filter in the
browser, and approved moving the two room switches to the header's right side.

### Protocol and room state

- `QueueSettings.issueTypes: string[]`. Empty means all types. `createInitialState` sets `[]`.
- `GameState.issueTypes: string[]` is the project's type names for the menu (not the
  selection). It defaults to `[]`, is set by `setIssueTypes(state, types)`, and is sent as
  `Snapshot.issueTypes` by `viewFor`. `setIssueTypes` also drops selected names that are not in
  `types`, so a type renamed or deleted in Jira cannot stay in the selection and fail every
  queue fetch with a 400. An empty `types` keeps the selection (PR review, 11/05/2026).
- `setQueueSettings` accepts `issueTypes` in the partial. It keeps only names that are in
  `state.issueTypes`, without repeats, because Jira answers 400 to `issuetype in (...)` with an
  unknown name. A selection with the same names in another order is not a change.
- A project change sets `issueTypes` to `[]` and clears the type list, in the same place that
  clears `boardId` and `boards`, because each project has its own types.
- The `setQueueSettings` zod schema in `ws.ts` gains
  `issueTypes: z.array(z.string().trim().min(1).max(64)).max(30).optional()`.

### Jira (`server/jira.ts`)

- `listIssueTypes(projectKey)` calls `GET /rest/api/3/project/{key}` and returns the distinct
  `issueTypes[].name` values in Jira's order. It is cached for 10 minutes per project like the
  boards, and a bad shape returns `jira_error`.
- `searchQueue` appends ` AND issuetype in ("A", "B")` to the needs-pointing `clause` when
  `settings.issueTypes` is not empty. That one place covers the board path, the no-board path
  and the `approximateCount` call, so the per-section cap and the counts apply after filtering.
- `searchTickets` is not filtered. Search is one person's lookup and must still find any ticket.

### Socket wiring (`server/ws.ts`)

- `fetchIssueTypes()` runs wherever the boards are fetched for a project: at bootstrap, on a
  project change, and in `refreshProjects`. It has its own sequence counter and the same
  project guard as the boards fetch, so a stale project's list is dropped. The result is
  applied with `setIssueTypes` and broadcast.
- A failed fetch logs one warn line and leaves the list as it was (empty after a project
  change). The menu is then disabled and the queue unfiltered. The user gets no error.
- Any effective `issueTypes` change refetches the queue, like a board change. That includes a
  change made by `setIssueTypes` when the refreshed list no longer has a selected name: the
  helper compares the selection before and after with `sameNames` and then awaits
  `fetchQueue()`.

### Client

- `QueueControls.tsx` adds a "Type" `Select multiple` after Board (`minWidth` 110 at `xs` and
  140 from `sm` like Project and Board, `maxWidth` 220), with `displayEmpty` (MUI then notches the outline) and a shrunk label. `renderValue` shows "All
  types" for an empty selection, otherwise the names joined with ", ", truncated with an
  ellipsis by the select's own styles. Each `MenuItem` holds a `Checkbox` and the type name. The
  menu edits a local draft while open (controlled `open`, the draft starts from
  `settings.issueTypes`), and closing it calls `onChangeSettings({ issueTypes: draft })` once,
  only when the draft differs as a set. Sending on every click lost clicks that landed before
  the previous snapshot and refetched the room's queue per click (found in the final review).
  It is disabled when disconnected or when the type list is empty.
- `Header` gains an `actions` prop, rendered in the right column before the status dot in a
  flex row with gap 1. `App.tsx` moves the Auto-reveal and Auto-advance switches from
  `controls` into `actions`, so the left column holds only Project, Board, Type and Refresh.
  Both switches are one small `RoomSwitch` component (label, checked, disabled, onToggle).
- Header layout (final review, 11/05/2026): one row needs about 1060px (controls 484px, title
  132px, switches and status about 380px, plus padding and gaps), so below `lg` the header is
  two rows: the controls, then the switches, status dot and name. From `lg` it is the one
  48px row with the title centered. The review ruled the break at `md`, but one row cannot fit
  at 1024px, and `Layout` only needs the fixed height at `lg`.

## Docs

- `docs/spec/08-decision-log.md`: entries 45 to 48, one each for changing votes after the reveal,
  auto-advance, the median, and the two-tier bar, and entry 50 for the ticket type filter.
- `docs/spec/02-server.md`: the vote rule, the history refresh, `autoAdvance`, `nextQueueKey`,
  the post-save advance, and `median`.
- `docs/spec/03-client.md`: the bottom bar, `Players`, `ActionBar`, the deck's disabled rule,
  and the header switch.

## Verification

There are no tests (decision 6). Verification is:

1. `npm run format && npm run lint && npm run tsc:check && npm run build`.
2. Manual checks in the browser at 1440px with two or more dev users (`?devUser=` with
   `ALLOW_DEV_USER=1`):
   - Vote, reveal, then change a vote. The stats, chart, chip and outlier marks update for
     everyone. The session history row updates and is not marked re-voted.
   - Withdraw every vote after the reveal. The history row keeps its last values.
   - With Auto-advance on, save. The toast shows, then the next queue ticket loads.
   - With Auto-advance off, save. The room stays on the revealed ticket.
   - With Auto-advance on, save the last queue ticket. The room stays on the revealed ticket.
   - Load another ticket while a save is in flight. There is no advance.
   - Join 12 or more dev users. The pills switch to avatar-only, and the bar height does not
     change.
   - The bar height is the same in idle, voting and revealed.
   - Pick two types in the Type menu. The queue refetches for everyone with only those types,
     and the closed select lists them. Clear the selection and it reads "All types".
   - Change the project. The Type selection clears and the menu lists the new project's types.
   - With a type filter on, search finds a ticket of a hidden type.
