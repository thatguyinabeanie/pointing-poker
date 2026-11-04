# Ticket Type Colors and Epics in the Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Color the issue type icon everywhere, and show each queue/search row's epic as a chip colored with the epic's Jira color.

**Architecture:** Type colors are a client-only map in `IssueTypeIcon`. Epics come from the `parent` field the server already can request; one extra `/search/jql` per refresh reads the epics' color fields (discovered by name and cached), mapped into a fixed `EpicColor` set that the client turns into hex.

**Tech Stack:** Node 26 (type-stripped TS server), Fastify 5, React + MUI 9 client, Jira Cloud REST v3 and Agile 1.0.

**Spec:** `docs/superpowers/specs/2026-11-04-epics-and-type-colors-design.md`

## Global Constraints

- No test files and no test script (repo decision). Each task verifies with the gate plus a throwaway script outside the repo (`/private/tmp/claude-502/...`), never committed.
- Gate before each commit: `npm run format && npm run lint && npm run tsc:check && npm run build`, every exit code checked unpiped (zsh).
- Server: erasable TS syntax only; relative imports end in `.ts`; failures are `{ ok: false, reason }` results; read env lazily.
- Never log the Jira token or ticket content; log reasons and counts only, through `opts.logger?.debug`.
- Do not edit `docs/spec/reference/**` (frozen scaffold snapshot).
- Read-only against Jira: this feature makes no writes.
- Commit trailer, verbatim: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` then `Claude-Session: https://claude.ai/code/session_01EiJnVjeT8VRBLabXHH7PPQ`.
- Colors must read on the light theme: icons and dots at least 3:1 against `#FFFFFF`.

## Review Focus

1. A sub-task whose parent is a story: no chip (parent is not epic-level). Pinned in Task 2's script.
2. A site with neither "Issue color" nor "Epic Color": no color request is sent at all, chips are gray, queue loads. Pinned in Task 2's script.
3. The color request fails (HTTP 400/500 or unreadable body): queue and search still return all items with `color: null`. Pinned in Task 2's script.
4. More than 100 distinct epics across sections: lookups are chunked at 100 keys per request. Pinned in Task 2's script.
5. A very long epic name never pushes the status badge out of the row. Pinned in Task 3's browser check.

---

### Task 1: Issue type colors

**Files:**
- Modify: `client/src/components/IssueTypeIcon.tsx`
- Modify: `client/src/components/TicketRowFrame.tsx` (icon wrapper only, if needed)
- Modify: `client/src/components/TicketView.tsx` (icon wrapper only, if needed)
- Modify: `docs/spec/03-client.md` (IssueTypeIcon description)

**Interfaces:**
- Produces: `IssueTypeIcon({ type })` renders a colored icon; signature unchanged.

- [ ] **Step 1: Add a color map** beside `ICONS`, same lower-case keys, `Object.hasOwn` lookup, fallback `"text.secondary"`:

| key | hex |
|---|---|
| bug | `#C84944` (theme error) |
| story | `#3B7D34` |
| task | `#2F6DB5` |
| epic | `#6B4BA8` |
| subtask, sub-task | `#1F7AB0` |
| research | `#0F7C7C` |

Pass it as the icon's `sx={{ color }}` so it wins over the parent `Typography color="text.secondary"`. If a wrapper still overrides it, remove only that wrapper's color.

- [ ] **Step 2: Verify contrast** with a throwaway node script computing WCAG contrast of each hex against `#FFFFFF`. Expected: every value at least 3.0. Adjust a hex darker if not, and note it in the report.

- [ ] **Step 3: Update `docs/spec/03-client.md`** where IssueTypeIcon is described: colors per type, gray fallback, shape still differs per type.

- [ ] **Step 4: Gate.** Expected: four exit codes 0.

- [ ] **Step 5: Commit** "Color ticket type icons by type".

---

### Task 2: Epic and epic color on queue and search items (server + protocol)

**Files:**
- Modify: `shared/protocol.ts`
- Modify: `server/jira.ts`
- Modify: `docs/spec/02-server.md`

**Interfaces:**
- Produces (protocol):
  ```ts
  export type EpicColor =
    | "purple" | "blue" | "green" | "teal" | "yellow" | "orange" | "grey"
    | "dark_purple" | "dark_blue" | "dark_green" | "dark_teal" | "dark_yellow"
    | "dark_orange" | "dark_grey";
  export interface QueueEpic { key: string; name: string; color: EpicColor | null }
  // QueueItem gains: epic: QueueEpic | null;
  ```
- Produces (jira.ts, internal): `searchQueue` and `searchTickets` results carry `epic` with colors filled where Jira has them. Their signatures are unchanged.

- [ ] **Step 1: Protocol.** Add `EpicColor`, `QueueEpic`, and `QueueItem.epic` as above, with a comment that the server maps Jira values into this set.

- [ ] **Step 2: Request `parent`.** `boardSection`'s `fields=` gains `parent`; `searchIssues`' `fields` array gains `"parent"`.

- [ ] **Step 3: Parse the epic in `parseIssues`.** `epic` is `{ key, name: parent.fields.summary ?? "", color: null }` when `parent.key` is a string and `parent.fields.issuetype.hierarchyLevel === 1`, or, when `hierarchyLevel` is not a number, `issuetype.name` lower-cased is `"epic"`. Otherwise `epic: null`.

- [ ] **Step 4: Share one cached field list.** Extract the `/rest/api/3/field` read into `listFields(): Promise<Result<{ id: string; name: string; custom: boolean }[]>>`, cached per process with the existing evict-on-failure pattern (concurrent callers share one request). `discoverFieldId` uses it and keeps its current behavior and messages. Add `customFieldId(fields, name): string | null` (exact name, `custom === true`).

- [ ] **Step 5: Implement `epicColors(keys: string[]): Promise<Map<string, EpicColor>>`.**
  - Never rejects for Jira failures; returns what it could read.
  - Empty `keys`, or neither "Issue color" nor "Epic Color" found: return an empty map without a request.
  - Otherwise, per chunk of at most 100 keys: `POST /rest/api/3/search/jql` with `jql: key in (<jqlQuote each>)`, `fields: [<found ids>]`, `maxResults: chunk.length`.
  - Per issue: prefer the "Issue color" value when it is an `EpicColor`; else map "Epic Color" `ghx-label-N` with this table (comment it as approximate): 1 dark_orange, 2 orange, 3 yellow, 4 blue, 5 dark_grey, 6 green, 7 purple, 8 dark_purple, 9 orange, 10 blue, 11 teal, 12 grey, 13 dark_green, 14 dark_yellow; anything else no entry.
  - On a failed chunk or failed field discovery: `opts.logger?.debug({ reason, keys: count }, "jira epic colors unavailable")` and continue.

- [ ] **Step 6: Apply colors.** Add `withEpicColors<T extends { items: QueueItem[] }>`-style helper (or two small helpers) that collects distinct epic keys, calls `epicColors` once, and returns new items with `epic.color` set; items and sections are copied, not mutated. Call it at the end of `searchQueue` (both the no-board and board paths, on the final sections) and on `searchTickets`' results.

- [ ] **Step 7: Verify with a throwaway script** that builds the client from `server/jira.ts` with a fake `fetch` (the client accepts `opts.fetch`) and checks:
  - an issue with an epic-level parent gets `epic.key`/`epic.name`, and color `dark_yellow` from "Issue color";
  - an epic with only `Epic Color: "ghx-label-2"` gets `orange`;
  - a sub-task whose parent has `hierarchyLevel: 0` gets `epic: null` (Review Focus 1);
  - a field list without either color field sends no `key in` request and every color is null (Review Focus 2);
  - the color request returning 500 still returns all items with `color: null` (Review Focus 3);
  - 120 distinct epic keys produce two `key in` requests of 100 and 20 (Review Focus 4);
  - the Story Points discovery still returns the same id from the shared field list.
  Expected: all checks print PASS.

- [ ] **Step 8: Docs.** `docs/spec/02-server.md`: `parent` in the queue/search fields, the epic rule, `epicColors` (chunking, preference order, ghx mapping is approximate), non-fatal failure, the shared field list; add `epic` to the shared-contract `QueueItem` snippet.

- [ ] **Step 9: Gate.** Expected: four exit codes 0.

- [ ] **Step 10: Commit** "Read each ticket's epic and its Jira color for the queue".

---

### Task 3: Epic chip on queue and search rows (client)

**Files:**
- Create: `client/src/lib/epicColors.ts`
- Modify: `client/src/components/TicketRowFrame.tsx`
- Modify: `client/src/components/QueuePanel.tsx` (`TicketRow` passes `item.epic`)
- Modify: `docs/spec/03-client.md`, `docs/spec/08-decision-log.md`

**Interfaces:**
- Consumes: `QueueEpic`, `EpicColor` from `shared/protocol.ts` (Task 2).
- Produces: `epicHex(color: EpicColor | null): string` in `client/src/lib/epicColors.ts`; `TicketRowFrame` prop `epic?: QueueEpic | null`.

- [ ] **Step 1: `epicColors.ts`.** A `Record<EpicColor, string>` with these hex values, and `epicHex` returning `#8590A2` for null:
  purple `#6554C0`, blue `#0065FF`, green `#1F845A`, teal `#1D7F8C`, yellow `#946F00`, orange `#C25100`, grey `#626F86`, dark_purple `#403294`, dark_blue `#0747A6`, dark_green `#216E4E`, dark_teal `#206B74`, dark_yellow `#7F5F01`, dark_orange `#A54800`, dark_grey `#44546F`.
  Verify each colored value is at least 3:1 against white with the same throwaway contrast script as Task 1 (the null gray is decorative and exempt); darken and note any that fail.

- [ ] **Step 2: Chip in `TicketRowFrame`.** When `epic` is set, render between the key link and the status badge: an outlined, small, rounded element with an 8px dot in `epicHex(epic.color)` and the epic name in regular text color, `variant="caption"`, `noWrap` with ellipsis, `minWidth: 0` and a `maxWidth` so the key and the status badge always stay visible, `title={epic.name}`. The status badge keeps `ml: "auto"`. No click handler of its own (a click loads the ticket like the rest of the row).

- [ ] **Step 3: Pass it.** `QueuePanel`'s `TicketRow` passes `epic={item.epic}`. `SessionHistory` is unchanged.

- [ ] **Step 4: Docs.** `03-client.md`: the chip in the TicketRowFrame section and `epicColors.ts` in the file map. `08-decision-log.md` entry 44, dated 11/04/2026, "This is the user's decision.": the team's request, matching Jira's epic colors at the cost of one extra request per refresh, chip on line 1, gray when Jira has no color.

- [ ] **Step 5: Gate.** Expected: four exit codes 0.

- [ ] **Step 6: Commit** "Show each ticket's epic as a colored chip in the queue".

- [ ] **Step 7 (controller): Browser check** on the dev server with the CIVIS project: type icons are colored; rows with an epic show a chip whose color matches the Jira board for two known epics; a row without an epic has no chip; search results show chips; History rows unchanged; at the narrowest queue pane width a long epic name truncates and the status badge stays visible (Review Focus 5).
