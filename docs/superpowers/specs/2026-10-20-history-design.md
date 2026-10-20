# History: room pointing history and Jira ticket history

Date: 10/20/2026. Status: design approved in chat (mockups in the visual companion), spec awaiting review.

## Why

After a few rounds nobody remembers what the room already pointed, what the spread was, or
whether it was saved. And the ticket view shows the current state of a ticket but not how it got
there (status moves, re-estimates, reassignments). The user asked for both histories.

## Scope

Server (`server/game.ts`, `server/ws.ts`, `server/jira.ts`), protocol (`shared/protocol.ts`),
client (`QueuePanel`, `TicketView`, a new history list). No new client commands. No storage:
session history lives in memory like the rest of the room and is lost on restart.

## 1. Session history ("History" tab in the left pane)

### Data

```ts
// shared/protocol.ts
export interface SessionHistoryEntry {
  key: string;
  summary: string;
  issueType: string;
  average: number | null;   // from the revealed stats
  min: number | null;
  max: number | null;
  consensus: boolean;
  voters: number;           // players with a vote at reveal
  revoted: boolean;         // revealed more than once in this room
  savedPoints: number | null; // set when Save to Jira succeeds
  revealedAt: string;       // ISO time of the latest reveal
}
// Snapshot gains: history: SessionHistoryEntry[]  (newest first)
```

### Rules

- Recorded **on reveal**, only when a ticket is loaded. One row per ticket key: a later reveal of
  the same key replaces its stats, sets `revoted: true`, updates `revealedAt`, keeps
  `savedPoints`, and moves the row to the top.
- A successful **Save to Jira** sets `savedPoints` on that key's row, even when the save finishes
  after the room moved to another round or ticket (the save callback already holds the key).
- Capped at **50** rows; the oldest drop off.
- Same list for every viewer (no per-viewer data in it).
- Pure functions in `game.ts`: `recordReveal(state)` is applied inside `reveal`, and
  `markHistorySaved(state, key, points)` is called from the save callback in `ws.ts`.

### UI

- The left pane gets MUI tabs **Queue | History** with a count badge on History. The selected
  tab is remembered per browser tab (sessionStorage, existing `storage.ts` helpers).
- Each row reuses the two-line queue row style: line 1 = issue-type icon, key (Jira link that does
  not trigger the row), points box (`savedPoints`, or "–"); line 2 = "avg 6.5 · 3–13 · ✓ saved ·
  2m", with "consensus" instead of the range when everyone agreed and a "re-voted" marker when
  `revoted`.
- Clicking a row loads that ticket (existing `onPick` → `loadTicket`). The row for the ticket
  currently loaded is highlighted like the current queue row.
- Empty: "Nothing pointed yet in this room."

## 2. Ticket history (third tab: Description | Comments | History)

### Data

```ts
export interface TicketHistoryChange {
  field: string;            // Jira's display name, e.g. "status", "Story Points"
  from: string | null;      // fromString
  to: string | null;        // toString
  edited: boolean;          // true for long text fields: show "edited", not the values
}
export interface TicketHistoryEntry {
  id: string;
  author: string;           // displayName, "Unknown" when missing
  createdAt: string;
  changes: TicketHistoryChange[];
}
// Ticket gains: history: TicketHistoryEntry[] (newest first), historyTruncated: boolean
```

### Rules

- Everything Jira records is shown (user's choice): no field filter.
- Fetched in parallel with comments from `GET /rest/api/3/issue/{key}/changelog`
  (paginated, oldest first). Keep the **newest 100** entries: read `total` from the first page and,
  when it is over 100, fetch the last page(s) instead. `historyTruncated` is true when older
  entries were left out.
- `edited: true` (values dropped) for the Description and Environment fields, and for any value
  longer than 200 characters. Values are plain text, rendered as text (never as HTML).
- A failed or unreadable changelog fetch loads the ticket with an empty history and a debug log,
  exactly like comments today.

### UI

- Third tab "History" in `TicketView`, after Comments (no count badge; changelogs are long).
- One block per entry: initials avatar, author, relative time with the full date in a tooltip
  (same helpers as comments), then one line per change: `Field  old → new`, the old value struck
  through; "edited" for `edited` changes; "–" for a null side.
- "No history" when empty; a caption "Showing the latest 100 changes" when `historyTruncated`.
- The tab resets to Description on a new ticket, like today.

## Edge cases

- Reveal with no ticket loaded: nothing is recorded.
- Two tabs of the same viewer: same snapshot, nothing special.
- A ticket deleted or forbidden in Jira after it was pointed: clicking its history row shows the
  existing load error; the row stays.
- Very large changelogs: bounded by the 100-entry cap and the existing per-request timeout.

## Verification

No test suite by design. Gate: `npm run format && npm run lint && npm run tsc:check && npm run build`.
Browser check in dev with two `?devUser=` tabs (never click Save to Jira in dev): reveal twice
on one ticket (one row, re-voted), reveal on a second ticket (two rows, newest first), click a row
(loads it), History tab on a real ticket with a long changelog (newest first, truncation caption).

## Docs

`docs/spec/02-server.md` (state, reveal, save, Jira changelog), `docs/spec/03-client.md`
(left-pane tabs, ticket History tab), a decision-log entry.
