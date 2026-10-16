# UI redesign: header, layout, queue, ticket view, bottom bar

Date: 10/16/2026. Status: approved design, not yet implemented.

## Why

Inside the published Civis report, the app's own navy `AppBar` sits right under the Civis Platform
nav, so the page shows two dark bars and loses vertical space. The rest of the page also wastes
room: three-line queue rows (about 7 fit), two mostly empty panes before a ticket loads, and a
bottom bar with players far left and cards far right. The user asked to improve the whole UI.
Mockups for every decision below were reviewed in the visual companion.

## Scope

Client only (`client/src`). No protocol, server, or `shared/` changes. Below the `lg` breakpoint
everything stacks and the page scrolls, as today.

## 1. Header (replaces `TopBar`)

- One slim, light row (light grey background, bottom border), not an `AppBar` in the primary color.
- Three-column grid `1fr auto 1fr`, so the title stays centered whatever the side widths are:
  - Left: Project select, Board select, Refresh button. These move out of `QueuePanel` unchanged
    in behavior (same `onChangeSettings` / `onRefresh` handlers, same disabled rules). Hidden
    until the first snapshot arrives.
  - Center: "Pointing Poker". Hidden first on narrow screens.
  - Right: status dot plus the viewer's username. Green dot when connected (tooltip
    "Connected"). Amber dot plus the text "Reconnecting…" when disconnected.
- `Layout`'s fixed `APPBAR_HEIGHT` becomes the new header height.

## 2. Layout

- Always two columns at `lg+`: queue (left) and main (right). The `right` comments pane is removed
  from `Layout`; comments move into the main area (section 5).
- Bottom bar stays sticky at the bottom, as today.

## 3. Queue rows (`QueuePanel`, shared by queue sections and search results)

- Two lines per row:
  - Line 1: issue-type icon, ticket key (still a link to Jira, opens in a new tab, its click
    does not point the ticket), status as a small badge on the right.
  - Line 2: summary on one line with ellipsis; full summary in the native `title` tooltip.
- The whole row is a button that points the ticket (replaces the "Point this" button). Keyboard
  reachable. The current ticket's row is highlighted (tinted background, left accent border) and
  is not clickable.
- Issue-type icon: a small fixed map from Jira type name (Task, Bug, Story, Epic, Research,
  Subtask) to an MUI icon, with a generic icon for anything else.
- Section headers, the search box, and the "N tickets · updated" caption stay as they are.

## 4. Empty state (no ticket loaded)

The main area shows "Pick a ticket to start" and three numbered steps: 1. Pick a ticket from the
queue, 2. Everyone picks a card, 3. Reveal and save points to Jira.

## 5. Ticket view (main area, ticket loaded)

- Header:
  - Small line: type icon, type name, key (link), and a ↗ icon link to Jira. The "Open in Jira"
    button goes away.
  - Large title: the summary.
  - "Current points" box on the right: the value, or "–" when unset.
  - A labeled row (label above value) for Status, Priority, Assignee ("Unassigned" when null),
    and Labels (omitted when there are none). This replaces the chip row.
- Tabs: "Description" and "Comments" with a count badge. The tab resets to Description when a
  different ticket loads. Description body is today's `HtmlBody`; "No description" / "No comments"
  when empty.
- Comments: initials avatar, author, relative time from `createdAt` (for example "2d"; full date
  in a tooltip), then the body via `HtmlBody`.

## 6. Bottom bar

- Three-column grid `1fr auto 1fr`: players (left), deck (center), actions (right).
- Deck: today's `Deck` cards, centered; the selected card lifts slightly.
- Actions: today's `ActionBar` per phase (Start round; Reveal and Reset; points select, Save to
  Jira, Next ticket). Behavior unchanged.

## 7. Players (replaces `ParticipantChips` rendering)

- Each player: initials avatar with a small card tucked behind its top-right corner, username
  below (ellipsis when long).
- Card state:
  - Waiting (no vote): dashed outline.
  - Voted, not revealed: face-down (patterned back).
  - Revealed: face-up with the vote value.
  - Outlier: after reveal, when the numeric votes differ, the highest and the lowest numeric
    votes render in amber.
- The viewer gets a ring around the avatar and a bold name. Disconnected players
  (`connected: false`) render faded, with no card.
- Beside the players: "X of Y voted" during voting (Y counts connected players), and the existing
  stats (average and range) after reveal.

## Accessibility

Visible focus on rows, cards, and tabs. Status dot and outlier color always come with text
(tooltip, value, or label), never color alone. Avatars carry the full username as an accessible
name.

## Verification

No test suite by design (`docs/spec/08-decision-log.md`). The gate
(`npm run format && npm run lint && npm run tsc:check && npm run build`) must pass, then a browser
check in `npm run dev` with two or three `?devUser=` tabs: header states (connected and stopped
server), queue row click and key link, empty state, tabs reset on a new ticket, players in
waiting / voted / revealed / offline states with an outlier, and the `lg` breakpoint stacking.
Never click Save to Jira in dev, which writes to the real Jira.

## Docs to update with the code

`docs/spec/03-client.md` (components and layout), a decision-log entry, and
`docs/spec/mocks/pointing-poker.html` if it is kept in sync.
