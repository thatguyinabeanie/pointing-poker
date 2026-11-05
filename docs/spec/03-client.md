# Pointing Poker: client (frontend) specification

This document is self-contained. A coding session implementing the `client/` folder of the `pointing-poker` repo should need nothing else. Where it says "reference implementation", it means files that were already written and reviewed and are copied into the repo at `docs/spec/reference/client/src/components/*.tsx` and `docs/spec/reference/client/src/lib/estimate.ts`. Copy them into `client/src/` unchanged unless this document says otherwise. The shared contract lives in `shared/protocol.ts` and `shared/deck.ts` (already written; do not edit them). `Ticket` in `protocol.ts` carries `descriptionHtml`, `comments` (`TicketComment[]`, oldest first), `assignee`, `priority` and `labels` in addition to the summary fields. `shared/constants.ts` also exists and exports `ISSUE_KEY` and `MIN_QUERY_LENGTH`. The reference `QueuePanel.tsx` still has the label switches; the repo version drops them (decision 34).

> **Redesign (10/16/2026).** The header, layout, queue rows, ticket view, bottom bar and players were redesigned. The design is `docs/superpowers/specs/2026-10-16-ui-redesign-design.md` (decision 38). Where this file describes the earlier `TopBar`, three-pane layout, `TicketDescription`, `TicketComments` pane or `ParticipantChips`, the sections below now describe the redesigned components instead. The files under `docs/spec/reference/client/` and the mock are the earlier design and are not kept in sync.

## 1. Scope

The client is one page with no router. It uses the stock MUI 9 theme with only the font family changed to Lato (Roboto fallback). It uses the whole page width: two columns (queue on the left, ticket view on the right) under a slim header and above a two-row sticky bottom bar: a players row, then the deck and the actions. The target is laptop widths (internal tool, MacBook Pro screens, inside the hosting platform's service report iframe), so the full layout applies from the `lg` breakpoint (1200px) up. There is no phone layout work. Below `lg` the panes and the bar simply stack at full width and nothing should break; that is the whole requirement there. Everything is one shared room: there is no room picker or login screen. The only settings are the shared ticket queue settings (section 2, QueuePanel), which are room state, not per-user preferences. Identity comes from the server (auth proxy headers), so the client never asks who the user is. There are no client tests in v1 (decision, see `08-decision-log.md`). Do not add any dependency beyond what `package.json` already lists: react, react-dom, @mui/material, @mui/icons-material, @emotion/react, @emotion/styled. Do not add a router, state library, or form library.

Lint is Biome (`npm run lint` is `biome ci .`): double quotes, 2-space indent, line width 100, React lint domain on. Type check is `tsc --noEmit -p tsconfig.json` (strict, `verbatimModuleSyntax`, `allowImportingTsExtensions`). That means: always `import type` for type-only imports, and always write the `.ts`/`.tsx` extension on relative imports, as the reference files do.

## 2. File map

```
client/index.html                 HTML shell, Lato font link, #root, module script
client/src/main.tsx               createRoot, StrictMode, ThemeProvider, CssBaseline, renders <App />
client/src/theme.ts               createTheme with Lato typography (already exists in the scaffold; keep)
client/src/App.tsx                owns useGameSocket, fills the Layout slots, maps UI actions to commands
client/src/useGameSocket.ts       WebSocket client hook (section 3)
client/src/lib/epicColors.ts      epicHex(color): Jira epic color name to hex, gray when null
client/src/lib/estimate.ts        suggestPoints (reference, copy as is)
client/src/lib/initials.ts        initials(name) for avatars (Players, EntryRow)
client/src/lib/relativeTime.ts    relativeTime(iso): short "2d" labels (EntryRow, SessionHistory)
client/src/components/Header.tsx             slim light header: queue controls on the left, title, then the Auto-reveal and Auto-advance switches, status dot and username on the right; two rows below lg
client/src/components/layoutConstants.ts     HEADER_HEIGHT (48), shared by Header and Layout
client/src/components/QueueControls.tsx      Project, Board and Type selects and Refresh (moved out of QueuePanel)
client/src/components/LeftPanel.tsx          the left pane's card: Queue and History tabs
client/src/components/QueuePanel.tsx         search, queue sections, two-line clickable rows
client/src/components/SessionHistory.tsx     this room's revealed tickets, newest first
client/src/components/TicketRowFrame.tsx     the two-line clickable row shared by the queue and session history
client/src/components/Layout.tsx             three slots (left, main, bottom), the tickets pane width and the bottom bar height
client/src/components/ResizeHandle.tsx       draggable, keyboard-operable separator between the panes
client/src/components/IssueTypeIcon.tsx      Jira issue type to icon shape and color, gray default
client/src/components/TicketView.tsx         empty-state guide, or ticket header plus Description and Comments tabs
client/src/components/TicketComments.tsx     comments list, rendered inside TicketView
client/src/components/TicketHistory.tsx      Jira changelog list, rendered inside TicketView
client/src/components/EntryRow.tsx           avatar, author and time header shared by comments and history
client/src/components/HtmlBody.tsx           the only dangerouslySetInnerHTML in the client
client/src/components/Players.tsx            the players row: centered player pills (avatar, name, mini card), compact mode
client/src/components/RoundSummary.tsx       right side of the players row: voted count, or the vote chart, Avg and Median, and one result chip
client/src/components/Deck.tsx
client/src/components/ActionBar.tsx
client/src/components/NoticeSnackbar.tsx
```

`TopBar.tsx`, `TicketDescription.tsx` and `ParticipantChips.tsx` were deleted by the redesign. Files to author from scratch: `App.tsx` and `useGameSocket.ts`. `index.html`, `main.tsx` and `theme.ts` already exist in the scaffold; `main.tsx` needs only the `<App />` swap. The nine components, `HtmlBody.tsx` and `estimate.ts` come from the reference folder. `TicketPanel.tsx` and `ParticipantList.tsx` no longer exist; do not create them. Reading the reference files is the fastest route; the summaries below are the contract each one must keep. Do not rename props.

### lib/estimate.ts

`suggestPoints(stats: Snapshot["stats"], deck: readonly string[]): string | null`. Returns null when `stats` is null. Otherwise it scans `stats.counts` and picks the numeric card with the highest count. A card is eligible only if `isNumericCard(card)`, `deck.includes(card)` and `count > 0`. So `?` and the coffee card are never suggested, and counts for cards that are not in the deck passed in are ignored. On a tie the numerically higher card wins ("when the room is split, the cautious estimate is the bigger one"). Returns null when no eligible card exists. Returns a string (a card), not a number.

### components/Header.tsx

Props: `{ connected: boolean; meName?: string; controls?: ReactNode; actions?: ReactNode }`. A `Box component="header"` of height `HEADER_HEIGHT` at `lg` (48, from `layoutConstants.ts`, so `Layout` and `Header` always agree), light grey background and a bottom border, not an `AppBar`. From `lg` up it is one fixed 48px row, a three-column grid `1fr auto 1fr` that keeps the title centered whatever the side widths are. Left: the `controls` slot (App passes `QueueControls`, and passes nothing until the first snapshot). Center: "Pointing Poker" as the page's only `h1`. It is always rendered; below `lg`, where the two rows leave no centered slot, it is visually hidden with the clip pattern (absolute, 1px by 1px, `overflow: hidden`, `clip: rect(0 0 0 0)`, `whiteSpace: nowrap`, margin -1px, no border or padding) rather than `display: none`, so screen readers still find a page heading at every width. Right: the actions and status. One row needs about 1060px: the controls take 484px (three 140px selects, Refresh and the gaps), the title 132px and the right side about 380px, plus the 16px padding on each side and two 16px gaps. Below `lg` the header is therefore one column with two rows (`height: auto`, `minHeight` 48, `py` 8px): row 1 is the controls, row 2 the actions and status, aligned right. Both rows may wrap at phone width (the controls need 394px at `xs`). Measured with no overlap at 320, 768, 1024, 1199, 1200 and 1440px wide. `Layout` uses `HEADER_HEIGHT` only at `lg` and up, so the taller header below `lg` needs nothing else. (The final review on 11/05/2026 ruled two rows below `md`; measuring showed one row cannot fit at 1024px, so the breakpoint is `lg`.) Right side: the `actions` slot first (App passes the Auto-reveal and Auto-advance switches once a snapshot exists), in its own flex row with gap 1 (`flexShrink: 0` at `lg`, wrapping below it), then a status dot (green with tooltip "Connected", amber with tooltip and visible text "Reconnecting…" when disconnected) and the viewer's username. Color is never the only signal.

### components/QueueControls.tsx

Props: `{ settings, projects, boards, issueTypes, disabled, onChangeSettings, onRefresh, refreshing? }`. The Project select, Board select and Refresh icon button that used to be the first row of `QueuePanel`, with the same handlers and disabled rules, and a Type select between Board and Refresh (decision 50). Type is a `Select multiple` labeled "Type" (`minWidth` 110 at `xs` and 140 from `sm`, like Project and Board; `maxWidth` 220, 160 from `lg` to `xl`, 220 again from `xl`, also like Project and Board) over `issueTypes` (App passes `snapshot.issueTypes`, the project's type names). Closed, its value is `settings.issueTypes`, the room's selection, shown as is so the closed select matches what the server filters by. Its `open` state is controlled (`open`, `onOpen`, `onClose`). Opening copies `settings.issueTypes` into a local `draft` and remembers it, with `settings.projectKey`, as the value at open; while open the value and the checkboxes show the draft. A change only updates the draft. Closing calls `onChangeSettings({ issueTypes: draft })` once, and only when the draft differs from the value at open as a set and the room's current `settings.issueTypes` still equals the value at open (`sameNames` from `shared/constants.ts`, the same check the server uses). Otherwise the draft is dropped silently: someone else changed the filter while the menu was open, and the draft, built on the old selection, would undo their change. When `settings.projectKey` changes or the select becomes disabled while the menu is open, the menu closes and the draft is discarded without sending (PR follow-up, 11/05/2026). Sending on every click made each click a room-wide queue refetch, and a click that landed before the previous snapshot came back was computed from the stale selection and undid the earlier click; with the draft no click is lost and the room refetches once per menu session. It uses `displayEmpty` (MUI then notches the outline) with a shrunk `InputLabel`, so the label never sits on the text. `renderValue` shows "All types" for an empty selection, the name for one type, and a count for two or more ("2 types"), because the joined names were the widest value in the header. The full list stays in the menu and in the select's `title` attribute ("All types" or the names joined with ", "). Each `MenuItem` (dense) holds a small `Checkbox` and a `ListItemText` with the name. A string value from autofill is split on commas. It is disabled when `disabled` is true or when `issueTypes` is empty (no project, or the type list failed to load). One row with no wrap from `lg`, where the header is a fixed 48px; below `lg` the header grows, so the `Stack` (`useFlexGap`) wraps with a 16px row gap that leaves room for the floating labels (see Header). The Project and Board selects have `minWidth` 110 at `xs` and 140 from `sm`. All three selects share one `sx` with `maxWidth` 220 below `lg`, 160 from `lg` and 220 from `xl`, and a longer value is truncated with an ellipsis by the select's own nowrap styles; each select's `title` attribute holds the full Project ("KEY (Name)") or Board name. At `lg` the header's left column is about 500px at a 1200px layout, so 220px selects with long names ran toward the centered title. Measured in Chrome (11/05/2026) with the longest real names (project "OKR2 (Civis Platform Usage and Adoption Metrics)", board "Civis Platform Usage and Adoption Metrics") and three types: the controls' right edge stays left of the title's left edge by 16px at 1200, 34px at 1280 and 77px at 1366. `refreshing` (App passes `snapshot.queue.loading`) keeps Refresh disabled while the queue loads. The Auto-reveal switch is not part of this component, which stays about the queue. App passes it to the Header's `actions` slot, on the right before the status dot (moved from the left group by decision 50, so the left holds only Project, Board, Type and Refresh): a `RoomSwitch` (`client/src/components/RoomSwitch.tsx`, props `{ label, checked, disabled, onToggle(enabled) }`): a `FormControlLabel` (`sx` `ml: 0`, `mr: 0`, `flexShrink: 0`, `whiteSpace: "nowrap"`) around a `Switch size="small"`, vertically centered by the slot's flex `alignItems: "center"`. It keeps no local state. The first is labeled "Auto-reveal": `checked` is `snapshot.autoReveal`, `disabled` follows `disabled`, and `onToggle` sends `{ type: "setAutoReveal", enabled }`. It is shared room state, on by default (decision 41), so every viewer sees the same value. The second is labeled "Auto-advance": `checked` is `snapshot.autoAdvance`, and `onToggle` sends `{ type: "setAutoAdvance", enabled }`. It is shared room state, off by default (decision 46).

### components/LeftPanel.tsx

Props: the `QueuePanel` props plus `history: SessionHistoryEntry[]` (App passes `snapshot.history`). It owns the left pane's `Paper` and its two tabs, "Queue" and "History"; `QueuePanel` no longer draws an outer `Paper`. The History tab label carries a count badge (`history.length`, shown at zero). The tab bar is sticky at the top of the pane, because `Layout`'s pane is the element that scrolls. The selected tab is per tab of the browser: `sessionStorage` key `pp.left.tab` (`"queue"` or `"history"`, anything else reads as `"queue"`) through `readJson` and `writeJson`. Both panels stay mounted and the inactive one is hidden (`hidden`), because remounting `QueuePanel` would re-send its restored search query to Jira on every tab switch. `SessionHistory` gets `history`, `currentKey`, `disabled` and `onPick` from the same props.

### components/SessionHistory.tsx

Props: `{ history: SessionHistoryEntry[]; currentKey: string | null; disabled: boolean; onPick: (key: string) => void }`. With no rows it shows the muted text "Nothing pointed yet in this room." Otherwise a dense `List` with one `TicketRowFrame` per row, in array order (the server sends newest first). The badge is the saved points, or "–" when the ticket was revealed but not saved. The second line is a detail line, also set as its `title` tooltip: `avg {average}`, then "consensus" or `{min}–{max}`, then "re-voted" when `revoted`, then "✓ saved" when `savedPoints` is set, then `relativeTime(revealedAt)`, joined with " · ". When `average` is null (only non-numeric votes) the avg and range parts are left out. Clicking a row calls `onPick(key)`, which loads that ticket again for the room, exactly like a queue row, and the current ticket's row is highlighted and not clickable. The history is room state and lasts until a server restart; it is not stored in the browser.

### components/TicketRowFrame.tsx

Props: `{ issueType; ticketKey; url; isCurrent; disabled; onPick; badge: ReactNode; epic?: QueueEpic | null; secondLine: ReactNode }`. The row layout that used to live inside `QueuePanel`'s `TicketRows`, extracted so the queue, the search results and `SessionHistory` look and behave the same: type icon, key as a `Link` to `url` (new tab, `rel="noopener noreferrer"`, its click does not pick the ticket), an epic chip when `epic` is set (a rounded element with a 12% fill and a 50% inset outline of `epicHex(epic.color)`, so it stands off the white row; the outline is an inset shadow so the row height does not change; an 8px dot in the same color and the epic name in caption text; the name truncates with an ellipsis and has the full name as its `title`, so the key and the badge always stay visible; no click handler of its own), a badge on the right, then the second line on one line with ellipsis. The root is a `ListItem` (`li`, `disablePadding`) holding the `ListItemButton`, so rows are list items of the `List` that both callers render them in (assistive technology announces them with their position). The whole row is the `ListItemButton`; the current row is highlighted with a left accent border, has `aria-current`, and ignores clicks. Other rows are disabled while `disabled` is true. `QueuePanel` passes the status as the badge, `item.epic` as the epic and the summary as the second line. `SessionHistory` passes no epic.

### components/QueuePanel.tsx

Props: `{ queue: QueueState; searchResults: SearchResults | null; currentKey: string | null; disabled: boolean; onPick: (key: string) => void; onSearch: (query: string) => void; boardUrl: string | null }`. The settings row (Project, Board, Refresh) moved to `QueueControls` in the header, so the rows below that mention it no longer apply to this component. `boardUrl` is computed in `App.tsx` (memoized; the Jira origin comes from the first item's `url`, and the URL needs a project key and a board id) and is the target of the "Open the full board in Jira" link. Rows are two lines (type icon, key link and status badge; then the summary with ellipsis) and the whole row is a button that calls `onPick`; the current ticket's row is highlighted and not clickable (design spec section 3). `SearchResults` is `{ query: string; items: QueueItem[]; error: string | null; pending: boolean }`, exported from `QueuePanel.tsx` and structurally identical to the hook's `searchResults` value. Types come from `shared/protocol.ts`. The team picks the next ticket from a shared queue of unpointed Jira tickets instead of typing a key. Settings are shared room state: changing one changes the queue for everyone.

MUI: `Stack spacing={2}` (the `Paper` and the padding now come from `LeftPanel`) with these rows, top to bottom:

1. Settings: not part of this component. The Project and Board selects and Refresh live in `QueueControls` in the header. The component starts with the search box.
2. Search: a `TextField size="small"` labeled "Search tickets (key or text)" with a `SearchIcon` start adornment. Local state holds the text; every change calls `onSearch(text)` (the hook debounces and ignores short queries). The text is persisted per tab in `sessionStorage` key `pp.search.query` (a JSON string; removed when the box is cleared) and restored on load. A search sent while the socket is down is dropped, so an effect keyed on `disabled` re-sends a non-empty query each time the connection comes up, which brings restored results back after a refresh and refreshes them after a reconnect. Below it, driven by `searchResults`: a `LinearProgress aria-label="Searching"` while `pending`; an inline `Alert severity="warning"` with `error` when not pending and `error` is set; "No matches" when not pending and `items` is empty; otherwise the result rows. When `searchResults` is null nothing renders.
3. Queue status: a `LinearProgress aria-label="Loading queue"` while `queue.loading`; else an inline `Alert severity="warning"` with `queue.error`; else a `Typography variant="caption"` "{n} tickets · updated {time}" (n is the sum of the sections' `total`; time from `fetchedAt` via `toLocaleTimeString`, omitted when null).
4. Queue list: unless loading or error, and when `queue.sections` is empty, the text "No unpointed tickets. Change the project or board, or refresh." Otherwise one block per section, in order. Kind `all` (no board) has no header and is a plain `TicketRows` list. Other kinds (`active`, `future`, `backlog`) get a dense header row: a button with `aria-expanded` and `aria-controls`, an ExpandMore or ExpandLess icon, the section name, a small "active" or "future" label (none for backlog), and the count (`total` when `items.length === total`, else "{items.length} of {total}"). The body is an MUI `Collapse`. When `items.length < total`, the last row is the link "Open the full board in Jira" to `{jiraBase}/jira/software/c/projects/{projectKey}/boards/{boardId}/backlog`, shown only when the Jira base URL can be derived from the first item's `url` origin, otherwise omitted. Collapse state is per viewer: React state, default all expanded, persisted to `localStorage` key `pp.queue.collapsed` (a JSON array of section ids). All Web Storage access goes through `client/src/storage.ts` (`readJson`, `writeJson`, `removeItem`), which wraps every call in try/catch and ignores failures. The queue list stays separate from, and below, the search results.
Rows (queue and search results share one internal `TicketRows` component): two lines per row. Line 1 is the issue-type icon (a small map from Jira type name to an MUI icon, generic for others), the key as a `Link` to `item.url` (`rel="noopener noreferrer"`, opens in a new tab, and its click does not point the ticket), an epic chip when the item has an epic (colored dot and the epic name, falling back to the epic key when the name is empty; see `TicketRowFrame`), and the status as a small badge on the right. The issue-type icons are colored per type. Line 2 is the summary on one line with ellipsis and the full text in a `title` tooltip. The whole row is a button that calls `onPick(item.key)`; the row whose key equals `currentKey` is highlighted (tint and left accent border) and not clickable.

### components/Layout.tsx

Props: `{ left: ReactNode; main: ReactNode; bottom: ReactNode }`. It holds one piece of state, the tickets pane width, and no data. It renders a `Container maxWidth={false}` with `sx={{ px: { xs: 2, lg: 3 } }}` (full width), then a flex row of the two panes, then the bottom bar.

| Slot | Position | Content from App |
|---|---|---|
| `left` | left pane, fixed px width at `lg+` | `LeftPanel` (Queue and History tabs) |
| `main` | `flex: 1; minWidth: 0` | `TicketView` |
| `bottom` | outside the row, full width | `Players` row, then `Deck` and `ActionBar` in a three-column grid |

Below `lg` the row is a column (gap 16px) in the order Queue, ticket view, bottom bar, and there is no handle. The bottom bar is a sibling of the row inside the Container (visually the full width). It must not be inside the row: `position: sticky` only works inside a parent taller than the sticky element, and a wrapper holding only the bar is exactly as tall as the bar.

Resizable tickets pane (`lg+`). Between the panes sits `ResizeHandle`: a 9px hit area with a 1px `divider` line and a small grip, and the line turns `primary.main` and 2px wide on hover, focus-visible and while dragging. The default queue width is one third of the row, the clamp is 260px to half the row, and it is re-clamped on window resize (a `ResizeObserver` on the row). Dragging uses pointer events with `setPointerCapture` (mouse, touch, pen) and sets `user-select: none` on the body. Double-click resets to the default. The handle is `role="separator"` with `aria-orientation="vertical"`, `aria-label="Resize tickets pane"` and percentage `aria-valuenow/min/max`; ArrowLeft and ArrowRight move 16px, Home and End jump to the min and max. The width is stored in px in `localStorage` under `pp.layout.queueWidth` through `readJson` and `writeJson` in `storage.ts`, written on drag end and on key changes (not on every pointermove) and removed on reset. Invalid stored values are ignored.

Bottom bar (rendered by Layout around the `bottom` slot): a `Paper elevation={4} square` with `p: 1.5`, `mt: "16px"`, `boxSizing: "border-box"`, `position: { xs: "static", lg: "sticky" }`, `bottom: 0`, `zIndex: (theme) => theme.zIndex.appBar` (above pane content, below menus, dialogs and the snackbar) and `height: { lg: BOTTOM_BAR_HEIGHT }` (148). It holds two rows (decision 48): the players row (`Players`, 44px, a divider under it) and the deck row (the `1fr auto 1fr` grid with an empty left cell, `Deck` and `ActionBar`). The height is the same in idle, voting and revealed, so the panes above never jump; a crowded players row goes compact (avatars only) instead of wrapping. Not sticky and `height: auto` below `lg`.

Pane scrolling (lg and up). Each pane's content sits in a `Box component="section"` with an `aria-label` ("Tickets", "Ticket") and `sx={{ maxHeight: { lg: PANE_MAX_HEIGHT }, overflowY: { lg: "auto" } }}`. The heights are constants at the top of `Layout.tsx`, in px, except the bottom bar, which `Layout` measures:

- `HEADER_HEIGHT = 48`, imported from `layoutConstants.ts` (the same constant `Header` uses for its own height).
- Bottom bar: `BOTTOM_BAR_HEIGHT = 148`, fixed at `lg`. That is 12px padding top and bottom, the 44px players row, the 8px gap and 68px for the deck row (64px cards plus the selected card's 4px lift), with a little slack. A `ResizeObserver` on the bar still writes its rendered height to the `--bottom-bar-height` CSS variable on the Container, and the pane max-height reads that variable with `BOTTOM_BAR_HEIGHT` as the fallback before the first measurement.
- `PAGE_TOP_PADDING = 16` (Container `pt`; no bottom padding at lg and up) and `BAR_GAP = 16` (gap between panes and bar).
- `PANE_MAX_HEIGHT = calc(100vh - 48px - var(--bottom-bar-height, 148px) - 32px)`, where the 32px is the two 16px constants. This is the header and bar heights with the paddings included so the page itself never scrolls.

To keep the sticky bar on the bottom edge when the panes are short, the Container is a flex column with `minHeight: { lg: "calc(100vh - 48px)" }` and the pane row has `flexGrow: 1`. With the header above it the page is exactly one viewport tall at lg and up; only the two panes scroll. Below `lg` panes grow naturally and the page scrolls.

### components/TicketView.tsx

Props: `{ ticket: Ticket | null }`. Display only; QueuePanel and SessionHistory own picking and loading. Replaces `TicketDescription`. With no ticket it shows the empty-state guide: "Pick a ticket to start" and three numbered steps (pick a ticket from the queue, everyone picks a card, reveal and save points to Jira). With a ticket it shows a header and three tabs.

Header: a small line with the issue-type icon, type name, key as a link and an icon link to Jira (both `target="_blank"`, `rel="noopener noreferrer"`; this replaces the "Open in Jira" button, and it is still the way to edit text in Jira since the app never edits tickets); the summary as the `h2`; a "Current points" box on the right (the value, or "–" when unset); and a labeled row (label above value) for Status, Priority, Assignee ("Unassigned" when null) and Labels (omitted when empty).

Tabs: "Description", "Comments" (with a count badge) and "History". The `Tabs` are `variant="scrollable"` with `scrollButtons="auto"` and `allowScrollButtonsMobile`, because three tabs need about 270px and the pane can be narrower than that on small screens or when the resizable queue pane is widened; without it History is clipped with no way to reach it. The Comments badge has enough right padding to sit inside the scroller. The selected tab resets to Description when a different ticket loads. The description is `HtmlBody`, or a muted "No description". `TicketComments` renders the Comments tab and `TicketHistory` the History tab (below).

### components/TicketComments.tsx

Props: `{ ticket: Ticket | null }`, used inside `TicketView`. A muted "No comments" or a `List` with one item per comment in array order (the server sends oldest first and the client never sorts): initials avatar, author, relative time from `createdAt` inside a `<time dateTime>` with the full date in a tooltip, then `HtmlBody`.

### components/EntryRow.tsx

Props: `{ author: string; createdAt: string; children: ReactNode }`. The `ListItem` shared by the comments and history lists: initials avatar, author, and the relative time from `createdAt` inside a `<time dateTime>` with the full date in a tooltip, then the children. Extracted so the two lists cannot drift apart.

### components/TicketHistory.tsx

Props: `{ history: TicketHistoryEntry[]; truncated: boolean }`, used inside `TicketView` for the History tab. With no entries it shows the muted text "No history". Otherwise a `List` with one `EntryRow` per entry in array order (newest first; the client never sorts), each holding one line per change: the field name in bold, then the old value struck through (`<del>`), an arrow and the new value (`<ins>`). An empty side shows "–". A change with `edited: true` shows the field name and the word "edited" with no values. Values are React text children, never HTML, and long ones wrap. When `truncated` is true a caption "Showing the latest 100 changes" follows the list.

### components/HtmlBody.tsx and the safety rule

Props: `{ html: string }`. A `Box` with `dangerouslySetInnerHTML={{ __html: html }}` and an `sx` that styles `& p, & ul, & ol, & pre, & table, & blockquote` (bottom margin), `& ul, & ol` (left padding), headings (body-sized, bold), `& a`, `& code` (monospace, subtle background), `& pre` (`overflowX: "auto"` so wide code scrolls sideways), `& table` (`display: "block"`, `overflowX: "auto"`, `maxWidth: "100%"`, collapsed borders) and `& blockquote` (left border, muted). The root has `overflowWrap: "anywhere"` so long words and URLs wrap. Description and comments share it, so the rule lives in one file.

`descriptionHtml` and each comment's `bodyHtml` are sanitized on the server before they are sent: allowlisted tags only, no scripts or styles, images replaced by links, links already carrying `target` and `rel`. The client renders them with `dangerouslySetInnerHTML`, and that is safe only because of the server sanitizer. Two rules follow. First, `HtmlBody` is the only place in the client allowed to use `dangerouslySetInnerHTML`, and it carries `// biome-ignore lint/security/noDangerouslySetInnerHtml: server-sanitized HTML only; see spec 03 section 2`. Second, no other HTML source may be rendered this way: not Jira summaries, labels, usernames, queue items, search results or error messages. Those stay plain React text, which React escapes. The client does no sanitizing of its own, so a bug in the server sanitizer is a client XSS bug; do not add a client-side sanitizer dependency to paper over it.

### components/Players.tsx

Props: `{ players: PlayerView[]; phase: Phase; meId: number | null; stats: Snapshot["stats"] }`. Replaces `ParticipantChips`. It is the players row, the top row of the bottom bar (decision 48): a fixed `height: 44px` at `lg` (`minHeight` 44 below), `pb: 1` and a 1px `divider` bottom border. At `lg` it uses the deck row's `1fr auto 1fr` grid with a 16px column gap: an empty left cell, the player pills in the center column so they sit centered over the deck (the user's request, 11/05/2026), and `RoundSummary` in the right cell (`justifySelf: "end"`). Below `lg` the pills and the summary stack, centered, and the row grows. The pills list wraps below `lg` (`flexWrap: { xs: "wrap", lg: "nowrap" }`) and clips only at `lg` (`overflow: { lg: "hidden" }`), where the row has its fixed height: compact mode only drops the names, and non-shrinking pills can still be wider than a phone, which hid the trailing players and their votes (PR review, 11/05/2026).

Each player is a pill, an `li` with background `action.hover`, radius 16px, padding `3px 8px 3px 3px` and a 6px gap: a 26px initials avatar, the username (caption at 13px, bold for the viewer, cut with an ellipsis at `maxWidth: 96`) and an inline 18×24 mini card. Pills never shrink. Card state is chosen by `phase` and never by `p.vote` before reveal: waiting is a dashed outline, voted is face-down, revealed is face-up with the value. After reveal, when numeric votes differ, the highest and lowest render in amber (outlier, always with the value as text, `findOutliers`). The viewer gets a ring on the avatar and a bold name; offline players are faded (opacity 0.35), with no card while voting; after reveal an offline player who voted keeps a face-up card (still faded) and counts toward the outliers, because the stats include that vote. The avatar carries the full username as its accessible name, each card has an `aria-label` such as "Ana voted 5, highest", and the list is a `ul` labeled "Participants".

Compact mode. When the pills do not fit, every pill hides its name at once and gets `title={username}` (the card's `aria-label` still carries the name), so the row stays uniform. The fit is measured, not a player count. A second, hidden copy of the pills with names always shown (a `ul` with `height: 0` and `width: max-content`) is compared with the room the center column has while it stays centered: at `lg`, `rowWidth - 2 * Math.max(summaryWidth, SUMMARY_RESERVED_WIDTH) - 2 * columnGap`; below `lg`, the row width. The hidden copy sits inside an absolutely positioned box with `inset: 0`, `overflow: hidden`, `pointer-events: none`, `aria-hidden` and `visibility: hidden`, so a copy wider than the window (12 or more players) never widens the page, while the inner list's `scrollWidth` still reports the full width. The summary is counted on both sides so the two `1fr` columns stay equal and the pills stay centered on the deck instead of drifting left. `SUMMARY_RESERVED_WIDTH` (400) is a typical revealed summary (a 5-card bar chart, "Avg 4.5 · Median 4.5", a "Spread 13–21" chip measured 390.4px, rounded up). Reserving it in both phases makes the decision independent of the phase (the user's decision, 11/05/2026): before, 7 players at 1440px showed names while voting and dropped them at the reveal, when the summary widened. A team that fits keeps its names in both phases, and a team that does not is compact in both. Measuring the hidden copy, never the visible list, keeps dropping the names from flipping the decision back, which would loop. One `ResizeObserver` watches the row, the summary and the hidden copy, so a reveal, a join or a resize re-checks.

### components/RoundSummary.tsx

Props: `{ phase: Phase; stats: Snapshot["stats"]; votedCount: number; connectedCount: number }`. The right side of the players row. Idle: nothing. Voting: "{votedCount} of {connectedCount} voted" (`body2`; `Players` counts connected players). Revealed, one row of three parts (it wraps below `lg`, `flexWrap: { xs: "wrap", lg: "nowrap" }` with a 4px row gap and centered lines, because with several distinct votes the three parts exceeded a 320px viewport and scrolled the page sideways; at `lg` it stays one row):

1. A bar chart with `role="img"` and an `aria-label` listing the counts, for example "2: 1 vote, 3: 3 votes". One 16px-wide bar per voted card, in `DECK` order (walked from the deck, because `Object.entries` puts integer-like keys first), with heights proportional to the count up to 18px and the card value as a 10px caption under each bar. Numeric cards are `primary.main` at 40% alpha, `?` and `☕` are `text.disabled`.
2. "Avg {average} · Median {median}" with the numbers bold and "–" for null.
3. One outlined small `Chip`: "Consensus" (`success`) when `stats.consensus`, otherwise "Spread {min}–{max}" (`warning`) when a numeric vote exists, otherwise "No numeric votes" (default).

### components/Deck.tsx

Props: `{ deck: readonly string[]; selected: string | null; disabled: boolean; onSelect: (card: string) => void; onClear: () => void }`. MUI: `Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }} role="group" aria-label="Voting cards"` containing one `Button` per card. Selected card is `variant="contained"`, others `outlined`; every button has `aria-pressed={isSelected}`, `disabled={disabled}`, and `sx={{ minWidth: 48, height: 64, fontSize: 20 }}`. Between `lg` and `xl` (1200 to 1535px) the gap is 4px (`spacing={{ xs: 1, lg: 0.5, xl: 1 }}`) and the cards' side padding is 8px, so "0.5", "13", "21" and "☕" shrink to the 48px minimum and the deck is 568px instead of 654px. That gives the two side cells the room the revealed actions need (see ActionBar). Clicking the selected card calls `onClear`; clicking any other calls `onSelect(card)`. This mirrors the server, where voting the same card twice clears the vote. In the bottom bar it is the center cell of the `1fr auto 1fr` grid, so it stays centered whatever the players or actions need. The selected card lifts slightly. `App` disables the Deck only when disconnected or when `phase === "idle"`, so votes can change after the reveal (decision 45). Do not add custom styling for the disabled state.

### components/ActionBar.tsx

Props: `{ phase: Phase; round: number; stats: Snapshot["stats"]; ticket: Ticket | null; deck: readonly string[]; disabled: boolean; jiraSave: JiraSave; onReveal: () => void; onReset: (opts: { clearTicket: boolean }) => void; onSave: (points: number) => void }`. It is the right cell of the bottom bar's deck row. It shows no stats (those are in `RoundSummary`, in the players row); `stats` is kept only to preset the select.

MUI composition: one `Stack direction="row" useFlexGap spacing={1}` with `alignItems: "center"` and `flexWrap: { xs: "wrap", lg: "nowrap" }`: it wraps below `lg`, and at `lg` it never wraps, because a second line overflowed the fixed 148px bar (at a 1200px layout, revealed, "Next" wrapped and overflowed by 19px). Between `lg` and `xl` its buttons take 12px side padding. With the narrower deck and the 8px deck-row gap, the right cell is 272px at a 1200px layout and the revealed row needs 240px, or 256px with the Save spinner; the bar's `scrollHeight` stays 148 in every case. It holds the controls for the current phase in this order:

- `phase === "voting"`: Reveal (`Button variant="contained"`), then the reset button.
- `phase === "revealed"`: a `FormControl size="small" sx={{ minWidth: 96 }}` with `InputLabel` (id from `useId`) and `Select` labeled "Points" whose `MenuItem`s are `deck.filter(isNumericCard)`; then Save (`Button variant="contained"`, visible text "Save" with `aria-label="Save to Jira"`, with a 16px `CircularProgress` as `startIcon` while saving); then the reset button. The labels are short so the revealed controls fit one row at laptop widths (decision 48).
- `phase === "idle"`: the reset button only.
- The reset button is `Button variant="outlined"` whose label is a lookup by phase (below).
- The Auto-reveal switch is not in this bar. It lives in the header's right side, before the status dot (see `QueueControls`), because in the bar it wrapped the reset button onto a second row after reveal (decision 41). The Reveal button stays for partial reveals.
- The save result is not shown in the bar. It appears as a top-center toast from App (decision 43), so the bar never changes height. `jiraSave` is still a prop because `status === "saving"` drives the Save button spinner.

Behaviors to preserve:

- Reveal is rendered only in `voting` and is enabled when `!disabled`.
- The reset button label is a lookup by phase: `idle` is "Start round", `voting` is "Reset", `revealed` is "Next". It is enabled whenever `!disabled` and calls `onReset({ clearTicket: phase === "revealed" })`. In `revealed` ("Next") App sends `{ type: "reset", clearTicket: true }`, which returns the round to `idle` with no ticket so the team picks the next ticket from the queue. In `voting` ("Reset") and `idle` ("Start round") App sends `{ type: "reset" }`, which keeps the ticket and starts a new round (from idle it starts a ticket-less round).
- The select value is local state initialised to `""`. An effect re-runs `setPoints(suggestion ?? "")`, where `suggestion = suggestPoints(stats, deck)` is computed in the component body, when `phase`, `ticket?.key`, `round` or `suggestion` changes, so a new reveal or ticket never keeps a stale pick. It does not depend on `stats` itself (a new object every snapshot); `suggestion` is a string, so a vote change after the reveal re-suggests only when the most common vote actually changes. It carries this comment above the effect: `// biome-ignore lint/correctness/useExhaustiveDependencies: deck is stable; stats is omitted (a new object every snapshot), but suggestion is in the list so a vote change after the reveal re-suggests, and a manual pick (in memory, or stored for a refresh) still wins`. The state lives at the top of the component, so it survives the select unmounting and remounting between phases.
- Save is enabled only when `!disabled && phase === "revealed" && ticket !== null && points !== "" && jiraSave.status !== "saving"`. Clicking calls `onSave(Number(points))`. With no numeric votes, `suggestPoints` returns null, the select stays empty, and Save stays disabled until the user picks a value manually.
- A manual pick sticks. `stats` is a new object on every snapshot, so it is not a dependency of the effect; the select re-suggests when `phase`, `ticket?.key`, `round` or the suggested card changes, and a manual pick for this ticket and round wins over the suggestion. The pick is kept in a `useRef<{ ticketKey: string; round: number; points: string } | null>`, set in the select's change handler next to the `sessionStorage` write, because `writeJson` ignores failures: with storage blocked or full the stored copy is missing, and without the ref the next changed suggestion would silently replace the pick (PR review, 11/05/2026). The effect's order of preference for this ticket and round is the in-memory pick, then the stored pick, then the suggestion. A pick for another ticket or round, or outside `revealed`, clears the ref.
- A manual pick survives a refresh. Changing the select writes `{ ticketKey, round, points }` to `sessionStorage` key `pp.points.pick` (per tab). When the effect runs, a stored entry whose ticket key and round match the snapshot, while `phase === "revealed"`, and whose points are a numeric deck card, is used instead of the suggestion (and copied into the ref). Any other stored entry is stale and is removed, so a new reveal or ticket still never keeps an old pick. The suggestion itself is not stored.

### components/NoticeSnackbar.tsx

Props: `{ notice: { id: number; message: string; severity: "error" | "success" } | null }`. One shared toast for server errors, the local "Not connected" notice and Jira save results, so two toasts never stack. Holds its own `open` state. An effect keyed on the `notice` object sets `open` to `notice !== null`. Every event is a new object, so the same text arriving twice reopens the snackbar. It is not keyed on `notice.id`: the server's counter restarts at 1 after a server restart while the component survives the reconnect, so an id can repeat. MUI: `Snackbar open autoHideDuration={6000} anchorOrigin={{ vertical: "top", horizontal: "center" }}` whose `onClose(_, reason)` ignores `"clickaway"` and otherwise closes, containing `Alert severity={notice?.severity} variant="filled" onClose={close}` that shows `notice?.message`. Because it reads the prop, the last notice stays rendered during the exit transition and the severity does not flash to a default.

### MUI 9 note

In MUI 9, `Stack` system props such as `flexWrap`, `alignItems`, `justifyContent` are no longer accepted as top-level props; they must go inside `sx`. The reference code already does this (`sx={{ flexWrap: "wrap" }}`, `sx={{ alignItems: "center" }}`). `direction`, `spacing` and `useFlexGap` stay as props. Follow the same rule in `App.tsx`.

## 3. useGameSocket hook (client/src/useGameSocket.ts)

Signature:

```ts
export function useGameSocket(): {
  snapshot: Snapshot | null;
  me: { userId: number; username: string } | null;
  connected: boolean;
  send: (cmd: ClientCommand) => boolean;
  error: { id: number; message: string } | null;
  disconnectedReason: "unauthenticated" | "bad_origin" | null;
  search: (query: string) => void;
  searchResults: { query: string; items: QueueItem[]; error: string | null; pending: boolean } | null;
}
```

The first four members are the contract from the plan. `error` and `disconnectedReason` are additions required by section 4; keep them in the same returned object. Types come from `../../shared/protocol.ts` via `import type` (including `QueueItem` for the search results). The hook does not expose `deck`; `App` imports `DECK` from `../../shared/deck.ts` instead (the server sends the same constant in `hello`, and the hook may ignore it).

State: `snapshot`, `me`, `connected`, `error`, `disconnectedReason` are `useState`. A `socketRef` holds the current `WebSocket | null`. Everything else (attempt counter, timer, cancelled flag) lives inside the effect closure.

URL: `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`. If `new URLSearchParams(location.search).get("devUser")` is non-empty, append `?devUser=${encodeURIComponent(value)}`. Always forward it when present; the server decides whether to honor it (only in dev with `ALLOW_DEV_USER=1`). Never hardcode a port.

Connection lifecycle, implemented in one `useEffect(..., [])`:

1. `let cancelled = false; let attempt = 0; let timer: number | undefined;` and a `connect()` function that creates `new WebSocket(url)`, stores it in `socketRef.current`, and attaches handlers.
2. `onmessage`: `JSON.parse(event.data)` inside try/catch (ignore malformed frames). Switch on `type`:
   - `hello`: `setMe(msg.me)`, `setConnected(true)`, `attempt = 0`. Connected means "hello received", not merely "socket open", so controls stay disabled until the server has identified the user.
   - `state`: `setSnapshot(msg.snapshot)`.
   - `error`: `setError({ id: msg.id, message: `${msg.message} (${msg.reason})` })`. The reason is in the text so users can report it. Each call creates a new object, which is what reopens the snackbar for a repeated error (the id is the server's counter and can repeat after a server restart).
   - `searchResults`: keep it only if `msg.query` equals the latest query sent (a ref); otherwise drop it as stale. If kept, `setSearchResults({ query: msg.query, items: msg.items, error: msg.error, pending: false })`.
   - Unknown types are ignored.
3. `onclose(event)`: `socketRef.current = null`; `setConnected(false)`; if `cancelled` return. If `event.code === 4401` set `disconnectedReason` to `"unauthenticated"` and return; if `event.code === 1008` set `"bad_origin"` and return (both terminal: no retry, no timer). Otherwise schedule a retry: `const delay = Math.min(10_000, 500 * 2 ** attempt) * (0.5 + Math.random() / 2); attempt += 1; timer = window.setTimeout(connect, delay)`.
4. `onerror`: do nothing; browsers always follow it with `close`.
5. The last `snapshot` and `me` are never cleared on close, so the page keeps showing the last known state (disabled, with the "Reconnecting…" status) while the socket retries. A fresh `state` arrives right after the next `hello`.
6. Cleanup: set `cancelled = true`, `window.clearTimeout(timer)`, then take the current socket, null out its `onopen/onmessage/onclose/onerror` handlers, and `close()` it. Nulling handlers first prevents a stale socket from calling setState or scheduling a retry after unmount.

StrictMode safety: in development React mounts, unmounts and re-mounts the effect. The cleanup above fully disposes the first socket (browsers may log "closed before the connection is established"; that is acceptable). Because each mount has its own closure-scoped `cancelled`, `attempt` and `timer`, the two mounts cannot interfere. Do not keep these in module scope.

Optional but recommended: inside the same effect add listeners for `window` `online` and `document` `visibilitychange` (when `document.visibilityState === "visible"`). If not cancelled, no terminal reason set, and there is no socket currently OPEN or CONNECTING, clear any pending timer, set `attempt = 0` and call `connect()` immediately. Remove both listeners in cleanup. This helps laptops that sleep and iframes in background tabs.

Search (`search(query)`): `useCallback` with an empty dependency list. It trims the query. Under 2 characters it cancels any pending debounce timer, clears `latestQuery` and sets `searchResults` to null, and sends nothing. Otherwise it records the trimmed query in `latestQueryRef`, restarts a 400 ms debounce timer, and when the timer fires it calls `sendSearch(query)`, which calls `send({ type: "searchTickets", query })` and, if that returned true, sets `searchResults` to `{ query, items: [], error: null, pending: true }`. The hook also watches `snapshot.queueSettings.projectKey`: when it changes while a query is active, it cancels the debounce and calls `sendSearch(latestQuery)` at once (or sets `searchResults` to null if the socket is down), so another player's project change never leaves the old project's results on screen. The server drops the superseded search, so the old project's result normally never arrives. Server `searchResults` messages are delivered only to the requester. The debounce timer is cleared on unmount, and `searchResults` is left as is on socket close (it is cleared the next time the user types).

`send(cmd)`: wrapped in `useCallback` with an empty dependency list so its identity is stable. It reads `socketRef.current`; if that is null or `readyState !== WebSocket.OPEN`, return `false` (drop the command; never queue). Otherwise `socket.send(JSON.stringify(cmd))` and return `true`.

## 4. App.tsx wiring

`App` calls `useGameSocket()` once and renders:

```
<>
  <Header connected={connected} meName={me?.username} controls={snapshot ? <QueueControls ... /> : undefined} actions={snapshot ? <>Auto-reveal and Auto-advance switches</> : undefined} />
  ...content...
  <NoticeSnackbar notice={notice} />
</>
```

Content states, in priority order:

1. If `disconnectedReason` is non-null: render only an `Alert severity="warning"` inside `<Container maxWidth="md" sx={{ py: 2 }}>`. For `"unauthenticated"` the text is "Open this app inside the hosting platform" followed by a sentence that sign-in is handled by the platform and this page cannot identify you on its own. For `"bad_origin"` the text is "This page was opened from an address the server does not accept" with a hint to contact the service owner. Do not render the board.
2. Else if `snapshot === null`: centered `CircularProgress` (inside a `Box` with `display: "flex"`, `justifyContent: "center"`, `py: 6`). Give it `aria-label="Loading"`.
3. Else the board: `<Layout left={...} main={...} bottom={...} />`. Layout renders its own full-width Container, so App adds none around it. The full page order is Header, then Layout (two panes, then the bottom bar). Slots:

| Slot | Content |
|---|---|
| `left` | `<LeftPanel ... />` (wraps `QueuePanel` and `SessionHistory`) |
| `main` | `<TicketView ticket={snapshot.ticket} />` |
| `bottom` | a flex column holding `<Players ... />`, then a `Box` with `display: "grid"`, `gridTemplateColumns: { xs: "1fr", lg: "1fr auto 1fr" }` `gap: { xs: 2, lg: 1, xl: 2 }` and `mt: 1` holding an empty `<Box sx={{ display: { xs: "none", lg: "block" } }} />` (hidden when stacked, so it adds no gap), `<Deck ... />` and `<Box sx={{ justifySelf: { lg: "end" } }}><ActionBar ... /></Box>` |

The bottom bar is two rows. The players row is on top (pills centered over the deck, `RoundSummary` on the right). Below it the deck row is a grid `1fr auto 1fr` at `lg` and up: an empty left cell, Deck centered, ActionBar right (`justifySelf: "end"`). Below `lg` the deck row stacks, and the empty left cell is hidden so it adds no gap above the deck.

Derived values:

- `const disabled = !connected;`
- `const selected = snapshot.players.find((p) => p.userId === me?.userId)?.vote ?? null;` The server shows a player their own vote before reveal, so this works in `voting` too. It is a `Card | null`.
- `deck = DECK` (imported constant, passes as `readonly string[]`).

Props per component:

| Component | Props |
|---|---|
| Header | `connected`, `meName={me?.username}`, `controls` (QueueControls once a snapshot exists), `actions` (a fragment with the Auto-reveal and Auto-advance switches once a snapshot exists) |
| QueueControls | `settings={snapshot.queueSettings}`, `projects`, `boards`, `issueTypes={snapshot.issueTypes}`, `disabled`, `refreshing={snapshot.queue.loading}`, `onChangeSettings`, `onRefresh` |
| LeftPanel | `history={snapshot.history}`, plus the `QueuePanel` props below |
| QueuePanel | `queue={snapshot.queue}`, `searchResults` (from the hook), `currentKey={snapshot.ticket?.key ?? null}`, `disabled`, `onPick`, `onSearch={search}`, `boardUrl` |
| TicketView | `ticket={snapshot.ticket}` |
| Players | `players={snapshot.players}`, `phase={snapshot.phase}`, `meId={me?.userId ?? null}`, `stats={snapshot.stats}` |
| Layout | `left`, `main`, `bottom` as in the slot table above |
| Deck | `deck={DECK}`, `selected`, `disabled`, `onSelect`, `onClear` |
| ActionBar | `phase`, `round`, `stats`, `ticket` from snapshot, `deck={DECK}`, `disabled`, `jiraSave={snapshot.jiraSave}`, `onReveal`, `onReset`, `onSave` |

Deck should be disabled in `idle` (no round to vote in) in addition to `!connected`: pass `disabled={disabled || snapshot.phase === "idle"}`, so votes can still change after the reveal (decision 45). This is the one place App adds a phase rule; the server would reject the vote anyway, but the buttons should not invite it.

Command mapping, all through one helper `dispatch(cmd: ClientCommand)`:

| UI action | Command |
|---|---|
| Click an unselected card | `{ type: "vote", card: card as Card }` (Deck's `onSelect` gives `string`; cast to `Card`, which is imported as a type from shared/protocol.ts) |
| Click the selected card (clear) | `{ type: "vote", card: selected }` because the server toggles; `selected` is non-null whenever `onClear` can fire, but guard with `if (selected)` |
| Reveal | `{ type: "reveal" }` |
| Toggle the Auto-advance switch (header) | `{ type: "setAutoAdvance", enabled }` (shows `snapshot.autoAdvance`) |
| Toggle the Auto-reveal switch (header) | `{ type: "setAutoReveal", enabled }` (the switch shows `snapshot.autoReveal`, so it follows the room, not local state) |
| Next (phase `revealed`) | `{ type: "reset", clearTicket: true }`; returns to `idle` so the team picks the next ticket from the queue |
| Reset (phase `voting`) / Start round (phase `idle`) | `{ type: "reset" }` |
| Queue row or search result click | `{ type: "loadTicket", key }` (the key comes from a server-provided item, so no trimming or case change is needed) |
| Change a queue setting | `{ type: "setQueueSettings", settings }` (only the changed fields) |
| Refresh queue | `{ type: "refreshQueue" }`, then always `{ type: "refreshProjects" }` (the server retries projects and boards, which can fail independently) |
| Type in the search box | Not through `dispatch`: App passes the hook's `search` as `onSearch`, which sends `{ type: "searchTickets", query }` after a 400 ms debounce |
| Save to Jira | `{ type: "saveEstimate", points }` |

Notice handling. `dispatch` calls `send(cmd)`; if it returns false, App shows a local notice "Not connected. Your action was not sent." The snackbar takes one `{ id, message, severity }`, so App keeps `const [notice, setNotice] = useState<{ id: number; message: string; severity: "error" | "success" } | null>(null)`. Server errors come from the hook's `error`; an effect (`[error]` dependency, with a `biome-ignore lint/correctness/useExhaustiveDependencies` comment if Biome flags it) copies the hook's error into `notice` (severity `"error"`) whenever it changes. A second effect watches `snapshot?.jiraSave` with a `useRef` holding the previous status; only the transition from `"saving"` to `"saved"` or `"error"` sets a notice (`Saved {points} pts by {by}` with severity `"success"`, or `jiraSave.message` with severity `"error"`). The ref exists so joining, reconnecting or refreshing while `jiraSave` is already `"saved"` or `"error"` shows nothing; every snapshot is a new object, so the object alone cannot tell a new result from a repeat. Both effects share the local id counter below. Local notices use a counter in a `useRef` that starts at -1 and decrements, so local ids are negative and never collide with the server's positive ids. Pass `notice` to `NoticeSnackbar`. Because controls are disabled when not connected, this notice is a safety net for the short window between a socket dying and the `close` event arriving.

`App` is a named export `App` in `App.tsx`; `main.tsx` imports it as `import { App } from "./App.tsx"`. No context providers, no reducers.

## 5. main.tsx, theme.ts, index.html

`main.tsx`: get `document.getElementById("root")`, throw if null, then `createRoot(root).render(<StrictMode><ThemeProvider theme={theme}><CssBaseline /><App /></ThemeProvider></StrictMode>)`. Imports: `ThemeProvider` from `@mui/material/styles`, `CssBaseline` from `@mui/material/CssBaseline`, `theme` from `./theme.ts`. Remove the placeholder Typography and the TODO that exist in the scaffold.

`theme.ts` (keep as scaffolded): `createTheme({ typography: { fontFamily: "Lato, Roboto, sans-serif" } })`, exported as `theme`. No palette, no component overrides, no dark mode.

`index.html` (keep as scaffolded): `lang="en"`, viewport meta `initial-scale=1, width=device-width`, title "Pointing Poker", preconnect links to fonts.googleapis.com and fonts.gstatic.com (crossorigin), a stylesheet link for `family=Lato:wght@400;700&family=Roboto:wght@400;500;700&display=swap`, `<div id="root"></div>`, and `<script type="module" src="/src/main.tsx"></script>`. If Google Fonts is blocked (some Platform networks), the stack falls back to Roboto, then sans-serif; Roboto is also loaded from the same stylesheet, so a fully offline machine gets the system sans-serif. That is acceptable.

## 6. Vite config expectations

`vite.config.ts` is at the repo root and already exists; no change is needed. It sets `root: "client"`, `base: "/"`, `build.outDir: "../dist"` (the plugin appends `/client`; `"../dist/client"` produces `dist/client/client`) with `emptyOutDir: true`, and `plugins: [react(), viteFastify({ spa: true })]` (import `viteFastify` from `@fastify/vite/plugin`). The dev server is hosted by Fastify through `@fastify/vite`, in the same process and on the same port (3838) as the API and `/ws`, so there is no `server.proxy` block and the client must use relative/same-origin URLs only (the hook builds the WS URL from `location`). Production serves the built `dist/client` through the same plugin. HMR and `@fastify/websocket` are already reconciled in `server/routes/spa.ts`: a dev-only `onRequest` hook calls `reply.hijack()` for Vite's `vite-hmr` and `vite-ping` upgrades (verified; `04-infra.md` section 9, V3). If HMR fails again (symptom: failed `vite-hmr` connections in the browser console, or no hot update), check that hook first. Do not add `server.hmr.port`: in Vite 8 it is a deprecated alias for `server.ws.*`, and `@fastify/vite` pins HMR to Fastify's server, so it does not help.

## 7. UI states

The visual reference is the mock at `docs/spec/mocks/pointing-poker.html`. The mock reflects the earlier three-pane layout (LAYOUT C) and is not kept in sync with the redesign; section 2 (Layout.tsx) and section 4 are the source of truth for page structure. Open it in a browser to compare layout and spacing; the components above are the source of truth for behavior where the mock differs.

In every state where a ticket is loaded, TicketView shows an icon link to Jira beside the key. Clicking it opens `ticket.url` in a new tab; it never changes room state and is not disabled while offline.

| State | Header status | QueuePanel (left), TicketView (right) | Players (bottom bar, left) | Deck (bottom bar, middle) | ActionBar (bottom bar, right) |
|---|---|---|---|---|---|
| Loading (no snapshot yet) | Reconnecting… | not shown, spinner instead | not shown | not shown | not shown |
| Idle (no round) | Connected | Queue enabled, TicketView shows the "Pick a ticket to start" guide | Players, dashed empty cards | Disabled | "Start round" |
| Voting, empty | Connected | Queue, description and comments filled if a ticket is loaded | All dashed empty cards | Enabled, nothing pressed | Reveal and "Reset" |
| Voting, partial | Connected | same | Voted players hold a face-down card, others a dashed empty card; "X of Y voted"; no values shown | Own card pressed (contained, lifted) | Reveal and "Reset" (partial reveal is allowed) |
| Revealed | Connected | same | Each player's card is face-up with the vote ("–" for none), outliers in amber; on the right of the players row: the vote chart, Avg and Median, and a Consensus, Spread or No numeric votes chip | Enabled (votes can change), own card still pressed | Points select preset to suggestion, Save (enabled if ticket and points), "Next"; no Reveal |
| Saving | Connected | same | same | same | Save disabled with spinner; select still shown |
| Saved | Connected | Current points will update once the server refreshes the ticket | same | same | Green top-center toast "Saved N pts by name" for 6 seconds, shown to everyone in the room that saw the save finish |
| Error (server rejected a command) | Connected | same | same | same | Red top-center toast for 6 seconds with "message (reason)"; a failed Jira save shows the same red toast with Jira's message |
| Disconnected (retrying) | Reconnecting… (warning) | Last snapshot, all controls disabled | Last snapshot, offline dimming comes from the server's next state | Disabled | All buttons and the select disabled |
| Unauthenticated (close 4401) | n/a, bar shows only the title and "Reconnecting…" is acceptable | not shown | not shown | not shown | Warning alert "Open this app inside the hosting platform" only |
| Ticket with a long description | Connected | Ticket pane scrolls on its own at lg and up; code blocks and tables scroll sideways, long words wrap; the other panes and the bottom bar stay put | unchanged | unchanged | unchanged |
| Ticket with many comments | Connected | The Comments tab lists every comment oldest first and the main pane scrolls on its own; the bottom bar stays visible | unchanged | unchanged | unchanged |
| Ticket with no description or comments | Connected | "No description" and "No comments" in muted text | unchanged | unchanged | unchanged |
| Queue loading | Connected | Progress bar replaces the ticket count; the list stays visible | unchanged | unchanged | unchanged |
| Queue empty | Connected | "No unpointed tickets. Change the project or board, or refresh." | unchanged | unchanged | unchanged |
| Queue error | Connected | Inline warning alert with the error text; the header controls stay usable | unchanged | unchanged | unchanged |
| Search pending, empty, or error | Connected | Progress bar, "No matches", or inline warning under the search box; the queue below is unaffected | unchanged | unchanged | unchanged |

In the Disconnected state the Header status shows "Reconnecting…" even for terminal failures; this is accepted and the alert beneath it explains the cause.

## 8. Accessibility and responsive rules

Accessibility checklist (all already satisfied by the reference components; do not regress them):

- The deck is `role="group"` with `aria-label="Voting cards"`, each card is a native `Button` with `aria-pressed`.
- Each player's card has `role="img"` and an `aria-label` such as "Ana has voted", "Ana has not voted" or "Ana voted 5, highest"; the vote state is never conveyed by color alone (face-down versus dashed card, and outliers also carry text).
- The queue Selects have visible labels linked with `InputLabel` and `labelId`; the Refresh icon button has `aria-label="Refresh queue"`; the search `TextField` has a visible label ("Search tickets (key or text)"); the progress bars have accessible labels.
- Every interactive element is a native `button`, `input` or `a`, so Tab and Enter and Space work with no extra code. Do not add click handlers to non-interactive elements.
- Heading hierarchy: exactly one `h1` (in Header), at every width: below `lg` it is visually hidden, never `display: none`; the ticket summary is `h2`, and "Description" is `h3` under the summary. The Description, "Comments (n)" and "History" tab labels are tabs, not headings. Headings inside server HTML are styled at body size by `HtmlBody` (the sanitizer allowlist decides whether they appear at all).
- Each pane is a `section` with an `aria-label` ("Tickets", "Ticket"), and the players are a `ul` labeled "Participants", so screen reader users can jump between them.
- Comments, ticket history and session history are real lists (`List` renders `ul` with `li` items), so the count is announced. Each date is a `<time>` element with `dateTime`. History old and new values use `<del>` and `<ins>`, so the change is not conveyed by strike-through alone.
- Keyboard and the sticky bar: the bar is last in DOM order and every control in it is a native button or select, so Tab reaches it after the panes. Sticky positioning never covers a focused element in a pane, because the pane `maxHeight` stops above the bar, and the browser scrolls a focused element into view inside its pane. Do not add `tabIndex` to the panes. The player avatars are not interactive and are not tab stops; the resize handle between the panes is a tab stop.
- The page has exactly one `h1` (in Header) at every width, visible from `lg` and visually hidden (clip pattern) below it. Ticket key links (in TicketView, the queue and the search results) are the only external links and use `rel="noopener noreferrer"`.
- The loading spinner has an accessible label. The snackbar's `Alert` has the implicit `role="alert"` so errors and save results are announced.
- Text contrast comes from the stock MUI theme; do not lower opacity on text other than the offline player rows.

Responsive rules:

- Breakpoints: laptop widths are the target. At `lg` (1200px) and up: two columns (queue 4 and main 8 of 12) with independent scrolling and the two-row sticky bottom bar (section 2, Layout.tsx). Below `lg`: everything stacks full width in the order Queue, ticket view, then the bottom bar (players row, Deck, ActionBar stacked), the bar is not sticky and the page scrolls. No phone-specific work beyond "nothing breaks": no horizontal page scroll, and the Deck still wraps.
- Layout width: `Container maxWidth={false}` uses the whole page, with `px: { xs: 2, lg: 3 }` side gutters and no `maxWidth` cap.
- ActionBar is one row that wraps below `lg` (`flexWrap: { xs: "wrap", lg: "nowrap" }` with `useFlexGap`) so the controls never overflow there; at `lg` it never wraps and fits the right cell (see ActionBar).
- Deck wraps (`flexWrap`) when its section is narrower than eleven cards. Cards stay at least 48px wide and 64px tall; that height, plus the lift and the 44px players row, sets the 148px bottom bar.
- The header is a fixed 48px single row from `lg`. Below `lg` it is two rows (controls, then switches and status) and grows; the title is hidden there, and the queue selects shrink to `minWidth` 110 at `xs` and wrap so the header does not overflow on phones.
- No horizontal page scroll at 1000px or at 1440px. Verify by resizing the browser.
- Do not use fixed pixel widths on containers. `minWidth: 140` (110 at `xs`) on the three header selects, `minWidth: 96` on the points select, `maxWidth: 96` on pill names and `minWidth: 48` on cards are the only fixed widths. The fixed heights in `Layout.tsx` (header 48; bottom bar 148) apply at lg and up only.

## 9. Acceptance checklist for the implementer

Run `npm run lint`, `npm run tsc:check` and `npm run build`; all must pass with no Biome warnings (the five `biome-ignore` comments are expected (`useExhaustiveDependencies` in ActionBar, QueuePanel and TicketView, `noArrayIndexKey` in TicketHistory, and `noDangerouslySetInnerHtml` in HtmlBody) and must include their explanation text). Do not write tests. Then verify in a browser with `npm run dev` and `ALLOW_DEV_USER=1` set in the environment (or `.env`; never read or print `.env`):

1. Open `http://localhost:3838/?devUser=alice` in one browser profile and `http://localhost:3838/?devUser=bob` in another (separate profiles or one normal and one private window, so the identity does not collide). Each shows "You are alice" / "You are bob" and both appear in each other's list.
2. Queue: with the dev server pointed at Jira, the queue shows tickets for the selected project. Change the project and confirm the board select reloads its options and the list changes on both pages. Pick a board and confirm Bob's page shows the same board and sections, and that every listed ticket is not Done and has no Story Points. Alice clicks a row (not its key link); both pages show the same ticket card and that row reads "Current".
3. Search: type "dashboard" in the search box and confirm matching tickets appear after a short pause with a progress bar while waiting, and only on the page that searched. Type a full key such as `PP-123` and confirm it is found directly. With a project selected, type just the number (`123`) and confirm the same ticket is found (the server expands it to `PP-123`); with no project, a bare number runs a text search instead. A single character does nothing and clears the results. A query with no hits shows "No matches". Clicking a result row loads it for everyone.
4. Start a round if the phase is idle. Alice picks 5: her card shows pressed, Bob's list shows a face-down card for Alice but no value. Alice clicks 5 again: the card turns dashed again (vote cleared).
5. Both vote; Bob picks 8 and Alice 5, then Reveal (also try revealing with one vote). Values appear on the players' cards on both pages. The Save select presets to 8 (tie goes higher). Make both vote the same card in another round and confirm that card is preset. Vote `?` only and confirm Save stays disabled until a number is picked.
6. Save to Jira on a throwaway ticket: Save shows a spinner, then a green top-center toast "Saved N pts by name" on both pages (a page refreshed afterwards shows no toast), and Story Points change in Jira. The ticket also disappears from the queue on both pages once the queue refreshes. Trigger an error (for example save with an invalid or unreachable Jira) and confirm the red top-center toast appears with Jira's message and the bottom bar does not change height; trigger the same error twice and confirm the toast reopens.
7. Stop the dev server. Within a few seconds both pages show "Reconnecting…" and all controls become disabled while the last state stays visible. Restart the server; both pages reconnect on their own (backoff never exceeds about 10 seconds), the status dot returns to green, and controls re-enable.
8. Open the app with `ALLOW_DEV_USER` unset and no identity headers: the page shows "Open this app inside the hosting platform" and the browser network panel shows no reconnect attempts after the 4401 close.
9. Resize to 1000px wide (below the `lg` breakpoint): no horizontal scroll, sections stack, controls are usable. Tab through the page with the keyboard and confirm every control is reachable and the pressed card state is announced.
10. React StrictMode is on in dev: confirm in the server log that each page opens one lasting connection, not a growing number of them, and that edits to a component hot-update without a full reload.
11. Layout at 1440px wide: two columns visible side by side (queue left, ticket view right) and the two-row bottom bar always visible at the bottom edge: the players row on top with the pills centered over the Deck and the round summary on the right, then the Deck centered and the actions right. Load a ticket with a long description and many comments: the ticket pane scrolls independently, and the tickets pane and bottom bar do not move. The page itself has no vertical scrollbar.
12. Bottom bar by phase: in `voting` the right section shows Reveal and Reset only; in `revealed` it shows the Points select, Save and Next, and the players row shows each player's card face-up plus the vote chart, "Avg · Median" and a Consensus, Spread or No numeric votes chip. Join 12 or more dev users: the pills switch to avatars only, stay centered over the Deck, and the bar height does not change. The bar is the same height in idle, voting and revealed. Save results show as a top-center toast, so the bar keeps its height.
13. Below 1200px wide (for example 1000px): everything stacks full width in the order Queue, ticket view, bottom bar; the bar is not sticky; nothing is clipped and there is no horizontal scroll, including with a wide code block or table in the description.
14. Auto-reveal: with the header switch on, open two tabs as different users and have both vote; the cards flip without anyone pressing Reveal. Turn the switch off, start a new round and vote in both tabs; nothing flips and Reveal still works. Toggle the header switch in one tab and confirm it changes in the other. After a reveal, an offline player who voted still shows a faded face-up card.
15. Save toast: the Jira save result appears at the top center and the bottom bar keeps its height.
16. Ticket rendering: a description with a bulleted list, a link, a code block and a table renders with bullets, a clickable link (opens in a new tab), monospace code and a horizontally scrollable `pre`. An image in a description or comment appears as a link, not an `img`. Comments appear oldest first with author and a local date. A ticket with no description shows "No description"; one with no comments shows "Comments (0)" and "No comments". With no ticket loaded the main area shows the "Pick a ticket to start" guide. Tab reaches every control in the bottom bar. Click the Jira icon link in the ticket header: the ticket opens in a new tab and the app page keeps its state.
