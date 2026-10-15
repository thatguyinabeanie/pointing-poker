# Pointing Poker: client (frontend) specification

This document is self-contained. A coding session implementing the `client/` folder of the `pointing-poker` repo should need nothing else. Where it says "reference implementation", it means files that were already written and reviewed and are copied into the repo at `docs/spec/reference/client/src/components/*.tsx` and `docs/spec/reference/client/src/lib/estimate.ts`. Copy them into `client/src/` unchanged unless this document says otherwise. The shared contract lives in `shared/protocol.ts` and `shared/deck.ts` (already written; do not edit them). `Ticket` in `protocol.ts` carries `descriptionHtml`, `comments` (`TicketComment[]`, oldest first), `assignee`, `priority` and `labels` in addition to the summary fields. `shared/constants.ts` also exists and exports `NEEDS_POINTING_LABEL = "needs-pointing"`.

## 1. Scope

The client is one page with no router. It uses the stock MUI 9 theme with only the font family changed to Lato (Roboto fallback). It uses the whole page width: three panes in one row (queue, ticket description, comments) above a single-row sticky bottom bar that holds the participants, the deck and the actions. The target is laptop widths (internal tool, MacBook Pro screens, inside the hosting platform's service report iframe), so the full layout applies from the `lg` breakpoint (1200px) up. There is no phone layout work. Below `lg` the panes and the bar simply stack at full width and nothing should break; that is the whole requirement there. Everything is one shared room: there is no room picker or login screen. The only settings are the shared ticket queue settings (section 2, QueuePanel), which are room state, not per-user preferences. Identity comes from the server (auth proxy headers), so the client never asks who the user is. There are no client tests in v1 (decision, see `08-decision-log.md`). Do not add any dependency beyond what `package.json` already lists: react, react-dom, @mui/material, @mui/icons-material, @emotion/react, @emotion/styled. Do not add a router, state library, or form library.

Lint is Biome (`npm run lint` is `biome ci .`): double quotes, 2-space indent, line width 100, React lint domain on. Type check is `tsc --noEmit -p tsconfig.json` (strict, `verbatimModuleSyntax`, `allowImportingTsExtensions`). That means: always `import type` for type-only imports, and always write the `.ts`/`.tsx` extension on relative imports, as the reference files do.

## 2. File map

```
client/index.html                 HTML shell, Lato font link, #root, module script
client/src/main.tsx               createRoot, StrictMode, ThemeProvider, CssBaseline, renders <App />
client/src/theme.ts               createTheme with Lato typography (already exists in the scaffold; keep)
client/src/App.tsx                owns useGameSocket, fills the Layout slots, maps UI actions to commands
client/src/useGameSocket.ts       WebSocket client hook (section 3)
client/src/lib/estimate.ts        suggestPoints (reference, copy as is)
client/src/components/TopBar.tsx
client/src/components/QueuePanel.tsx
client/src/components/Layout.tsx             pure layout, four slots (new)
client/src/components/TicketDescription.tsx  key, summary, meta chips, description (replaces TicketPanel.tsx)
client/src/components/TicketComments.tsx     comments pane (new)
client/src/components/HtmlBody.tsx           the only dangerouslySetInnerHTML in the client (new)
client/src/components/ParticipantChips.tsx   compact participant row plus stats (replaces ParticipantList.tsx)
client/src/components/Deck.tsx
client/src/components/ActionBar.tsx
client/src/components/ErrorSnackbar.tsx
```

Files to author from scratch: `App.tsx` and `useGameSocket.ts`. `index.html`, `main.tsx` and `theme.ts` already exist in the scaffold; `main.tsx` needs only the `<App />` swap. The nine components, `HtmlBody.tsx` and `estimate.ts` come from the reference folder. `TicketPanel.tsx` and `ParticipantList.tsx` no longer exist; do not create them. Reading the reference files is the fastest route; the summaries below are the contract each one must keep. Do not rename props.

### lib/estimate.ts

`suggestPoints(stats: Snapshot["stats"], deck: readonly string[]): string | null`. Returns null when `stats` is null. Otherwise it scans `stats.counts` and picks the numeric card with the highest count. A card is eligible only if `isNumericCard(card)`, `deck.includes(card)` and `count > 0`. So `?` and the coffee card are never suggested, and counts for cards that are not in the deck passed in are ignored. On a tie the numerically higher card wins ("when the room is split, the cautious estimate is the bigger one"). Returns null when no eligible card exists. Returns a string (a card), not a number.

### components/TopBar.tsx

Props: `{ connected: boolean; meName?: string }`. MUI: `AppBar position="static"` > `Toolbar sx={{ gap: 2 }}` > `Typography variant="h6" component="h1"` (text "Pointing Poker", flexGrow 1), a `Chip size="small"` with label "Connected" (color success) or "Reconnecting…" (color warning), and, if `meName` is set, `Typography` "You are {meName}" hidden below the `sm` breakpoint via `sx={{ display: { xs: "none", sm: "block" } }}`. The `h1` lives here; no other component renders an h1.

### components/QueuePanel.tsx

Props: `{ settings: QueueSettings; projects: JiraProject[]; boards: JiraBoard[]; queue: QueueState; searchResults: SearchResults | null; currentKey: string | null; disabled: boolean; onChangeSettings: (partial: Partial<QueueSettings>) => void; onRefresh: () => void; onPick: (key: string) => void; onSearch: (query: string) => void }`. `SearchResults` is `{ query: string; items: QueueItem[]; error: string | null; pending: boolean }`, exported from `QueuePanel.tsx` and structurally identical to the hook's `searchResults` value. Types come from `shared/protocol.ts`. The team picks the next ticket from a shared queue of unpointed Jira tickets instead of typing a key. Settings are shared room state: changing one changes the queue for everyone.

MUI: `Paper sx={{ p: 2 }}` > `Stack spacing={2}` with these rows, top to bottom:

1. Settings row: `Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap sx={{ alignItems: { xs: "stretch", sm: "center" }, flexWrap: "wrap" }}` holding a `FormControl size="small"` + `Select` labeled "Project" (options from `projects`, each shown as `{key} ({name})`, value `settings.projectKey ?? ""`, change calls `onChangeSettings({ projectKey })` with null for empty); a `Select` labeled "Board" (options from `boards` plus "All (no board)" with value `""` mapping to `boardId: null`; disabled when `boards` is empty); `FormControlLabel` + `Switch` "Labeled only" with the caption "Off: labeled or unpointed tickets" (`settings.needsPointingOnly`); `FormControlLabel` + `Switch` "Clear label on save" (`settings.clearLabelOnSave`); and an `IconButton` with `aria-label="Refresh queue"` and a Refresh icon, disabled while `queue.loading`. Select values that are not in the options list render as empty, so a stale stored project or board never triggers an MUI warning. Each Select uses `InputLabel` with an id from `useId` and `labelId`. Everything is disabled when `disabled`.
2. Search: a `TextField size="small"` labeled "Search tickets (key or text)" with a `SearchIcon` start adornment. Local state holds the text; every change calls `onSearch(text)` (the hook debounces and ignores short queries). Below it, driven by `searchResults`: a `LinearProgress aria-label="Searching"` while `pending`; an inline `Alert severity="warning"` with `error` when not pending and `error` is set; "No matches" when not pending and `items` is empty; otherwise the result rows. When `searchResults` is null nothing renders.
3. Queue status: a `LinearProgress aria-label="Loading queue"` while `queue.loading`; else an inline `Alert severity="warning"` with `queue.error`; else a `Typography variant="caption"` "{n} tickets · updated {time}" (time from `fetchedAt` via `toLocaleTimeString`, omitted when null).
4. Queue list: unless loading or error, and when `items` is empty, the text "No tickets need pointing. Add the needs-pointing label in Jira or change the filters." Otherwise the rows below. The queue list stays separate from, and below, the search results.

Rows (queue and search results share one internal `TicketRows` component): `List dense` > one `ListItem` per item with `ListItemText` (primary is a `Link` to `item.url` with `rel="noopener noreferrer"` showing the key, then the summary; secondary is a row of small Chips for `issueType` and `status`) and a `secondaryAction` `Button size="small" variant="outlined"` "Point this" calling `onPick(item.key)`. The row whose key equals `currentKey` has a selected background and its button reads "Current" and is disabled. The secondary text is rendered as spans so the markup stays valid inside `ListItemText`.

### components/Layout.tsx

Props: `{ left: ReactNode; center: ReactNode; right: ReactNode; bottom: ReactNode }`. Pure layout: no state, no data, no knowledge of the other components. It renders a `Container maxWidth={false}` with `sx={{ px: { xs: 2, lg: 3 } }}` (full width), then a MUI 9 `Grid container spacing={2}` (the Grid2 API: `size` prop, no `item`, imported from `@mui/material/Grid`) with three items, then the bottom bar.

| Slot | Grid item | Content from App |
|---|---|---|
| `left` | `size={{ xs: 12, lg: 3 }}` | `QueuePanel` (queue and search) |
| `center` | `size={{ xs: 12, lg: 5 }}` | `TicketDescription` |
| `right` | `size={{ xs: 12, lg: 4 }}` | `TicketComments` |
| `bottom` | outside the Grid, full width | participants, `Deck`, `ActionBar` in one row |

Below `lg` the items are 12 wide in the order Queue, Description, Comments, bottom bar. The bottom bar is a sibling of the Grid inside the Container (visually the full width). It must not be a Grid item: `position: sticky` only works inside a parent taller than the sticky element, and a Grid item holding only the bar is exactly as tall as the bar.

Bottom bar (rendered by Layout around the `bottom` slot): a `Paper elevation={4} square` with `p: 1.5`, `mt: "16px"`, `boxSizing: "border-box"`, `position: { xs: "static", lg: "sticky" }`, `bottom: 0`, `zIndex: (theme) => theme.zIndex.appBar` (above pane content, below menus, dialogs and the snackbar), `height: { lg: 88 }` and `overflowY: { lg: "auto" }`. Not sticky and no fixed height below `lg`.

Pane scrolling (lg and up). Each pane's content sits in a `Box component="section"` with an `aria-label` ("Ticket queue", "Ticket description", "Comments") and `sx={{ maxHeight: { lg: PANE_MAX_HEIGHT }, overflowY: { lg: "auto" } }}`. No refs and no measuring: the heights are fixed constants at the top of `Layout.tsx`, in px:

- `APPBAR_HEIGHT = 64`: the MUI `Toolbar` height at md and up. `TopBar` is `position="static"` and keeps the default Toolbar height.
- `BOTTOM_BAR_HEIGHT = 88`: fixed. The Deck cards are 64px tall (section 2, Deck; the mock uses 48x64) and the bar has 12px padding top and bottom, so one row needs 88px. A shorter bar would clip the cards. If the people section wraps onto a second line the bar scrolls inside itself instead of growing, so the pane math stays correct.
- `PAGE_TOP_PADDING = 16` (Container `pt`; no bottom padding at lg and up) and `BAR_GAP = 16` (gap between panes and bar).
- `PANE_MAX_HEIGHT = calc(100vh - 64px - 88px - 32px)`, where the 32px is the two 16px constants. This is the requested `calc(100vh - AppBar - bottom bar)` with the paddings included so the page itself never scrolls.

To keep the sticky bar on the bottom edge when the panes are short, the Container is a flex column with `minHeight: { lg: "calc(100vh - 64px)" }` and the Grid has `flexGrow: 1`. With the AppBar above it the page is exactly one viewport tall at lg and up; only the three panes scroll. Below `lg` panes grow naturally and the page scrolls.

### components/TicketDescription.tsx

Replaces `TicketPanel.tsx`. Props: `{ ticket: Ticket | null }`. Display only; QueuePanel owns picking and loading. Always renders a `Paper sx={{ p: 2 }}`.

- `ticket` is null: a muted `Typography` (`color="text.secondary"`) "Pick a ticket from the queue or search to start pointing."
- Otherwise a `Stack spacing={2}` with: (1) a header row, a wrapped baseline-aligned `Stack direction="row"`, holding a `Link` (href `ticket.url`, `target="_blank"`, `rel="noopener noreferrer"`, `variant="h6"`) with `ticket.key`, the summary as `Typography variant="h6" component="h2"` (`overflowWrap: "anywhere"`), and an "Open in Jira" `Button variant="outlined" size="small" startIcon={<OpenInNewIcon />} component="a" href={ticket.url} target="_blank" rel="noopener noreferrer"` (import `OpenInNewIcon` from `@mui/icons-material/OpenInNew`). The app never edits ticket text; this button is the way to edit the description or comments in Jira; (2) a wrapped row of small Chips: `issueType`, `status`, `priority` (omitted when null), `assignee ?? "Unassigned"`, `Current: {currentPoints ?? "unset"} pts`, then one `variant="outlined"` Chip per entry of `labels`; (3) a `Divider`; (4) "Description" as `Typography variant="subtitle1" component="h3"` (bold) followed by `<HtmlBody html={descriptionHtml} />`, or a muted "No description" when `descriptionHtml` is null.

### components/TicketComments.tsx

Props: `{ ticket: Ticket | null }`. Always renders a `Paper sx={{ p: 2 }}`.

- `ticket` is null: a muted `Typography` "Comments appear here once a ticket is loaded."
- Otherwise `Typography variant="h6" component="h2"` "Comments ({n})", then either a muted "No comments" or a `List disablePadding` with one `ListItem` (`disableGutters`, top border) per comment in array order. The server sends oldest first and the client never sorts. Each item shows the author (`subtitle2`), the date as `<time dateTime={createdAt}>` showing `new Date(createdAt).toLocaleString()` (caption, muted), and `<HtmlBody html={bodyHtml} />`.

### components/HtmlBody.tsx and the safety rule

Props: `{ html: string }`. A `Box` with `dangerouslySetInnerHTML={{ __html: html }}` and an `sx` that styles `& p, & ul, & ol, & pre, & table, & blockquote` (bottom margin), `& ul, & ol` (left padding), headings (body-sized, bold), `& a`, `& code` (monospace, subtle background), `& pre` (`overflowX: "auto"` so wide code scrolls sideways), `& table` (`display: "block"`, `overflowX: "auto"`, `maxWidth: "100%"`, collapsed borders) and `& blockquote` (left border, muted). The root has `overflowWrap: "anywhere"` so long words and URLs wrap. Description and comments share it, so the rule lives in one file.

`descriptionHtml` and each comment's `bodyHtml` are sanitized on the server before they are sent: allowlisted tags only, no scripts or styles, images replaced by links, links already carrying `target` and `rel`. The client renders them with `dangerouslySetInnerHTML`, and that is safe only because of the server sanitizer. Two rules follow. First, `HtmlBody` is the only place in the client allowed to use `dangerouslySetInnerHTML`, and it carries `// biome-ignore lint/security/noDangerouslySetInnerHtml: server-sanitized HTML only; see spec 03 section 2`. Second, no other HTML source may be rendered this way: not Jira summaries, labels, usernames, queue items, search results or error messages. Those stay plain React text, which React escapes. The client does no sanitizing of its own, so a bug in the server sanitizer is a client XSS bug; do not add a client-side sanitizer dependency to paper over it.

### components/ParticipantChips.tsx

Replaces `ParticipantList.tsx`. Props: `{ players: PlayerView[]; phase: Phase; meId: number | null; stats: Snapshot["stats"] }`. It is the left section of the bottom bar. MUI: an outer `Stack direction="row" useFlexGap spacing={2}` (items centered) holding (1) the people and (2) the stats.

People: a `Stack component="ul" direction="row" useFlexGap spacing={0.5}` with `aria-label="Participants"`, `flexWrap: "wrap"`, `flex: "1 1 auto"`, `minWidth: 0` and list styling reset. This section shrinks and wraps first when the bar is crowded. One `Box component="li"` per player (key `userId`, `opacity: p.connected ? 1 : 0.5`) holding a `Chip size="small" variant="outlined"` with an `Avatar` (first letter of username, uppercased) and a label: `{username} (you)` when `userId === meId`, else the username. Phase rules, chosen by `phase` and never by `p.vote` (the UI must never show a vote before reveal even if a stale snapshot carries one): when `phase === "revealed"` the label is `{name}: {vote ?? "–"}` (en dash for no vote) and there is no icon; otherwise the chip icon is a green `CheckCircle` with `aria-label="voted"` if `p.hasVoted`, else a gray `HourglassEmpty` with `aria-label="not voted"`. Not connected: label gets " (offline)" appended in addition to the dimming.

Stats: rendered inline after the people only when `phase === "revealed" && stats`, as a `Stack direction="row" useFlexGap spacing={0.5}` with `flexShrink: 0`: a `Typography variant="body2"` "Avg {stats.average ?? "–"}", one small Chip `{card} ×{n}` per entry of `stats.counts`, and an outlined small Chip "Consensus" (`color="success"`) or "No consensus" (default color) from `stats.consensus`. The text says it, so consensus is not conveyed by color alone.

### components/Deck.tsx

Props: `{ deck: readonly string[]; selected: string | null; disabled: boolean; onSelect: (card: string) => void; onClear: () => void }`. MUI: `Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }} role="group" aria-label="Voting cards"` containing one `Button` per card. Selected card is `variant="contained"`, others `outlined`; every button has `aria-pressed={isSelected}`, `disabled={disabled}`, and `sx={{ minWidth: 48, height: 64, fontSize: 20 }}`. Clicking the selected card calls `onClear`; clicking any other calls `onSelect(card)`. This mirrors the server, where voting the same card twice clears the vote. In the bottom bar this is the middle section, `flexShrink: 0`. After reveal the Deck is disabled, so the unselected cards are dimmed by MUI's disabled style and the selected card keeps its contained (filled) look, also dimmed by that style; do not add custom styling for this.

### components/ActionBar.tsx

Props (unchanged): `{ phase: Phase; stats: Snapshot["stats"]; ticket: Ticket | null; deck: readonly string[]; disabled: boolean; jiraSave: JiraSave; onReveal: () => void; onReset: (opts: { clearTicket: boolean }) => void; onSave: (points: number) => void }`. It is the right section of the bottom bar. It shows no stats (those are in `ParticipantChips`); `stats` is kept only to preset the select.

MUI composition: one `Stack direction="row" useFlexGap spacing={1} sx={{ alignItems: "center" }}`, a single row at every width, holding the controls for the current phase in this order:

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
- A manual pick sticks. `stats` is a new object on every snapshot, so it is not a dependency of the effect; the select re-suggests only when `phase` or `ticket?.key` changes.

### components/ErrorSnackbar.tsx

Props: `{ error: { id: number; message: string } | null }`. Holds its own `open` state. An effect keyed on `error?.id` sets `open` to `error !== null`; it carries `// biome-ignore lint/correctness/useExhaustiveDependencies: error.id is the intended trigger`. Keying on id (not message) means the same text arriving twice reopens the snackbar. MUI: `Snackbar open autoHideDuration={6000}` whose `onClose(_, reason)` ignores `"clickaway"` and otherwise closes, containing `Alert severity="error" variant="filled" onClose={close}` that shows `error?.message`.

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
   - `error`: `setError({ id: msg.id, message: `${msg.message} (${msg.reason})` })`. The reason is in the text so users can report it. The id is the server's counter, so a repeated error with a new id reopens the snackbar.
   - `searchResults`: keep it only if `msg.query` equals the latest query sent (a ref); otherwise drop it as stale. If kept, `setSearchResults({ query: msg.query, items: msg.items, error: msg.error, pending: false })`.
   - Unknown types are ignored.
3. `onclose(event)`: `socketRef.current = null`; `setConnected(false)`; if `cancelled` return. If `event.code === 4401` set `disconnectedReason` to `"unauthenticated"` and return; if `event.code === 1008` set `"bad_origin"` and return (both terminal: no retry, no timer). Otherwise schedule a retry: `const delay = Math.min(10_000, 500 * 2 ** attempt) * (0.5 + Math.random() / 2); attempt += 1; timer = window.setTimeout(connect, delay)`.
4. `onerror`: do nothing; browsers always follow it with `close`.
5. The last `snapshot` and `me` are never cleared on close, so the page keeps showing the last known state (disabled, with the "Reconnecting…" chip) while the socket retries. A fresh `state` arrives right after the next `hello`.
6. Cleanup: set `cancelled = true`, `window.clearTimeout(timer)`, then take the current socket, null out its `onopen/onmessage/onclose/onerror` handlers, and `close()` it. Nulling handlers first prevents a stale socket from calling setState or scheduling a retry after unmount.

StrictMode safety: in development React mounts, unmounts and re-mounts the effect. The cleanup above fully disposes the first socket (browsers may log "closed before the connection is established"; that is acceptable). Because each mount has its own closure-scoped `cancelled`, `attempt` and `timer`, the two mounts cannot interfere. Do not keep these in module scope.

Optional but recommended: inside the same effect add listeners for `window` `online` and `document` `visibilitychange` (when `document.visibilityState === "visible"`). If not cancelled, no terminal reason set, and there is no socket currently OPEN or CONNECTING, clear any pending timer, set `attempt = 0` and call `connect()` immediately. Remove both listeners in cleanup. This helps laptops that sleep and iframes in background tabs.

Search (`search(query)`): `useCallback` with an empty dependency list. It trims the query. Under 2 characters it cancels any pending debounce timer, clears `latestQuery` and sets `searchResults` to null, and sends nothing. Otherwise it records the trimmed query in `latestQueryRef`, restarts a 400 ms debounce timer, and when the timer fires it calls `send({ type: "searchTickets", query })` and, if that returned true, sets `searchResults` to `{ query, items: [], error: null, pending: true }`. Server `searchResults` messages are delivered only to the requester. The debounce timer is cleared on unmount, and `searchResults` is left as is on socket close (it is cleared the next time the user types).

`send(cmd)`: wrapped in `useCallback` with an empty dependency list so its identity is stable. It reads `socketRef.current`; if that is null or `readyState !== WebSocket.OPEN`, return `false` (drop the command; never queue). Otherwise `socket.send(JSON.stringify(cmd))` and return `true`.

## 4. App.tsx wiring

`App` calls `useGameSocket()` once and renders:

```
<>
  <TopBar connected={connected} meName={me?.username} />
  ...content...
  <ErrorSnackbar error={notice} />
</>
```

Content states, in priority order:

1. If `disconnectedReason` is non-null: render only an `Alert severity="warning"` inside `<Container maxWidth="md" sx={{ py: 2 }}>`. For `"unauthenticated"` the text is "Open this app inside the hosting platform" followed by a sentence that sign-in is handled by the platform and this page cannot identify you on its own. For `"bad_origin"` the text is "This page was opened from an address the server does not accept" with a hint to contact the service owner. Do not render the board.
2. Else if `snapshot === null`: centered `CircularProgress` (inside a `Box` with `display: "flex"`, `justifyContent: "center"`, `py: 6`). Give it `aria-label="Loading"`.
3. Else the board: `<Layout left={...} center={...} right={...} bottom={...} />`. Layout renders its own full-width Container, so App adds none around it. The full page order is TopBar, then Layout (three panes, then the bottom bar). Slots:

| Slot | Content |
|---|---|
| `left` | `<QueuePanel ... />` |
| `center` | `<TicketDescription ticket={snapshot.ticket} />` |
| `right` | `<TicketComments ticket={snapshot.ticket} />` |
| `bottom` | `<Stack direction={{ xs: "column", lg: "row" }} spacing={2} sx={{ alignItems: { lg: "center" } }}>` holding `<Box sx={{ flex: { lg: "1 1 0" }, minWidth: 0 }}><ParticipantChips ... /></Box>`, `<Box sx={{ flexShrink: { lg: 0 } }}><Deck ... /></Box>` and `<Box sx={{ flexShrink: { lg: 0 } }}><ActionBar ... /></Box>` |

The bottom bar is one row at `lg` and up: people left (it wraps first), Deck in the middle, actions right. Below `lg` the three stack in that order.

Derived values:

- `const disabled = !connected;`
- `const selected = snapshot.players.find((p) => p.userId === me?.userId)?.vote ?? null;` The server shows a player their own vote before reveal, so this works in `voting` too. It is a `Card | null`.
- `deck = DECK` (imported constant, passes as `readonly string[]`).

Props per component:

| Component | Props |
|---|---|
| TopBar | `connected`, `meName={me?.username}` |
| QueuePanel | `settings={snapshot.queueSettings}`, `projects={snapshot.projects}`, `boards={snapshot.boards}`, `queue={snapshot.queue}`, `searchResults` (from the hook), `currentKey={snapshot.ticket?.key ?? null}`, `disabled`, `onChangeSettings={(settings) => dispatch({ type: "setQueueSettings", settings })}`, `onRefresh={() => dispatch({ type: "refreshQueue" })}`, `onPick={(key) => dispatch({ type: "loadTicket", key })}`, `onSearch={search}` |
| TicketDescription | `ticket={snapshot.ticket}` |
| TicketComments | `ticket={snapshot.ticket}` |
| ParticipantChips | `players={snapshot.players}`, `phase={snapshot.phase}`, `meId={me?.userId ?? null}`, `stats={snapshot.stats}` |
| Layout | `left`, `center`, `right`, `bottom` as in the slot table above |
| Deck | `deck={DECK}`, `selected`, `disabled`, `onSelect`, `onClear` |
| ActionBar | `phase`, `stats`, `ticket` from snapshot, `deck={DECK}`, `disabled`, `jiraSave={snapshot.jiraSave}`, `onReveal`, `onReset`, `onSave` |

Deck should be disabled in `idle` (no round to vote in) in addition to `!connected`: pass `disabled={disabled || snapshot.phase !== "voting"}`. This is the one place App adds a phase rule; the server would reject the vote anyway, but the buttons should not invite it.

Command mapping, all through one helper `dispatch(cmd: ClientCommand)`:

| UI action | Command |
|---|---|
| Click an unselected card | `{ type: "vote", card: card as Card }` (Deck's `onSelect` gives `string`; cast to `Card`, which is imported as a type from shared/protocol.ts) |
| Click the selected card (clear) | `{ type: "vote", card: selected }` because the server toggles; `selected` is non-null whenever `onClear` can fire, but guard with `if (selected)` |
| Reveal | `{ type: "reveal" }` |
| Next ticket (phase `revealed`) | `{ type: "reset", clearTicket: true }`; returns to `idle` so the team picks the next ticket from the queue |
| Reset (phase `voting`) / Start round (phase `idle`) | `{ type: "reset" }` |
| Point this (queue row or search result) | `{ type: "loadTicket", key }` (the key comes from a server-provided item, so no trimming or case change is needed) |
| Change a queue setting | `{ type: "setQueueSettings", settings }` (only the changed fields) |
| Refresh queue | `{ type: "refreshQueue" }` |
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

The visual reference is the mock at `docs/spec/mocks/pointing-poker.html`. The mock reflects the three-pane layout (LAYOUT C) and the bottom bar; section 2 (Layout.tsx) and section 4 are the source of truth for page structure. Open it in a browser to compare layout and spacing; the components above are the source of truth for behavior where the mock differs.

In every state where a ticket is loaded, TicketDescription shows an "Open in Jira" button beside the key and summary. Clicking it opens `ticket.url` in a new tab; it never changes room state and is not disabled while offline.

| State | TopBar chip | QueuePanel (left), TicketDescription (center), TicketComments (right) | ParticipantChips (bottom bar, left) | Deck (bottom bar, middle) | ActionBar (bottom bar, right) |
|---|---|---|---|---|---|
| Loading (no snapshot yet) | Reconnecting… | not shown, spinner instead | not shown | not shown | not shown |
| Idle (no round) | Connected | Queue enabled, TicketDescription shows "Pick a ticket from the queue or search to start pointing.", TicketComments shows its placeholder | Players, hourglass icons | Disabled | Only "Start round" |
| Voting, empty | Connected | Queue, description and comments filled if a ticket is loaded | All hourglass | Enabled, nothing pressed | Reveal and "Reset" |
| Voting, partial | Connected | same | Voted players green check, others hourglass; no values shown | Own card pressed (contained) | Reveal and "Reset" (partial reveal is allowed) |
| Revealed | Connected | same | Each chip shows the vote ("–" for none); inline stats: Avg, count chips, Consensus or No consensus | Disabled, own card still pressed | Story points select preset to suggestion, Save to Jira (enabled if ticket and points), "Next ticket"; no Reveal |
| Saving | Connected | same | same | same | Save disabled with spinner; select still shown |
| Saved | Connected | Current points will update once the server refreshes the ticket | same | same | Compact green alert "Saved N pts by name" at the far right |
| Error (server rejected a command) | Connected | same | same | same | Red snackbar for 6 seconds with "message (reason)"; a failed Jira save also shows the compact red alert with Jira's message at the far right of the ActionBar |
| Disconnected (retrying) | Reconnecting… (warning) | Last snapshot, all controls disabled | Last snapshot, offline dimming comes from the server's next state | Disabled | All buttons and the select disabled |
| Unauthenticated (close 4401) | n/a, bar shows only the title and "Reconnecting…" is acceptable | not shown | not shown | not shown | Warning alert "Open this app inside the hosting platform" only |
| Ticket with a long description | Connected | Description pane scrolls on its own at lg and up; code blocks and tables scroll sideways, long words wrap; the other panes and the bottom bar stay put | unchanged | unchanged | unchanged |
| Ticket with many comments | Connected | Comments pane lists every comment oldest first and scrolls on its own; the bottom bar stays visible | unchanged | unchanged | unchanged |
| Ticket with no description or comments | Connected | "No description" and "No comments" in muted text | unchanged | unchanged | unchanged |
| Queue loading | Connected | Progress bar replaces the ticket count; settings and list stay visible | unchanged | unchanged | unchanged |
| Queue empty | Connected | "No tickets need pointing. Add the needs-pointing label in Jira or change the filters." | unchanged | unchanged | unchanged |
| Queue error | Connected | Inline warning alert with the error text; settings and Refresh stay usable | unchanged | unchanged | unchanged |
| Search pending, empty, or error | Connected | Progress bar, "No matches", or inline warning under the search box; the queue below is unaffected | unchanged | unchanged | unchanged |

In the Disconnected state the TopBar chip shows "Reconnecting…" even for terminal failures; this is accepted and the alert beneath it explains the cause.

## 8. Accessibility and responsive rules

Accessibility checklist (all already satisfied by the reference components; do not regress them):

- The deck is `role="group"` with `aria-label="Voting cards"`, each card is a native `Button` with `aria-pressed`.
- Icon-only status indicators have `aria-label` ("voted", "not voted"); the vote state is never conveyed by color alone (check versus hourglass icons).
- The queue Selects have visible labels linked with `InputLabel` and `labelId`; the Refresh icon button has `aria-label="Refresh queue"`; the search `TextField` has a visible label ("Search tickets (key or text)"); the progress bars have accessible labels.
- Every interactive element is a native `button`, `input` or `a`, so Tab and Enter and Space work with no extra code. Do not add click handlers to non-interactive elements.
- Heading hierarchy: exactly one `h1` (in TopBar); the ticket summary and "Comments (n)" are `h2`; "Description" is `h3` under the summary. Headings inside server HTML are styled at body size by `HtmlBody` (the sanitizer allowlist decides whether they appear at all).
- Each pane is a `section` with an `aria-label` ("Ticket queue", "Ticket description", "Comments"), and the participant chips are a `ul` labeled "Participants", so screen reader users can jump between them.
- Comments are a real list (`List` renders `ul` with `li` items), so the count is announced. Each date is a `<time>` element with `dateTime`.
- Keyboard and the sticky bar: the bar is last in DOM order and every control in it is a native button or select, so Tab reaches it after the panes. Sticky positioning never covers a focused element in a pane, because the pane `maxHeight` stops above the bar, and the browser scrolls a focused element into view inside its pane. Do not add `tabIndex` to the panes. The participant chips are not interactive and are not tab stops.
- The page has exactly one `h1` (in TopBar). Ticket key links (in TicketDescription, the queue and the search results) are the only external links and use `rel="noopener noreferrer"`.
- The loading spinner has an accessible label. The snackbar's `Alert` has the implicit `role="alert"` so errors are announced.
- Text contrast comes from the stock MUI theme; do not lower opacity on text other than the offline player rows.

Responsive rules:

- Breakpoints: laptop widths are the target. At `lg` (1200px) and up: three panes (3, 5 and 4 of 12) with independent scrolling and the single-row sticky bottom bar (section 2, Layout.tsx). Below `lg`: everything stacks full width in the order Queue, Description, Comments, then the bottom bar (people, Deck, ActionBar stacked), the bar is not sticky and the page scrolls. No phone-specific work beyond "nothing breaks": no horizontal page scroll, and the Deck still wraps.
- Layout width: `Container maxWidth={false}` uses the whole page, with `px: { xs: 2, lg: 3 }` side gutters and no `maxWidth` cap.
- ActionBar is always a single row. Below `lg` the bottom bar stacks its three sections, and the ActionBar row may wrap through `useFlexGap`; if buttons crowd, let the row `flexWrap: "wrap"`.
- Deck wraps (`flexWrap`) when its section is narrower than ten cards. Cards stay at least 48px wide and 64px tall; that height is what sets the 88px bottom bar.
- "You are {name}" is hidden below `sm` to keep the app bar to one line.
- No horizontal page scroll at 1000px or at 1440px. Verify by resizing the browser.
- Do not use fixed pixel widths on containers. `minWidth: 140` on the Select and `minWidth: 48` on cards are the only fixed widths. The fixed heights in `Layout.tsx` (AppBar 64, bottom bar 88) apply at lg and up only.

## 9. Acceptance checklist for the implementer

Run `npm run lint`, `npm run tsc:check` and `npm run build`; all must pass with no Biome warnings (the three `biome-ignore` comments, two in ActionBar and ErrorSnackbar plus the `noDangerouslySetInnerHtml` one in HtmlBody, are expected and must include their explanation text). Do not write tests. Then verify in a browser with `npm run dev` and `ALLOW_DEV_USER=1` set in the environment (or `.env`; never read or print `.env`):

1. Open `http://localhost:3838/?devUser=alice` in one browser profile and `http://localhost:3838/?devUser=bob` in another (separate profiles or one normal and one private window, so the identity does not collide). Each shows "You are alice" / "You are bob" and both appear in each other's list.
2. Queue: with the dev server pointed at Jira, the queue shows tickets for the selected project. Change the project and confirm the board select reloads its options and the list changes on both pages. Toggle "Needs pointing only" and confirm the list changes (the team's main project has thousands of open unpointed tickets, so the unfiltered list is large and the label filter matters). Toggle "Clear label on save" and confirm Bob's page shows the same state. Alice clicks "Point this" on a row; both pages show the same ticket card and that row reads "Current".
3. Search: type "dashboard" in the search box and confirm matching tickets appear after a short pause with a progress bar while waiting, and only on the page that searched. Type a full key such as `PP-123` and confirm it is found directly. A single character does nothing and clears the results. A query with no hits shows "No matches". "Point this" on a result loads it for everyone.
4. Start a round if the phase is idle. Alice picks 5: her card shows pressed, Bob's list shows a green check for Alice but no value. Alice clicks 5 again: the check disappears (vote cleared).
5. Both vote; Bob picks 8 and Alice 5, then Reveal (also try revealing with one vote). Values appear as chips on both pages. The Save select presets to 8 (tie goes higher). Make both vote the same card in another round and confirm that card is preset. Vote `?` only and confirm Save stays disabled until a number is picked.
6. Save to Jira on a throwaway ticket: Save shows a spinner, then a green "Saved N pts by name" on both pages, and Story Points change in Jira. With "Clear label on save" on, the ticket also disappears from the queue on both pages once the queue refreshes. Trigger an error (for example save with an invalid or unreachable Jira) and confirm both the snackbar and the red inline alert appear; trigger the same error twice and confirm the snackbar reopens.
7. Stop the dev server. Within a few seconds both pages show "Reconnecting…" and all controls become disabled while the last state stays visible. Restart the server; both pages reconnect on their own (backoff never exceeds about 10 seconds), the chip returns to "Connected", and controls re-enable.
8. Open the app with `ALLOW_DEV_USER` unset and no identity headers: the page shows "Open this app inside the hosting platform" and the browser network panel shows no reconnect attempts after the 4401 close.
9. Resize to 1000px wide (below the `lg` breakpoint): no horizontal scroll, sections stack, controls are usable. Tab through the page with the keyboard and confirm every control is reachable and the pressed card state is announced.
10. React StrictMode is on in dev: confirm in the server log that each page opens one lasting connection, not a growing number of them, and that edits to a component hot-update without a full reload.
11. Layout at 1440px wide: three panes visible side by side (queue left, description center, comments right) and the one-row bottom bar always visible at the bottom edge: participant chips left, Deck middle, actions right. Load a ticket with a long description and many comments: the description and comments panes scroll independently, and the queue pane and bottom bar do not move. The page itself has no vertical scrollbar.
12. Bottom bar by phase: in `voting` the right section shows Reveal and Reset only; in `revealed` it shows the Story points select, Save to Jira and Next ticket, and the left section shows each chip's vote plus "Avg", count chips and "Consensus" or "No consensus" inline; unselected cards are dimmed and the selected card stays filled. Shrink the window so the bar is crowded: the participant chips wrap first. Saved and error alerts appear compactly at the far right.
13. Below 1200px wide (for example 1000px): everything stacks full width in the order Queue, Description, Comments, bottom bar; the bar is not sticky; nothing is clipped and there is no horizontal scroll, including with a wide code block or table in the description.
14. Ticket rendering: a description with a bulleted list, a link, a code block and a table renders with bullets, a clickable link (opens in a new tab), monospace code and a horizontally scrollable `pre`. An image in a description or comment appears as a link, not an `img`. Comments appear oldest first with author and a local date. A ticket with no description shows "No description"; one with no comments shows "Comments (0)" and "No comments". With no ticket loaded both panes show muted placeholders. Tab reaches every control in the bottom bar. Click "Open in Jira" in the description header: the ticket opens in a new tab and the app page keeps its state.
