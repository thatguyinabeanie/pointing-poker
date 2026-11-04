# Ticket type colors and epics in the queue

## Why

Team feedback (11/04/2026, team-onyx): ticket types should have colors so bugs stand out, and
each ticket's epic should be visible, and colored, in the queue list. Labels already show inside
a ticket, which the team said is enough.

## Scope

1. Color the issue type icon everywhere it appears.
2. Show the ticket's epic as a colored chip on queue rows and search result rows, using the
   epic's own color from Jira.

Out of scope: an epic in the ticket view header, epics on session history rows, caching epic
colors across refreshes, a dark theme (the app has a light theme only).

## 1. Issue type colors (client only)

`client/src/components/IssueTypeIcon.tsx` gets a color per type, next to the existing icon map,
matched case-insensitively the same way:

| Type | Color |
|---|---|
| bug | red |
| story | green |
| task | blue |
| epic | purple |
| subtask / sub-task | light blue |
| research | teal |
| anything else | `text.secondary` (gray, as today) |

- Hex values are picked to read on the light background (icon contrast at least 3:1 against
  white, WCAG non-text contrast). They live in one map in `IssueTypeIcon.tsx`.
- The icon keeps its shape per type, so color is never the only cue.
- `TicketRowFrame` and `TicketView` wrap the icon in `Typography color="text.secondary"`. The
  icon's own color must win over that wrapper.

## 2. Epics on queue rows

### Data

`shared/protocol.ts`:

```ts
export type EpicColor =
  | "purple" | "blue" | "green" | "teal" | "yellow" | "orange" | "grey"
  | "dark_purple" | "dark_blue" | "dark_green" | "dark_teal" | "dark_yellow"
  | "dark_orange" | "dark_grey";

export interface QueueEpic {
  key: string;
  name: string; // the epic's summary
  color: EpicColor | null; // null: Jira has no color, or the lookup failed
}

// QueueItem gains:
epic: QueueEpic | null;
```

`EpicColor` is the value set of Jira's "Issue color" field (verified: CIVIS-14436 has
`dark_yellow`). The server maps everything into this set, so the client never sees raw Jira
values.

### Server (`server/jira.ts`)

1. **Ask for `parent`.** `boardSection` (`fields=summary,issuetype,status,parent`) and
   `searchIssues` (`fields: [..., "parent"]`) request the parent. Verified on CIVIS: `parent`
   returns `key` and `fields.summary`, `fields.issuetype` (name, `hierarchyLevel`), `status`,
   `priority`; no color.
2. **Parse the epic.** `parseIssues` sets `epic` when the parent's issue type has
   `hierarchyLevel === 1`, or, if that is missing, its name is "Epic" (case-insensitive).
   Otherwise `epic: null` (a sub-task's parent is a story, not an epic). Color starts null.
3. **Look up colors once per refresh.** After `searchQueue` has all sections, and after
   `searchTickets` has its results, collect the distinct epic keys. If there are any, make one
   `POST /rest/api/3/search/jql` with `jql: key in (...)`, `fields: [issueColorId,
   epicColorId]`, `maxResults` = the number of keys (at most 100; more keys are chunked).
4. **Find the color fields by name, once.** Generalize `discoverFieldId` so the same
   `/rest/api/3/field` read can find custom fields by name, cached per process with the same
   evict-on-failure rule as `storyPointsFieldId`: "Issue color" and "Epic Color". Either may be
   missing.
5. **Pick and map the color.** Prefer "Issue color" (the field Jira's current UI uses); its
   value passes through when it is in `EpicColor`. Otherwise map the legacy "Epic Color"
   value `ghx-label-1` .. `ghx-label-14` to the nearest `EpicColor` (table in code, labeled
   approximate). Anything else is null.
6. **Never fail the queue for colors.** If field discovery or the color request fails, log a
   warning (counts only, no ticket content) and return the items with `color: null`. The queue
   and search results still load.

### Client

- `client/src/components/TicketRowFrame.tsx` takes an optional `epic?: QueueEpic | null`. When
  set, it renders a small outlined chip between the key link and the status badge: a colored
  dot followed by the epic name in regular text color, `noWrap` with ellipsis, a max width so
  the key and the status always fit, and `title` = the full epic name. Null color renders a
  gray dot.
- One `EpicColor` to hex map in a new `client/src/lib/epicColors.ts`, chosen so the dot reads
  on the light background (at least 3:1 against white).
- `QueuePanel`'s `TicketRow` passes `item.epic`. `SessionHistory` passes nothing (history rows
  have no epic), so those rows are unchanged.
- Clicking the chip does nothing special: it is part of the row, so clicking it loads the
  ticket like the rest of the row.

## Edge cases

| Case | Result |
|---|---|
| Ticket has no parent | No chip |
| Parent is a story (sub-task) | No chip |
| Epic has no color in either field | Gray chip |
| Color lookup or field discovery fails | Gray chips, queue loads, warning logged |
| Same epic on many rows | One lookup per distinct key |
| Very long epic name | Truncated with ellipsis, full name on hover |
| Unknown issue type | Gray icon, as today |

## Verification

- `npm run format && npm run lint && npm run tsc:check && npm run build`.
- Browser on the dev server with the CIVIS project: queue rows show colored type icons and
  epic chips whose colors match the Jira board for a few known epics; search results show the
  same; History rows are unchanged; a row without an epic shows no chip.
- Read-only against Jira: this feature makes no writes.

## Docs

- `docs/spec/02-server.md`: `parent` in the queue and search fields, epic parsing, the color
  lookup and its non-fatal failure, the color field discovery.
- `docs/spec/03-client.md`: `IssueTypeIcon` colors, the `TicketRowFrame` epic chip.
- `docs/spec/08-decision-log.md`: entry 44, dated 11/04/2026, the team's request and the choice
  to match Jira's epic colors at the cost of one extra request per refresh.
