# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the navy AppBar and three-pane page with the approved slim header, two-column layout, denser queue, tabbed ticket view, and avatar-plus-card players.

**Architecture:** Client-only React/MUI changes. New focused components (Header, QueueControls, TicketView, Players, IssueTypeIcon) are built in parallel against fixed props; one integration task rewires `App.tsx` and `Layout.tsx` last.

**Tech Stack:** React 19, MUI 7 (`@mui/material`, `@mui/icons-material`), Vite, TypeScript, Biome.

**Spec:** `docs/superpowers/specs/2026-10-16-ui-redesign-design.md`

## Global Constraints

- Client only: no edits to `server/`, `shared/`, or the protocol.
- No test files or test script (repo decision; the user also said no tests). Verification = the gate plus a browser check.
- Gate before every commit (zsh; check the exit status unpiped): `npm run format && npm run lint && npm run tsc:check && npm run build`.
- Comments explain why, not what. Relative imports use explicit `.ts`/`.tsx` extensions where the repo already does.
- Colors come from the MUI theme (`client/src/theme.ts`), not hard-coded hex, except where the theme has no token (then add one to the theme).
- Status and outlier color always come with text (tooltip, value, or label).
- Never click "Save to Jira" in dev; it writes to the real Jira.
- Commit message trailer, exactly:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_012dCT1s9ZRTo1j9pEHk5ZUA`

## Review Focus

- Long usernames and summaries: ellipsis, never wrap the layout or push the deck off-center.
- Many players (10+): the players zone wraps to a second line without overlapping the deck.
- Disconnected viewer: header shows the amber "Reconnecting…" state; controls disabled, not hidden.
- Revealed round where every vote is equal, or votes are only `?`/`☕`: no amber outliers.
- Ticket with no description, no comments, null assignee/priority, no labels: placeholders, no empty labeled cells.

---

### Task 1: Shared helpers

**Files:**
- Create: `client/src/lib/initials.ts`
- Create: `client/src/components/IssueTypeIcon.tsx`

**Interfaces:**
- Produces: `initials(name: string): string` (1 to 2 uppercase letters: first letters of the first two words split on whitespace, `.`, `_`, `-`; a single word gives its first two letters; empty gives `"?"`).
- Produces: `IssueTypeIcon({ type }: { type: string }): JSX.Element` rendering an MUI icon at `fontSize="inherit"` with `titleAccess={type}`. Map (case-insensitive): Bug → `BugReportOutlined`, Story → `BookmarkBorder`, Epic → `Bolt`, Research → `ScienceOutlined`, Subtask/Sub-task → `SubdirectoryArrowRight`, Task → `CheckBoxOutlined`, anything else → `DescriptionOutlined`.

- [ ] Step 1: Implement both files.
- [ ] Step 2: Gate passes.
- [ ] Step 3: Commit "Add initials and issue-type icon helpers for the redesign".

### Task 2: Header and QueueControls (parallel with 3, 4, 5)

**Files:**
- Create: `client/src/components/Header.tsx`
- Create: `client/src/components/QueueControls.tsx`
- Do not edit `QueuePanel.tsx` (Task 3 owns it) or `App.tsx` (Task 6).

**Interfaces:**
- Produces: `export const HEADER_HEIGHT = 48` and `Header({ connected, meName, controls }: { connected: boolean; meName?: string; controls?: ReactNode })`.
  - Light background (`theme.palette.grey[50]`-ish token), 1px bottom divider, height `HEADER_HEIGHT`, grid `1fr auto 1fr`, `px: 2`.
  - Left: `controls`. Center: "Pointing Poker" as `h1` (`variant="subtitle1"`, weight 600), hidden below `md`. Right: 8px dot (success color when connected, warning when not) in a `Tooltip` "Connected"/"Reconnecting…", then username; when disconnected also the text "Reconnecting…".
- Produces: `QueueControls({ settings, projects, boards, disabled, onChangeSettings, onRefresh })` with the same prop types as today's `QueuePanel` props of those names. Copy the Project select, Board select, and Refresh button markup and behavior from `QueuePanel.tsx` (read it; do not change it), sized `small`, laid out in one row.

- [ ] Step 1: Implement both files.
- [ ] Step 2: Gate passes.
- [ ] Step 3: Commit "Add the slim header and extracted queue controls".

### Task 3: Queue rows (parallel with 2, 4, 5)

**Files:**
- Modify: `client/src/components/QueuePanel.tsx`
- Optionally create: `client/src/components/TicketRow.tsx` if it keeps `QueuePanel.tsx` readable.

**Interfaces:**
- Consumes: `IssueTypeIcon` (Task 1).
- Produces: `QueuePanel` Props become `{ queue, searchResults, currentKey, disabled, onPick, onSearch }` (remove `settings`, `projects`, `boards`, `onChangeSettings`, `onRefresh` and their markup; Task 2 now renders them). Keep search persistence, collapse persistence, section headers and the "N tickets · updated" caption unchanged.

- [ ] Step 1: Replace each row (queue and search results share it) with a two-line `ListItemButton`: line 1 = `IssueTypeIcon`, key as `Link` (new tab, `rel="noopener noreferrer"`, `onClick` stops propagation), status as a small badge right-aligned; line 2 = summary, one line, ellipsis, `title={summary}`. Row click calls `onPick(key)`. Current row (`key === currentKey`): selected background, left accent border, not clickable, `aria-current="true"`. Remove the "Point this" button. Disabled when `disabled`.
- [ ] Step 2: Gate passes (`App.tsx` will not compile against the new props until Task 6; if tsc fails only on `App.tsx` QueuePanel props, note it and still commit; Task 6 fixes it).
- [ ] Step 3: Commit "Make queue rows two lines and clickable".

### Task 4: Ticket view (parallel with 2, 3, 5)

**Files:**
- Create: `client/src/components/TicketView.tsx`
- Modify: `client/src/components/TicketComments.tsx` (list only, no Paper/heading)
- Delete: `client/src/components/TicketDescription.tsx` after `TicketView` replaces it (Task 6 updates the import).

**Interfaces:**
- Consumes: `initials`, `IssueTypeIcon` (Task 1); `HtmlBody` (existing).
- Produces: `TicketView({ ticket }: { ticket: Ticket | null })`.
  - `ticket === null`: empty state, centered: "Pick a ticket to start" and three numbered steps exactly: "Pick a ticket from the queue", "Everyone picks a card", "Reveal and save points to Jira".
  - Loaded: small line (`IssueTypeIcon`, type, key `Link`, `OpenInNew` icon link with `aria-label="Open in Jira"`); large summary (`h2`); right-aligned "Current" box with `currentPoints` or "–" and "pts"; labeled row (label caption above value) for Status, Priority, Assignee ("Unassigned" when null), Labels (comma-joined; omit the cell when empty; omit Priority when null); MUI `Tabs`: "Description" and "Comments" with a count badge. Tab state resets to Description when `ticket.key` changes. Description: `HtmlBody` or "No description".
- Produces: `TicketComments({ comments }: { comments: TicketComment[] })`: per comment an initials `Avatar` (24px), author, relative time from `createdAt` via `Intl.RelativeTimeFormat` ("2d", "3h", "just now"), full local date in a `Tooltip`, body via `HtmlBody`; "No comments" when empty.

- [ ] Step 1: Implement.
- [ ] Step 2: Gate passes (same `App.tsx` caveat as Task 3).
- [ ] Step 3: Commit "Add the tabbed ticket view and empty-state guide".

### Task 5: Players and deck (parallel with 2, 3, 4)

**Files:**
- Create: `client/src/components/Players.tsx`
- Delete: `client/src/components/ParticipantChips.tsx` once `Players` covers it (Task 6 updates the import). Read it first and keep its stats text/logic.
- Modify: `client/src/components/Deck.tsx` (selected card lifts: `transform: translateY(-4px)`, keep focus visible).

**Interfaces:**
- Consumes: `initials` (Task 1).
- Produces: `Players({ players, phase, meId, stats })`, same prop types as today's `ParticipantChips`.
  - Each player: 26px initials avatar with a 14x20 card tucked at its top-right, username below (max 44px, ellipsis, full name in `title` and as the avatar's accessible name).
  - Card: no vote → dashed outline; `hasVoted` and `vote === null` → face-down (striped back using theme primary); `vote !== null` → face-up value. Disconnected (`connected === false`) → whole item at 0.35 opacity, no card.
  - Viewer (`userId === meId`): ring on avatar, bold name.
  - Outliers: when `phase === "revealed"` and the numeric votes (`isNumericCard`) contain at least two distinct values, the players with the max and min numeric votes get the warning-color card plus `aria-label` "<name> voted <v>, highest/lowest".
  - Beside the players: during voting "X of Y voted" (Y = connected players, X = connected players with `hasVoted`); after reveal the existing stats text from `ParticipantChips`.
  - Wraps to a second line when crowded.

- [ ] Step 1: Implement.
- [ ] Step 2: Gate passes (same `App.tsx` caveat).
- [ ] Step 3: Commit "Show players as avatars holding cards; lift the picked card".

### Task 6: Integration (after 2 to 5)

**Files:**
- Modify: `client/src/App.tsx`, `client/src/components/Layout.tsx`
- Delete: `client/src/components/TopBar.tsx`
- Modify docs: `docs/spec/03-client.md` (components and layout), `docs/spec/08-decision-log.md` (new entry dated 10/16/2026 linking the spec).

**Interfaces:**
- Consumes everything above.
- Produces: `Layout({ left, main, bottom })`: two columns at `lg+` (queue `lg: 4`, main `lg: 8`), `APPBAR_HEIGHT` replaced by `HEADER_HEIGHT`; bottom bar unchanged sticky behavior.

- [ ] Step 1: `App.tsx`: render `Header` with `controls={snapshot ? <QueueControls …/> : undefined}`; `Layout` with `left={<QueuePanel …new props/>}`, `main={<TicketView ticket={snapshot.ticket} />}`; bottom bar as a grid `1fr auto 1fr` (players left, `Deck` center, `ActionBar` right, `justifySelf: end`), stacking below `lg`.
- [ ] Step 2: Gate passes with no caveats.
- [ ] Step 3: Commit code, then docs, then `git push`.

### Task 7: Review and browser check

- [ ] Step 1: Whole-branch review of the redesign commits against the spec and Review Focus.
- [ ] Step 2: `npm run dev`, open `http://localhost:3838/?devUser=alice` and `?devUser=bob` tabs; check every Review Focus line plus the spec's Verification list. Never click Save to Jira. Stop the server, confirm port 3838 is free.
