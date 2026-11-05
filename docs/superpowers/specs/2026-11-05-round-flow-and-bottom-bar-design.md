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
3. If `state.autoAdvance` is on, `state.round` still equals the saved round, and a next key was
   recorded, call the existing `loadTicket(nextKey)`. The round is checked again here, after the
   awaits, because someone may have reset or loaded a ticket while the save or the queue fetch
   was in flight.

It does not advance when:

- The save failed. The error toast shows, as today.
- The round changed mid-save.
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
`maxHeight` (140) and `overflowY` rules on the bar. `BOTTOM_BAR_FALLBACK_HEIGHT` is updated to
the new height. The `ResizeObserver` that publishes `--bottom-bar-height` stays, because it also
covers the stacked layout below `lg` and font differences.

### Players row (`Players.tsx`)

- **Left: player pills.** Each pill holds the avatar, the short name and a mini card. The card is
  a back while voted, a dashed outline while not voted, and the face-up value after the reveal,
  with outliers in the warning color, as today. The viewer's own pill has a bold name and the
  avatar ring, as today. Offline players stay dimmed.
- **Compact mode:** a `ResizeObserver` on the pills container compares the full pills' width
  with the space available. When they do not fit, every pill drops its name and shows only the
  avatar and card. The full name goes in `title` and in the card's `aria-label`. All pills switch
  together, so the row stays uniform. Compact mode is decided by measured width, not by a player
  count.
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

## Docs

- `docs/spec/08-decision-log.md`: entries 45 to 48, one each for changing votes after the reveal,
  auto-advance, the median, and the two-tier bar.
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
