# Round UX: epics, auto-reveal, changing a vote after reveal, a 0.5 card

Date: 10/20/2026. Status: designed in chat (epic placement picked from a mockup), spec awaiting review.
Builds after the history branch (`feat/history`, PR #3) merges, because both touch `game.ts`,
`ws.ts`, `jira.ts`, `shared/protocol.ts`, `QueuePanel` and `TicketView`.

## 1. Epic on tickets

- The epic is the ticket's Jira **parent** when the parent's issue type is Epic (Jira's unified
  `parent` field). Shown as `epic: { key: string; name: string } | null` on both `QueueItem`
  and `Ticket`. Sub-tasks (parent is a story or task) show no epic chip.
- Server: add `parent` to the fields requested for queue, search and ticket loads; map
  `parent.fields.summary` → `name`, `parent.key` → `key`, only when
  `parent.fields.issuetype.name` is "Epic" (case-insensitive). Missing or unreadable → `null`.
  No extra request per ticket.
- UI (mockup A): a small tinted chip with a square marker and the epic name, ellipsized at about
  110px, full name in a tooltip.
  - Queue and search rows: on line 1, right after the key.
  - Ticket view: in the small top line, after the ↗ link. The chip links to the epic in Jira
    (new tab).
- The chip color is a theme token (add one to `client/src/theme.ts`), with text always present.

## 2. Auto-reveal with a short countdown

- When the phase is voting, a ticket or round is active, and **every connected player has voted**
  (at least one), the server starts a **3-second countdown**, then reveals as if someone pressed
  Reveal (same `game.reveal`, same history recording).
- Server owns the timer (one per room). It is cancelled when: anyone changes or clears their
  card, a player joins or reconnects without a vote, a reset or new ticket starts, or someone
  presses Reveal manually. When the condition becomes true again, it restarts from 3.
- A player who disconnects stops counting toward "every connected player".
- Snapshot gains `autoRevealAt: string | null` (ISO deadline). The client shows "Revealing in
  3…2…1" in the bottom bar from that deadline (clamped at 0), next to the Reveal button, which
  still works. No client command added.
- No room setting to turn it off (decided: countdown, not a toggle).

## 3. Changing a vote after reveal

- In the revealed phase, players can pick a different card (or clear back to none); the server
  accepts `vote` in both voting and revealed phases.
- Each player keeps `revealedVote` (their vote at the moment of reveal). The view adds
  `changedFrom: Card | null` per player: the reveal-time vote when the current vote differs,
  otherwise null. The card shows the new value with a small "was 13" marker.
- Stats (average, range, consensus, outliers) recompute live from current votes. The points
  select keeps a manual pick; if the user has not picked manually, its suggestion follows the
  new stats.
- The session history row for the ticket updates with the new stats (same key, no new row).
- Saving still uses the chosen points; changes after a save don't undo it.

## 4. A 0.5 card

- `DECK` becomes `["0", "0.5", "1", "2", "3", "5", "8", "13", "21", "?", "☕"]`.
- `isNumericCard` accepts decimal values in the deck (`/^\d+(\.\d+)?$/`), so 0.5 counts toward
  stats and can be saved; Jira Story Points accepts decimals.
- Check every place that assumes whole numbers: points select, save validation in `ws.ts`
  (zod schema), stats formatting (average already has one decimal), card width.

## Edge cases

- Auto-reveal with one player: they vote, countdown, reveal. Fine for a solo check.
- Everyone votes "?" or "☕": still reveals (they voted); stats show no numbers.
- Vote change racing the countdown's final tick: the server cancels the timer on the vote
  message before the reveal fires, or the change lands as a post-reveal change. Both are valid.
- An epic whose name is very long: ellipsis plus tooltip.

## Verification

No test suite by design. Gate: `npm run format && npm run lint && npm run tsc:check && npm run build`.
Browser check with two to three `?devUser=` tabs (never click Save to Jira in dev): epic chips in
queue, search and ticket; countdown appears when the last player votes, resets when a card
changes, reveals at zero; post-reveal change shows "was X" and updates stats and the history row;
0.5 is selectable, counts in the average, and appears in the points select.

## Docs

`docs/spec/02-server.md`, `docs/spec/03-client.md`, a decision-log entry.
