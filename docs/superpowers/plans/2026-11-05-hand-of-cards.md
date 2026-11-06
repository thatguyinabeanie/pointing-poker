# Hand of Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed bottom bar with a players strip above the ticket, a floating hand of cards that peeks at rest and deals into an arc, and a floating results pill after the reveal.

**Architecture:** Client only. The players and round buttons move into a sticky strip at the top of the Ticket pane. `Layout` loses its bottom `Paper` and gains a fixed-position `floating` slot centered on the Ticket column. The deck becomes `Hand` (geometry in a pure `lib/handLayout.ts`), and the revealed actions become `ResultsPill`, which reuses `ActionBar`'s points logic through a new `usePointsPick` hook.

**Tech Stack:** React 19, MUI 9 (`sx`), Vite, TypeScript, Biome. Node 26 runs `.ts` by type stripping.

**Spec:** `docs/superpowers/specs/2026-11-05-hand-of-cards-design.md`. Playable reference: `docs/spec/mocks/hand-of-cards-playtest.html`.

## Global Constraints

- No server, protocol or `shared/` change. Commands used: `vote`, `reveal`, `reset`, `reset` with `clearTicket: true`, `saveEstimate`.
- No test files and no test script (decision log). Verification is the gate, throwaway `node -e` checks, and the browser.
- Gate before every commit: `npm run format && npm run lint && npm run tsc:check && npm run build`.
- Relative imports carry explicit `.ts`/`.tsx` extensions. Comments explain why, not what.
- Card size 46×64px. Rest pose per step from the middle: 11px sideways, 4° tilt, 0.4px drop per step squared. Open pose (Medium): 52px sideways, 5° tilt, 2.2px drop per step squared. Stagger 10ms per step from the middle.
- At rest about 30px of the fan shows above the bottom edge; the selected card is raised higher and filled `primary.main`.
- Open: the middle card is lifted by the end cards' drop plus 20px, so the outer cards land just above the bottom edge. Hovered or focused card lifts 12px more. Hint text under the open arc: `← → to move · Enter to vote · Esc to close`.
- The hand closes right after a pick, even with the mouse still over it, and does not reopen until the pointer leaves and returns or the keyboard reopens it.
- Results pill: 16px above the bottom edge, white, 14px radius, soft shadow. Order: vote chart, "Avg {average} · Median {median}", chip, Points select, Save (`aria-label="Save to Jira"`), Next. While the arc is open the pill is at opacity 0.15 with `pointer-events: none`.
- Strip buttons: idle "Start round"; voting "Reveal" (contained) and "Reset"; revealed "Reset". Reset sends `{ type: "reset" }`. Next (in the pill) sends `{ type: "reset", clearTicket: true }`.
- `suggestPoints` (`client/src/lib/estimate.ts`) is unchanged: most common vote, ties to the higher card.
- Hand ARIA: `role="toolbar"`, `aria-label` "Your cards, current vote {v}" (or "Your cards, no vote"); cards are `button`s with `aria-pressed` and `aria-label` "Vote {v}" ("Vote coffee break" for ☕).
- Commit messages: the problem, the reasoning, what was verified. End with the session's Co-Authored-By and Claude-Session lines. Push after each commit.

## Review Focus

1. **Moving the mouse from the peek up to an end card (0 or ☕)** must not close the arc on the way; the hover zone has to cover the whole arc. Pinned in Task 3, Step 5.
2. **Pressing Enter twice after a keyboard vote** must reopen the arc, never take the vote back. Pinned in Task 3, Step 5.
3. **Someone else reveals while your arc is open**: the hand shifts left beside the pill and stays usable; the pill is faded until it closes. Pinned in Task 3, Step 5.
4. **A long ticket**: its last line must scroll clear of the peek while voting and of the pill after the reveal. Pinned in Task 2, Step 6.
5. **Many players in a narrow Ticket column** (resize handle dragged wide): compact mode kicks in, and gives the same answer while voting and after the reveal. Pinned in Task 1, Step 5.

---

### Task 1: Players strip with round controls

**Files:**
- Create: `client/src/components/RoundControls.tsx`
- Modify: `client/src/components/Players.tsx` (becomes the strip)
- Modify: `client/src/components/ActionBar.tsx` (drop Reveal, Reset, Start round)
- Modify: `client/src/components/RoundSummary.tsx` (drop the voting count; revealed view only)
- Modify: `client/src/App.tsx` (strip at the top of the Ticket pane; bar keeps the deck row only)

**Interfaces:**
- Produces: `RoundControls({ phase, votedCount, connectedCount, disabled, onReveal, onReset }: { phase: Phase; votedCount: number; connectedCount: number; disabled: boolean; onReveal: () => void; onReset: (opts: { clearTicket: boolean }) => void })`.
- Produces: `Players({ players, phase, meId, disabled, onReveal, onReset })`, same types as above for the shared props; `stats` is no longer a prop.
- Consumes: `App`'s existing `onReveal`, `onReset`.

- [ ] **Step 1: Create `RoundControls`.** Status text right-aligned (`body2`): voting "{votedCount} of {connectedCount} voted", revealed "Revealed", idle nothing. Buttons per the Global Constraints table; Reset calls `onReset({ clearTicket: false })`. All disabled when `disabled`; Reveal stays enabled with zero votes (today's behavior).
- [ ] **Step 2: Turn `Players` into the strip.** One flex row: the pills (`Pill`, `findOutliers`, `PILL_LIST_SX` kept), left-aligned, then `RoundControls` at the right. Drop the `1fr auto 1fr` grid and `SUMMARY_RESERVED_WIDTH`. Keep compact mode on the hidden copy; the room is the row width minus `Math.max(controlsWidth, CONTROLS_RESERVED_WIDTH)` minus 16px. Start `CONTROLS_RESERVED_WIDTH` at 280 with a comment that Task 4 measures the voting layout and corrects it. At `lg`: `position: sticky`, `top: 0`, `zIndex: 1`, `bgcolor: "background.paper"`, fixed 52px height, bottom divider. Below `lg`: not sticky, wraps.
- [ ] **Step 3: Rewire `App`.** `main` becomes the strip followed by `TicketView`. The bar keeps only the deck row: empty left cell → `RoundSummary` (revealed view), `Deck` center, `ActionBar` right (Points, Save, Next only). Remove the vote count from `RoundSummary`.
- [ ] **Step 4: Gate.** Run the gate. Expected: all four commands exit 0.
- [ ] **Step 5: Browser check.** `npm run dev`, two tabs with different `?devUser=` values (needs `ALLOW_DEV_USER=1`). Start round, vote, Reveal from the strip, Reset after the reveal keeps the ticket and returns to voting. Add players with more `?devUser=` tabs and drag the resize handle until names drop: the compact answer is the same while voting and after the reveal.
- [ ] **Step 6: Commit and push.**

### Task 2: Floating group, results pill, no bar

**Files:**
- Create: `client/src/usePointsPick.ts`
- Create: `client/src/components/ResultsPill.tsx`
- Modify: `client/src/components/Layout.tsx`
- Modify: `client/src/App.tsx`
- Delete: `client/src/components/ActionBar.tsx`, `client/src/components/RoundSummary.tsx`

**Interfaces:**
- Produces: `usePointsPick({ phase, round, ticketKey, stats, deck }: { phase: Phase; round: number; ticketKey: string | null; stats: Snapshot["stats"]; deck: readonly string[] }): { points: string; setManualPoints: (points: string) => void }`. It is `ActionBar`'s points effect, ref and `pp.points.pick` storage moved verbatim, comments and the biome-ignore included.
- Produces: `ResultsPill({ round, stats, ticket, deck, disabled, jiraSave, onSave, onNext }: { round: number; stats: Snapshot["stats"]; ticket: Ticket | null; deck: readonly string[]; disabled: boolean; jiraSave: JiraSave; onSave: (points: number) => void; onNext: () => void })`. Rendered only in `revealed`. Its root carries `data-results`.
- Produces: `Layout({ left, main, floating }: { left: ReactNode; main: ReactNode; floating: ReactNode })`. `bottom` is gone.
- Consumes: `VoteChart` and the chip rule from `RoundSummary` (moved into `ResultsPill.tsx`), `suggestPoints`.

- [ ] **Step 1: Extract `usePointsPick`** from `ActionBar` with no behavior change.
- [ ] **Step 2: Create `ResultsPill`** per the Global Constraints (order, Save enablement exactly as `ActionBar`'s `canSave`, spinner while saving). Next calls `onNext`.
- [ ] **Step 3: Rework `Layout`.** Remove the `Paper`, `BOTTOM_BAR_HEIGHT`, `BAR_GAP`. `PANE_MAX_HEIGHT` becomes `calc(100vh - HEADER_HEIGHT - PAGE_TOP_PADDING)`. Render `floating` in a `position: fixed`, `bottom: 0` box with the app bar's `zIndex`. At `lg` its horizontal center is the Ticket column's center, from a `ResizeObserver` on that column's box (so it follows the resize handle); below `lg`, 50% of the window. Keep the measure-and-publish pattern, renamed `--floating-height`, and give each pane `paddingBottom: var(--floating-height)` so content scrolls clear.
- [ ] **Step 4: Wire `App`.** `floating` is a flex row, `alignItems: "flex-end"`, 20px gap: the existing `Deck` (temporarily, until Task 3), then `ResultsPill` when revealed. `onNext` sends `{ type: "reset", clearTicket: true }`. Delete `ActionBar.tsx` and `RoundSummary.tsx`.
- [ ] **Step 5: Gate.** Expected: all four commands exit 0.
- [ ] **Step 6: Browser check.** No bar. Reveal: the pill shows chart, stats, chip, Points (suggested), Save, Next; a manual Points pick survives a refresh; Next clears the ticket. Load a long ticket and scroll the Ticket pane to the end: the last line sits above the deck while voting and above the pill after the reveal. Drag the resize handle: the group stays centered on the Ticket column.
- [ ] **Step 7: Commit and push.**

### Task 3: The hand

**Files:**
- Create: `client/src/lib/handLayout.ts`
- Create: `client/src/components/Hand.tsx`
- Modify: `client/src/App.tsx` (Hand replaces Deck; pill fade)
- Delete: `client/src/components/Deck.tsx`

**Interfaces:**
- Produces (`lib/handLayout.ts`, no imports): `REST = { dx: 11, rot: 4, dy: 0.4 }`, `OPEN = { dx: 52, rot: 5, dy: 2.2 }`, `CARD_WIDTH = 46`, `CARD_HEIGHT = 64`; `fitStep(available: number, cards: number): number` returns `Math.min(OPEN.dx, (available - CARD_WIDTH) / (cards - 1))`; `cardPose(offset: number, open: boolean, step: number): { x: number; y: number; rotate: number }` where `offset` is the index minus the middle, and the open drop scales with the step (`OPEN.dy * step / OPEN.dx`) so a narrowed arc keeps its shape; `openLift(cards: number, step: number): number` is 20 plus the end card's drop.
- Produces: `Hand({ deck, selected, disabled, onSelect, onClear }: { deck: readonly string[]; selected: string | null; disabled: boolean; onSelect: (card: string) => void; onClear: () => void })`. Its root carries `data-hand-open="true" | "false"`.
- Consumes: `App`'s `onSelect`, `onClear` (the toggle stays: clicking the selected card calls `onClear`).

- [ ] **Step 1: Write `lib/handLayout.ts`.**
- [ ] **Step 2: Check the geometry.**

```sh
node -e 'import("./client/src/lib/handLayout.ts").then(({ fitStep, cardPose, openLift }) => {
  console.log(fitStep(1200 - 32, 11), Math.round(fitStep(375 - 32, 11) * 10) / 10);
  const end = cardPose(5, true, 52);
  console.log(end.x, end.y, end.rotate, openLift(11, 52));
})'
```

Expected: `52 29.7` then `260 55 25 75`.

- [ ] **Step 3: Write `Hand`.** Positions from `cardPose`; step from `fitStep(window width - 32, deck.length)` on resize. Open state rules, all from the spec:
  - Mouse: `pointerenter` (pointerType `mouse`) opens unless suppressed; leaving the hover zone closes and clears the suppression. The hover zone is a pseudo-element that grows to cover the open arc.
  - Pick: vote (or `onClear` for the selected card), close, suppress, blur on a mouse pick.
  - Keyboard: roving `tabIndex` (selected card, else "5"); focus opens; ← → move; Enter or Space votes; Esc closes. While closed with focus on a card, Enter, Space, ← and → reopen and never vote. Focus leaving the hand closes it.
  - Touch: a tap on the peek opens without voting; a tap on a card votes and closes; a `pointerdown` outside closes.
  - `disabled` or `phase === "idle"` (App passes `disabled` for both): dimmed to 0.5, never opens, cards disabled.
  - `prefers-reduced-motion: reduce`: no transitions or stagger.
- [ ] **Step 4: Wire `App`.** `Hand` replaces `Deck` in the floating row (left of the pill). The floating row's `sx` fades the pill: `"&:has([data-hand-open='true']) [data-results]": { opacity: 0.15, pointerEvents: "none" }` with a 200ms opacity transition. Delete `Deck.tsx`.
- [ ] **Step 5: Gate, then browser check.** Gate expected: all exit 0. In the browser at 1200px and 1440px: all 11 cards on screen when open; move slowly from the peek to 0 and to ☕ without the arc closing; a pick closes it with the mouse still there; clicking your card again takes the vote back; Tab, ←, →, Enter votes, a second Enter reopens and the vote stays; Esc closes. With the arc open in one tab, Reveal from the other tab: the hand shifts left beside the pill, still open, pill faded until it closes. At 375px with touch emulation: tap opens, tap votes, tap outside closes, no horizontal scroll. With reduced motion emulated: no animation.
- [ ] **Step 6: Commit and push.**

### Task 4: Docs and measured values

**Files:**
- Modify: `docs/spec/08-decision-log.md` (new entry 51; note on 48)
- Modify: `docs/spec/03-client.md` (file map, Layout, Players, the removed sections, accessibility, responsive rules)
- Modify: `docs/spec/01-overview.md`, `docs/spec/00-README.md`, `docs/spec/05-build-plan.md` (any "bottom bar" wording)
- Modify: `client/src/components/Players.tsx` (`CONTROLS_RESERVED_WIDTH` measured value)

- [ ] **Step 1: Measure the strip controls** at a 1440px layout while voting ("3 of 3 voted", Reveal, Reset) with `getBoundingClientRect().width`, round up to the next 10px, set `CONTROLS_RESERVED_WIDTH`, and cite the measurement in its comment.
- [ ] **Step 2: Decision log entry 51.** "Hand of cards replaces the bottom bar (11/05/2026)": the problem (164px inside the platform frame), the user's choices D1 to D7 from the spec, the Reset-after-reveal addition, the floating group centered on the Ticket column, the touch rulings as untested, and the playtest mock path. Add "Replaced by decision 51 for the bar and the players row" to entry 48.
- [ ] **Step 3: `03-client.md`.** Replace the Players, RoundSummary, Deck and ActionBar sections with Players (strip), RoundControls, Hand, ResultsPill and `usePointsPick`; update Layout, the file map, the accessibility checklist (the toolbar replaces the `Voting cards` group; no sticky bar) and the responsive rules (no 148px bar). Leave `docs/spec/reference/` alone; it is historical.
- [ ] **Step 4: Sweep** `grep -rn "bottom bar" docs/spec --include=*.md | grep -v reference/` and update what is now wrong.
- [ ] **Step 5: Gate, commit and push.**
