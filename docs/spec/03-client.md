# Pointing Poker: client (frontend) specification

This document is self-contained. A coding session implementing the `client/` folder of the `pointing-poker` repo should need nothing else. Where it says "reference implementation", it means files that were already written and reviewed and are copied into the repo at `docs/spec/reference/client/src/components/*.tsx` and `docs/spec/reference/client/src/lib/estimate.ts`. Copy them into `client/src/` unchanged unless this document says otherwise. The shared contract lives in `shared/protocol.ts` and `shared/deck.ts` (already written; do not edit them). `Ticket` in `protocol.ts` carries `descriptionHtml`, `comments` (`TicketComment[]`, oldest first), `assignee`, `priority` and `labels` in addition to the summary fields. `shared/constants.ts` also exists and exports `ISSUE_KEY` and `MIN_QUERY_LENGTH`. The reference `QueuePanel.tsx` still has the label switches; the repo version drops them (decision 34).

> **Redesign (10/16/2026).** The header, layout, queue rows, ticket view, bottom bar and players were redesigned. The design is `docs/superpowers/specs/2026-10-16-ui-redesign-design.md` (decision 38). Where this file describes the earlier `TopBar`, three-pane layout, `TicketDescription`, `TicketComments` pane or `ParticipantChips`, the sections below now describe the redesigned components instead. The files under `docs/spec/reference/client/` and the mock are the earlier design and are not kept in sync.

## 1. Scope

The client is one page with no router. It uses the stock MUI 9 theme with only the font family changed to Lato (Roboto fallback). It uses the whole page width: two columns (queue on the left, ticket view on the right) under a slim header and above a single-row sticky bottom bar that holds the players, the deck and the actions. The target is laptop widths (internal tool, MacBook Pro screens, inside the hosting platform's service report iframe), so the full layout applies from the `lg` breakpoint (1200px) up. There is no phone layout work. Below `lg` the panes and the bar simply stack at full width and nothing should break; that is the whole requirement there. Everything is one shared room: there is no room picker or login screen. The only settings are the shared ticket queue settings (section 2, QueuePanel), which are room state, not per-user preferences. Identity comes from the server (auth proxy headers), so the client never asks who the user is. There are no client tests in v1 (decision, see `08-decision-log.md`). Do not add any dependency beyond what `package.json` already lists: react, react-dom, @mui/material, @mui/icons-material, @emotion/react, @emotion/styled. Do not add a router, state library, or form library.

Lint is Biome (`npm run lint` is `biome ci .`): double quotes, 2-space indent, line width 100, React lint domain on. Type check is `tsc --noEmit -p tsconfig.json` (strict, `verbatimModuleSyntax`, `allowImportingTsExtensions`). That means: always `import type` for type-only imports, and always write the `.ts`/`.tsx` extension on relative imports, as the reference files do.

## 2. File map

```
client/index.html                 HTML shell, Lato font link, #root, module script
client/src/main.tsx               createRoot, StrictMode, ThemeProvider, CssBaseline, renders <App />
client/src/theme.ts               createTheme with Lato typography (already exists in the scaffold; keep)
client/src/App.tsx                owns useGameSocket, fills the Layout slots, maps UI actions to commands
client/src/useGameSocket.ts       WebSocket client hook (section 3)
client/src/lib/estimate.ts        suggestPoints (reference, copy as is)
client/src/lib/initials.ts        initials(name) for avatars (Players, EntryRow)
client/src/lib/relativeTime.ts    relativeTime(iso): short "2d" labels (EntryRow, SessionHistory)
client/src/components/Header.tsx             slim light header: queue controls, title, status dot and username
client/src/components/layoutConstants.ts     HEADER_HEIGHT (48), shared by Header and Layout
client/src/components/QueueControls.tsx      Project and Board selects and Refresh (moved out of QueuePanel)
client/src/components/LeftPanel.tsx          the left pane's card: Queue and History tabs
client/src/components/QueuePanel.tsx         search, queue sections, two-line clickable rows
client/src/components/SessionHistory.tsx     this room's revealed tickets, newest first
client/src/components/TicketRowFrame.tsx     the two-line clickable row shared by the queue and session history
client/src/components/Layout.tsx             three slots (left, main, bottom), the tickets pane width and the bottom bar height
client/src/components/ResizeHandle.tsx       draggable, keyboard-operable separator between the panes
client/src/components/IssueTypeIcon.tsx      Jira issue type to icon, with a default
client/src/components/TicketView.tsx         empty-state guide, or ticket header plus Description and Comments tabs
client/src/components/TicketComments.tsx     comments list, rendered inside TicketView
client/src/components/TicketHistory.tsx      Jira changelog list, rendered inside TicketView
client/src/components/EntryRow.tsx           avatar, author and time header shared by comments and history
client/src/components/HtmlBody.tsx           the only dangerouslySetInnerHTML in the client
client/src/components/Players.tsx            avatars holding cards, voted count and stats
client/src/components/Deck.tsx
client/src/components/ActionBar.tsx
client/src/components/ErrorSnackbar.tsx
```

`TopBar.tsx`, `TicketDescription.tsx` and `ParticipantChips.tsx` were deleted by the redesign. Files to author from scratch: `App.tsx` and `useGameSocket.ts`. `index.html`, `main.tsx` and `theme.ts` already exist in the scaffold; `main.tsx` needs only the `<App />` swap. The nine components, `HtmlBody.tsx` and `estimate.ts` come from the reference folder. `TicketPanel.tsx` and `ParticipantList.tsx` no longer exist; do not create them. Reading the reference files is the fastest route; the summaries below are the contract each one must keep. Do not rename props.

### lib/estimate.ts

`suggestPoints(stats: Snapshot["stats"], deck: readonly string[]): string | null`. Returns null when `stats` is null. Otherwise it scans `stats.counts` and picks the numeric card with the highest count. A card is eligible only if `isNumericCard(card)`, `deck.includes(card)` and `count > 0`. So `?` and the coffee card are never suggested, and counts for cards that are not in the deck passed in are ignored. On a tie the numerically higher card wins ("when the room is split, the cautious estimate is the bigger one"). Returns null when no eligible card exists. Returns a string (a card), not a number.

### components/Header.tsx

Props: `{ connected: boolean; meName?: string; controls?: ReactNode }`. A `Box component="header"` of height `HEADER_HEIGHT` (48, from `layoutConstants.ts`, so `Layout` and `Header` always agree), light grey background and a bottom border, not an `AppBar`. A three-column grid `1fr auto 1fr` keeps the title centered whatever the side widths are. Left: the `controls` slot (App passes `QueueControls`, and passes nothing until the first snapshot). Center: "Pointing Poker" as the page's only `h1`, hidden below `md`. Below `md` the grid is `minmax(0,1fr) auto` (controls take the free width, status on the right); below `sm` it is one column and the header grows to two rows (status above, controls below, `height: auto`, `minHeight` 48) because the controls need about 270px and do not fit beside the status at 320px. From `sm` the height is the fixed 48, and `Layout` uses `HEADER_HEIGHT` only at `lg` and up. Right: a status dot (green with tooltip "Connected", amber with tooltip and visible text "Reconnecting…" when disconnected) and the viewer's username. Color is never the only signal.

### components/QueueControls.tsx

Props: `{ settings, projects, boards, disabled, onChangeSettings, onRefresh, refreshing? }`. The Project select, Board select and Refresh icon button that used to be the first row of `QueuePanel`, with the same handlers and disabled rules. Single row with no wrap (the header gives it the full width below `sm`, see Header). The selects have `minWidth` 110 at `xs` and 140 from `sm`. `refreshing` (App passes `snapshot.queue.loading`) keeps Refresh disabled while the queue loads.

### components/LeftPanel.tsx

Props: the `QueuePanel` props plus `history: SessionHistoryEntry[]` (App passes `snapshot.history`). It owns the left pane's `Paper` and its two tabs, "Queue" and "History"; `QueuePanel` no longer draws an outer `Paper`. The History tab label carries a count badge (`history.length`, shown at zero). The tab bar is sticky at the top of the pane, because `Layout`'s pane is the element that scrolls. The selected tab is per tab of the browser: `sessionStorage` key `pp.left.tab` (`"queue"` or `"history"`, anything else reads as `"queue"`) through `readJson` and `writeJson`. Both panels stay mounted and the inactive one is hidden (`hidden`), because remounting `QueuePanel` would re-send its restored search query to Jira on every tab switch. `SessionHistory` gets `history`, `currentKey`, `disabled` and `onPick` from the same props.

### components/SessionHistory.tsx

Props: `{ history: SessionHistoryEntry[]; currentKey: string | null; disabled: boolean; onPick: (key: string) => void }`. With no rows it shows the muted text "Nothing pointed yet in this room." Otherwise a dense `List` with one `TicketRowFrame` per row, in array order (the server sends newest first). The badge is the saved points, or "–" when the ticket was revealed but not saved. The second line is a detail line, also set as its `title` tooltip: `avg {average}`, then "consensus" or `{min}–{max}`, then "re-voted" when `revoted`, then "✓ saved" when `savedPoints` is set, then `relativeTime(revealedAt)`, joined with " · ". When `average` is null (only non-numeric votes) the avg and range parts are left out. Clicking a row calls `onPick(key)`, which loads that ticket again for the room, exactly like a queue row, and the current ticket's row is highlighted and not clickable. The history is room state and lasts until a server restart; it is not stored in the browser.

### components/TicketRowFrame.tsx

Props: `{ issueType; ticketKey; url; isCurrent; disabled; onPick; badge: ReactNode; secondLine: ReactNode }`. The row layout that used to live inside `QueuePanel`'s `TicketRows`, extracted so the queue, the search results and `SessionHistory` look and behave the same: type icon, key as a `Link` to `url` (new tab, `rel="noopener noreferrer"`, its click does not pick the ticket), a badge on the right, then the second line on one line with ellipsis. The whole row is a `ListItemButton`; the current row is highlighted with a left accent border, has `aria-current`, and ignores clicks. Other rows are disabled while `disabled` is true. `QueuePanel` passes the status as the badge and the summary as the second line.

### components/QueuePanel.tsx

Props: `{ queue: QueueState; searchResults: SearchResults | null; currentKey: string | null; disabled: boolean; onPick: (key: string) => void; onSearch: (query: string) => void; boardUrl: string | null }`. The settings row (Project, Board, Refresh) moved to `QueueControls` in the header, so the rows below that mention it no longer apply to this component. `boardUrl` is computed in `App.tsx` (memoized; the Jira origin comes from the first item's `url`, and the URL needs a project key and a board id) and is the target of the "Open the full board in Jira" link. Rows are two lines (type icon, key link and status badge; then the summary with ellipsis) and the whole row is a button that calls `onPick`; the current ticket's row is highlighted and not clickable (design spec section 3). `SearchResults` is `{ query: string; items: QueueItem[]; error: string | null; pending: boolean }`, exported from `QueuePanel.tsx` and structurally identical to the hook's `searchResults` value. Types come from `shared/protocol.ts`. The team picks the next ticket from a shared queue of unpointed Jira tickets instead of typing a key. Settings are shared room state: changing one changes the queue for everyone.

MUI: `Stack spacing={2}` (the `Paper` and the padding now come from `LeftPanel`) with these rows, top to bottom:

1. Settings: not part of this component. The Project and Board selects and Refresh live in `QueueControls` in the header. The component starts with the search box.
2. Search: a `TextField size="small"` labeled "Search tickets (key or text)" with a `SearchIcon` start adornment. Local state holds the text; every change calls `onSearch(text)` (the hook debounces and ignores short queries). The text is persisted per tab in `sessionStorage` key `pp.search.query` (a JSON string; removed when the box is cleared) and restored on load. A search sent while the socket is down is dropped, so an effect keyed on `disabled` re-sends a non-empty query each time the connection comes up, which brings restored results back after a refresh and refreshes them after a reconnect. Below it, driven by `searchResults`: a `LinearProgress aria-label="Searching"` while `pending`; an inline `Alert severity="warning"` with `error` when not pending and `error` is set; "No matches" when not pending and `items` is empty; otherwise the result rows. When `searchResults` is null nothing renders.
3. Queue status: a `LinearProgress aria-label="Loading queue"` while `queue.loading`; else an inline `Alert severity="warning"` with `queue.error`; else a `Typography variant="caption"` "{n} tickets · updated {time}" (n is the sum of the sections' `total`; time from `fetchedAt` via `toLocaleTimeString`, omitted when null).
4. Queue list: unless loading or error, and when `queue.sections` is empty, the text "No unpointed tickets. Change the project or board, or refresh." Otherwise one block per section, in order. Kind `all` (no board) has no header and is a plain `TicketRows` list. Other kinds (`active`, `future`, `backlog`) get a dense header row: a button with `aria-expanded` and `aria-controls`, an ExpandMore or ExpandLess icon, the section name, a small "active" or "future" label (none for backlog), and the count (`total` when `items.length === total`, else "{items.length} of {total}"). The body is an MUI `Collapse`. When `items.length < total`, the last row is the link "Open the full board in Jira" to `{jiraBase}/jira/software/c/projects/{projectKey}/boards/{boardId}/backlog`, shown only when the Jira base URL can be derived from the first item's `url` origin, otherwise omitted. Collapse state is per viewer: React state, default all expanded, persisted to `localStorage` key `pp.queue.collapsed` (a JSON array of section ids). All Web Storage access goes through `client/src/storage.ts` (`readJson`, `writeJson`, `removeItem`), which wraps every call in try/catch and ignores failures. The queue list stays separate from, and below, the search results.
Rows (queue and search results share one internal `TicketRows` component): two lines per row. Line 1 is the issue-type icon (a small map from Jira type name to an MUI icon, generic for others), the key as a `Link` to `item.url` (`rel="noopener noreferrer"`, opens in a new tab, and its click does not point the ticket) and the status as a small badge on the right. Line 2 is the summary on one line with ellipsis and the full text in a `title` tooltip. The whole row is a button that calls `onPick(item.key)`; the row whose key equals `currentKey` is highlighted (tint and left accent border) and not clickable.

### components/Layout.tsx

Props: `{ left: ReactNode; main: ReactNode; bottom: ReactNode }`. It holds one piece of state, the tickets pane width, and no data. It renders a `Container maxWidth={false}` with `sx={{ px: { xs: 2, lg: 3 } }}` (full width), then a flex row of the two panes, then the bottom bar.

| Slot | Position | Content from App |
|---|---|---|
| `left` | left pane, fixed px width at `lg+` | `LeftPanel` (Queue and History tabs) |
| `main` | `flex: 1; minWidth: 0` | `TicketView` |
| `bottom` | outside the row, full width | players, `Deck`, `ActionBar` in a three-column grid |

Below `lg` the row is a column (gap 16px) in the order Queue, ticket view, bottom bar, and there is no handle. The bottom bar is a sibling of the row inside the Container (visually the full width). It must not be inside the row: `position: sticky` only works inside a parent taller than the sticky element, and a wrapper holding only the bar is exactly as tall as the bar.

Resizable tickets pane (`lg+`). Between the panes sits `ResizeHandle`: a 9px hit area with a 1px `divider` line and a small grip, and the line turns `primary.main` and 2px wide on hover, focus-visible and while dragging. The default queue width is one third of the row, the clamp is 260px to half the row, and it is re-clamped on window resize (a `ResizeObserver` on the row). Dragging uses pointer events with `setPointerCapture` (mouse, touch, pen) and sets `user-select: none` on the body. Double-click resets to the default. The handle is `role="separator"` with `aria-orientation="vertical"`, `aria-label="Resize tickets pane"` and percentage `aria-valuenow/min/max`; ArrowLeft and ArrowRight move 16px, Home and End jump to the min and max. The width is stored in px in `localStorage` under `pp.layout.queueWidth` through `readJson` and `writeJson` in `storage.ts`, written on drag end and on key changes (not on every pointermove) and removed on reset. Invalid stored values are ignored.

Bottom bar (rendered by Layout around the `bottom` slot): a `Paper elevation={4} square` with `p: 1.5`, `mt: "16px"`, `boxSizing: "border-box"`, `position: { xs: "static", lg: "sticky" }`, `bottom: 0`, `zIndex: (theme) => theme.zIndex.appBar` (above pane content, below menus, dialogs and the snackbar), `minHeight: { lg: 88 }`, `maxHeight: { lg: 140 }` and `overflowY: { lg: "auto" }`. The bar sizes to its content (so a second row of players is never hidden) and scrolls only past about two player rows. Not sticky and no height limits below `lg`.

Pane scrolling (lg and up). Each pane's content sits in a `Box component="section"` with an `aria-label` ("Tickets", "Ticket") and `sx={{ maxHeight: { lg: PANE_MAX_HEIGHT }, overflowY: { lg: "auto" } }}`. The heights are constants at the top of `Layout.tsx`, in px, except the bottom bar, which `Layout` measures:

- `HEADER_HEIGHT = 48`, imported from `layoutConstants.ts` (the same constant `Header` uses for its own height).
- Bottom bar: auto height. `BOTTOM_BAR_FALLBACK_HEIGHT = 88` is the minimum (the Deck cards are 64px tall plus 12px padding top and bottom) and the fallback before the first measurement; `BOTTOM_BAR_MAX_HEIGHT = 140` caps it at about two player rows. A `ResizeObserver` on the bar writes its rendered height to the `--bottom-bar-height` CSS variable on the Container, and the pane max-height reads that variable, so the panes shrink when the bar grows.
- `PAGE_TOP_PADDING = 16` (Container `pt`; no bottom padding at lg and up) and `BAR_GAP = 16` (gap between panes and bar).
- `PANE_MAX_HEIGHT = calc(100vh - 48px - var(--bottom-bar-height, 88px) - 32px)`, where the 32px is the two 16px constants. This is the header and bar heights with the paddings included so the page itself never scrolls.

To keep the sticky bar on the bottom edge when the panes are short, the Container is a flex column with `minHeight: { lg: "calc(100vh - 48px)" }` and the pane row has `flexGrow: 1`. With the header above it the page is exactly one viewport tall at lg and up; only the two panes scroll. Below `lg` panes grow naturally and the page scrolls.

### components/TicketView.tsx

Props: `{ ticket: Ticket | null }`. Display only; QueuePanel and SessionHistory own picking and loading. Replaces `TicketDescription`. With no ticket it shows the empty-state guide: "Pick a ticket to start" and three numbered steps (pick a ticket from the queue, everyone picks a card, reveal and save points to Jira). With a ticket it shows a header and three tabs.

Header: a small line with the issue-type icon, type name, key as a link and an icon link to Jira (both `target="_blank"`, `rel="noopener noreferrer"`; this replaces the "Open in Jira" button, and it is still the way to edit text in Jira since the app never edits tickets); the summary as the `h2`; a "Current points" box on the right (the value, or "–" when unset); and a labeled row (label above value) for Status, Priority, Assignee ("Unassigned" when null) and Labels (omitted when empty).

Tabs: "Description", "Comments" (with a count badge) and "History". The selected tab resets to Description when a different ticket loads. The description is `HtmlBody`, or a muted "No description". `TicketComments` renders the Comments tab and `TicketHistory` the History tab (below).

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

Props: `{ players: PlayerView[]; phase: Phase; meId: number | null; stats: Snapshot["stats"] }`. Replaces `ParticipantChips`. It is the left cell of the bottom bar and wraps inside that cell, so it never moves the deck. Each player is an initials avatar with a small card tucked behind its top-right corner and the username below (ellipsis when long). Card state is chosen by `phase` and never by `p.vote` before reveal: waiting is a dashed outline, voted is face-down, revealed is face-up with the value. After reveal, when numeric votes differ, the highest and lowest render in amber (outlier, always with the value as text). The viewer gets a ring and a bold name; offline players are faded with no card. The avatar carries the full username as its accessible name, and the list is a `ul` labeled "Participants". Beside the players: "X of Y voted" during voting (Y counts connected players) and, after reveal, the average, a count chip per card and a consensus chip. The stats block shrinks and wraps so it never crowds out player tiles.

### components/Deck.tsx

Props: `{ deck: readonly string[]; selected: string | null; disabled: boolean; onSelect: (card: string) => void; onClear: () => void }`. MUI: `Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }} role="group" aria-label="Voting cards"` containing one `Button` per card. Selected card is `variant="contained"`, others `outlined`; every button has `aria-pressed={isSelected}`, `disabled={disabled}`, and `sx={{ minWidth: 48, height: 64, fontSize: 20 }}`. Clicking the selected card calls `onClear`; clicking any other calls `onSelect(card)`. This mirrors the server, where voting the same card twice clears the vote. In the bottom bar it is the center cell of the `1fr auto 1fr` grid, so it stays centered whatever the players or actions need. The selected card lifts slightly. After reveal the Deck is disabled, so the unselected cards are dimmed by MUI's disabled style and the selected card keeps its contained (filled) look, also dimmed by that style; do not add custom styling for this.

### components/ActionBar.tsx

Props: `{ phase: Phase; round: number; stats: Snapshot["stats"]; ticket: Ticket | null; deck: readonly string[]; disabled: boolean; jiraSave: JiraSave; onReveal: () => void; onReset: (opts: { clearTicket: boolean }) => void; onSave: (points: number) => void }`. It is the right section of the bottom bar. It shows no stats (those are in `Players`); `stats` is kept only to preset the select.

MUI composition: one `Stack direction="row" useFlexGap spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}`, one row that wraps when the controls and the save alert do not fit (below `lg`), holding the controls for the current phase in this order:

- `phase === "voting"`: Reveal (`Button variant="contained"`), then the reset button.
- `phase === "revealed"`: a `FormControl size="small" sx={{ minWidth: 140 }}` with `InputLabel` (id from `useId`) and `Select` labeled "Story points" whose `MenuItem`s are `deck.filter(isNumericCard)`; then Save (`Button variant="contained"`, "Save to Jira", with a 16px `CircularProgress` as `startIcon` while saving); then the reset button.
- `phase === "idle"`: the reset button only.
- The reset button is `Button variant="outlined"` whose label is a lookup by phase (below).
- Last in the row, at the far right: when `jiraSave.status === "saved"` an `Alert severity="success" sx={{ py: 0, maxWidth: 260 }}` "Saved {points} pts by {by}"; when `"error"` an `Alert severity="error"` with the same sx showing `jiraSave.message`. Decision: compact inline Alerts, not the snackbar. The snackbar stays reserved for server error messages (section 3), so a failed Jira save still shows both.

Behaviors to preserve:

- Reveal is rendered only in `voting` and is enabled when `!disabled`.
- The reset button label is a lookup by phase: `idle` is "Start round", `voting` is "Reset", `revealed` is "Next ticket". It is enabled whenever `!disabled` and calls `onReset({ clearTicket: phase === "revealed" })`. In `revealed` ("Next ticket") App sends `{ type: "reset", clearTicket: true }`, which returns the round to `idle` with no ticket so the team picks the next ticket from the queue. In `voting` ("Reset") and `idle` ("Start round") App sends `{ type: "reset" }`, which keeps the ticket and starts a new round (from idle it starts a ticket-less round).
- The select value is local state initialised to `""`. An effect re-runs `setPoints(suggestPoints(stats, deck) ?? "")` when `phase` or `ticket?.key` changes, so a new reveal or ticket never keeps a stale pick. It reads `stats` inside the effect but does not depend on it. It carries this comment above the effect: `// biome-ignore lint/correctness/useExhaustiveDependencies: deck is stable; stats is omitted so a manual pick survives later snapshots`. The state lives at the top of the component, so it survives the select unmounting and remounting between phases.
- Save is enabled only when `!disabled && phase === "revealed" && ticket !== null && points !== "" && jiraSave.status !== "saving"`. Clicking calls `onSave(Number(points))`. With no numeric votes, `suggestPoints` returns null, the select stays empty, and Save stays disabled until the user picks a value manually.
- A manual pick sticks. `stats` is a new object on every snapshot, so it is not a dependency of the effect; the select re-suggests only when `phase`, `ticket?.key` or `round` changes.
- A manual pick survives a refresh. Changing the select writes `{ ticketKey, round, points }` to `sessionStorage` key `pp.points.pick` (per tab). When the effect runs, a stored entry whose ticket key and round match the snapshot, while `phase === "revealed"`, and whose points are a numeric deck card, is used instead of the suggestion. Any other stored entry is stale and is removed, so a new reveal or ticket still never keeps an old pick. The suggestion itself is not stored.

### components/ErrorSnackbar.tsx

Props: `{ error: { id: number; message: string } | null }`. Holds its own `open` state. An effect keyed on the `error` object sets `open` to `error !== null`. Every event is a new object, so the same text arriving twice reopens the snackbar. It is not keyed on `error.id`: the server's counter restarts at 1 after a server restart while the component survives the reconnect, so an id can repeat. MUI: `Snackbar open autoHideDuration={6000}` whose `onClose(_, reason)` ignores `"clickaway"` and otherwise closes, containing `Alert severity="error" variant="filled" onClose={close}` that shows `error?.message`.

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
  <Header connected={connected} meName={me?.username} controls={snapshot ? <QueueControls ... /> : undefined} />
  ...content...
  <ErrorSnackbar error={notice} />
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
| `bottom` | a `Box` with `display: "grid"` and `gridTemplateColumns: { xs: "1fr", lg: "1fr auto 1fr" }` holding `<Box sx={{ minWidth: 0 }}><Players ... /></Box>`, `<Deck ... />` and `<Box sx={{ justifySelf: { lg: "end" } }}><ActionBar ... /></Box>` |

The bottom bar is a grid `1fr auto 1fr` at `lg` and up: Players left (`minWidth: 0`, so a long list wraps inside its cell), Deck centered, ActionBar right (`justifySelf: "end"`). Below `lg` the three stack in that order.

Derived values:

- `const disabled = !connected;`
- `const selected = snapshot.players.find((p) => p.userId === me?.userId)?.vote ?? null;` The server shows a player their own vote before reveal, so this works in `voting` too. It is a `Card | null`.
- `deck = DECK` (imported constant, passes as `readonly string[]`).

Props per component:

| Component | Props |
|---|---|
| Header | `connected`, `meName={me?.username}`, `controls` (QueueControls once a snapshot exists) |
| QueueControls | `settings={snapshot.queueSettings}`, `projects`, `boards`, `disabled`, `refreshing={snapshot.queue.loading}`, `onChangeSettings`, `onRefresh` |
| LeftPanel | `history={snapshot.history}`, plus the `QueuePanel` props below |
| QueuePanel | `queue={snapshot.queue}`, `searchResults` (from the hook), `currentKey={snapshot.ticket?.key ?? null}`, `disabled`, `onPick`, `onSearch={search}`, `boardUrl` |
| TicketView | `ticket={snapshot.ticket}` |
| Players | `players={snapshot.players}`, `phase={snapshot.phase}`, `meId={me?.userId ?? null}`, `stats={snapshot.stats}` |
| Layout | `left`, `main`, `bottom` as in the slot table above |
| Deck | `deck={DECK}`, `selected`, `disabled`, `onSelect`, `onClear` |
| ActionBar | `phase`, `round`, `stats`, `ticket` from snapshot, `deck={DECK}`, `disabled`, `jiraSave={snapshot.jiraSave}`, `onReveal`, `onReset`, `onSave` |

Deck should be disabled in `idle` (no round to vote in) in addition to `!connected`: pass `disabled={disabled || snapshot.phase !== "voting"}`. This is the one place App adds a phase rule; the server would reject the vote anyway, but the buttons should not invite it.

Command mapping, all through one helper `dispatch(cmd: ClientCommand)`:

| UI action | Command |
|---|---|
| Click an unselected card | `{ type: "vote", card: card as Card }` (Deck's `onSelect` gives `string`; cast to `Card`, which is imported as a type from shared/protocol.ts) |
| Click the selected card (clear) | `{ type: "vote", card: selected }` because the server toggles; `selected` is non-null whenever `onClear` can fire, but guard with `if (selected)` |
| Reveal | `{ type: "reveal" }` |
| Next ticket (phase `revealed`) | `{ type: "reset", clearTicket: true }`; returns to `idle` so the team picks the next ticket from the queue |
| Reset (phase `voting`) / Start round (phase `idle`) | `{ type: "reset" }` |
| Queue row or search result click | `{ type: "loadTicket", key }` (the key comes from a server-provided item, so no trimming or case change is needed) |
| Change a queue setting | `{ type: "setQueueSettings", settings }` (only the changed fields) |
| Refresh queue | `{ type: "refreshQueue" }`, then always `{ type: "refreshProjects" }` (the server retries projects and boards, which can fail independently) |
| Type in the search box | Not through `dispatch`: App passes the hook's `search` as `onSearch`, which sends `{ type: "searchTickets", query }` after a 400 ms debounce |
| Save to Jira | `{ type: "saveEstimate", points }` |

Notice handling. `dispatch` calls `send(cmd)`; if it returns false, App shows a local notice "Not connected. Your action was not sent." The snackbar takes one `{ id, message }`, so App keeps `const [notice, setNotice] = useState<{ id: number; message: string } | null>(null)`. Server errors come from the hook's `error`; an effect (`[error]` dependency, with a `biome-ignore lint/correctness/useExhaustiveDependencies` comment if Biome flags it) copies the hook's error into `notice` whenever it changes. Local notices use a counter in a `useRef` that starts at -1 and decrements, so local ids are negative and never collide with the server's positive ids. Pass `notice` to `ErrorSnackbar`. Because controls are disabled when not connected, this notice is a safety net for the short window between a socket dying and the `close` event arriving.

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
| Idle (no round) | Connected | Queue enabled, TicketView shows the "Pick a ticket to start" guide | Players, dashed empty cards | Disabled | Only "Start round" |
| Voting, empty | Connected | Queue, description and comments filled if a ticket is loaded | All dashed empty cards | Enabled, nothing pressed | Reveal and "Reset" |
| Voting, partial | Connected | same | Voted players hold a face-down card, others a dashed empty card; "X of Y voted"; no values shown | Own card pressed (contained, lifted) | Reveal and "Reset" (partial reveal is allowed) |
| Revealed | Connected | same | Each player's card is face-up with the vote ("–" for none), outliers in amber; stats beside the players: average, range, Consensus or No consensus | Disabled, own card still pressed | Story points select preset to suggestion, Save to Jira (enabled if ticket and points), "Next ticket"; no Reveal |
| Saving | Connected | same | same | same | Save disabled with spinner; select still shown |
| Saved | Connected | Current points will update once the server refreshes the ticket | same | same | Compact green alert "Saved N pts by name" at the far right |
| Error (server rejected a command) | Connected | same | same | same | Red snackbar for 6 seconds with "message (reason)"; a failed Jira save also shows the compact red alert with Jira's message at the far right of the ActionBar |
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
- Heading hierarchy: exactly one `h1` (in Header); the ticket summary is `h2`, and "Description" is `h3` under the summary. The Description, "Comments (n)" and "History" tab labels are tabs, not headings. Headings inside server HTML are styled at body size by `HtmlBody` (the sanitizer allowlist decides whether they appear at all).
- Each pane is a `section` with an `aria-label` ("Tickets", "Ticket"), and the players are a `ul` labeled "Participants", so screen reader users can jump between them.
- Comments, ticket history and session history are real lists (`List` renders `ul` with `li` items), so the count is announced. Each date is a `<time>` element with `dateTime`. History old and new values use `<del>` and `<ins>`, so the change is not conveyed by strike-through alone.
- Keyboard and the sticky bar: the bar is last in DOM order and every control in it is a native button or select, so Tab reaches it after the panes. Sticky positioning never covers a focused element in a pane, because the pane `maxHeight` stops above the bar, and the browser scrolls a focused element into view inside its pane. Do not add `tabIndex` to the panes. The player avatars are not interactive and are not tab stops; the resize handle between the panes is a tab stop.
- The page has exactly one `h1` (in Header). Ticket key links (in TicketView, the queue and the search results) are the only external links and use `rel="noopener noreferrer"`.
- The loading spinner has an accessible label. The snackbar's `Alert` has the implicit `role="alert"` so errors are announced.
- Text contrast comes from the stock MUI theme; do not lower opacity on text other than the offline player rows.

Responsive rules:

- Breakpoints: laptop widths are the target. At `lg` (1200px) and up: two columns (queue 4 and main 8 of 12) with independent scrolling and the single-row sticky bottom bar (section 2, Layout.tsx). Below `lg`: everything stacks full width in the order Queue, ticket view, then the bottom bar (players, Deck, ActionBar stacked), the bar is not sticky and the page scrolls. No phone-specific work beyond "nothing breaks": no horizontal page scroll, and the Deck still wraps.
- Layout width: `Container maxWidth={false}` uses the whole page, with `px: { xs: 2, lg: 3 }` side gutters and no `maxWidth` cap.
- ActionBar is one row that wraps (`flexWrap: "wrap"` with `useFlexGap`) so the controls and the save alert never overflow below `lg`.
- Deck wraps (`flexWrap`) when its section is narrower than ten cards. Cards stay at least 48px wide and 64px tall; that height sets the 88px minimum of the bottom bar.
- The header is a fixed 48px single row. The title is hidden below `md`, and the queue selects shrink to `minWidth` 110 at `xs` so the header does not overflow on phones.
- No horizontal page scroll at 1000px or at 1440px. Verify by resizing the browser.
- Do not use fixed pixel widths on containers. `minWidth: 140` (110 at `xs`) on the header selects and `minWidth: 48` on cards are the only fixed widths. The fixed heights in `Layout.tsx` (header 48; bottom bar minimum 88, maximum 140) apply at lg and up only.

## 9. Acceptance checklist for the implementer

Run `npm run lint`, `npm run tsc:check` and `npm run build`; all must pass with no Biome warnings (the three `biome-ignore` comments, two in ActionBar and ErrorSnackbar plus the `noDangerouslySetInnerHtml` one in HtmlBody, are expected and must include their explanation text). Do not write tests. Then verify in a browser with `npm run dev` and `ALLOW_DEV_USER=1` set in the environment (or `.env`; never read or print `.env`):

1. Open `http://localhost:3838/?devUser=alice` in one browser profile and `http://localhost:3838/?devUser=bob` in another (separate profiles or one normal and one private window, so the identity does not collide). Each shows "You are alice" / "You are bob" and both appear in each other's list.
2. Queue: with the dev server pointed at Jira, the queue shows tickets for the selected project. Change the project and confirm the board select reloads its options and the list changes on both pages. Pick a board and confirm Bob's page shows the same board and sections, and that every listed ticket is not Done and has no Story Points. Alice clicks a row (not its key link); both pages show the same ticket card and that row reads "Current".
3. Search: type "dashboard" in the search box and confirm matching tickets appear after a short pause with a progress bar while waiting, and only on the page that searched. Type a full key such as `PP-123` and confirm it is found directly. With a project selected, type just the number (`123`) and confirm the same ticket is found (the server expands it to `PP-123`); with no project, a bare number runs a text search instead. A single character does nothing and clears the results. A query with no hits shows "No matches". Clicking a result row loads it for everyone.
4. Start a round if the phase is idle. Alice picks 5: her card shows pressed, Bob's list shows a face-down card for Alice but no value. Alice clicks 5 again: the card turns dashed again (vote cleared).
5. Both vote; Bob picks 8 and Alice 5, then Reveal (also try revealing with one vote). Values appear on the players' cards on both pages. The Save select presets to 8 (tie goes higher). Make both vote the same card in another round and confirm that card is preset. Vote `?` only and confirm Save stays disabled until a number is picked.
6. Save to Jira on a throwaway ticket: Save shows a spinner, then a green "Saved N pts by name" on both pages, and Story Points change in Jira. The ticket also disappears from the queue on both pages once the queue refreshes. Trigger an error (for example save with an invalid or unreachable Jira) and confirm both the snackbar and the red inline alert appear; trigger the same error twice and confirm the snackbar reopens.
7. Stop the dev server. Within a few seconds both pages show "Reconnecting…" and all controls become disabled while the last state stays visible. Restart the server; both pages reconnect on their own (backoff never exceeds about 10 seconds), the status dot returns to green, and controls re-enable.
8. Open the app with `ALLOW_DEV_USER` unset and no identity headers: the page shows "Open this app inside the hosting platform" and the browser network panel shows no reconnect attempts after the 4401 close.
9. Resize to 1000px wide (below the `lg` breakpoint): no horizontal scroll, sections stack, controls are usable. Tab through the page with the keyboard and confirm every control is reachable and the pressed card state is announced.
10. React StrictMode is on in dev: confirm in the server log that each page opens one lasting connection, not a growing number of them, and that edits to a component hot-update without a full reload.
11. Layout at 1440px wide: two columns visible side by side (queue left, ticket view right) and the one-row bottom bar always visible at the bottom edge: players left, Deck centered, actions right. Load a ticket with a long description and many comments: the ticket pane scrolls independently, and the tickets pane and bottom bar do not move. The page itself has no vertical scrollbar.
12. Bottom bar by phase: in `voting` the right section shows Reveal and Reset only; in `revealed` it shows the Story points select, Save to Jira and Next ticket, and the left section shows each player's card face-up plus "Avg", range and "Consensus" or "No consensus"; unselected cards are dimmed and the selected card stays filled. Shrink the window so the bar is crowded: the players wrap inside the left cell and the Deck stays centered. Saved and error alerts appear compactly at the far right.
13. Below 1200px wide (for example 1000px): everything stacks full width in the order Queue, ticket view, bottom bar; the bar is not sticky; nothing is clipped and there is no horizontal scroll, including with a wide code block or table in the description.
14. Ticket rendering: a description with a bulleted list, a link, a code block and a table renders with bullets, a clickable link (opens in a new tab), monospace code and a horizontally scrollable `pre`. An image in a description or comment appears as a link, not an `img`. Comments appear oldest first with author and a local date. A ticket with no description shows "No description"; one with no comments shows "Comments (0)" and "No comments". With no ticket loaded the main area shows the "Pick a ticket to start" guide. Tab reaches every control in the bottom bar. Click the Jira icon link in the ticket header: the ticket opens in a new tab and the app page keeps its state.
