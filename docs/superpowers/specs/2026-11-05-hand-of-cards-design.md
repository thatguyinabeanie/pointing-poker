# Hand of cards: replace the bottom bar

## Why

The user's feedback on 11/05/2026, from the deployed app inside the Civis Platform frame: the
bottom bar takes too much space. At `lg` it is a fixed 148px bar plus a 16px gap (decision 48),
about 164px, and inside the platform's own nav bar and the browser chrome that is a large share
of a laptop screen. With one or two players the players row is mostly empty.

The user asked for a redesign that "keeps things out of the way until needed": the cards do not
need to be always visible and so big. They suggested collapsing the cards together and fanning
them out on hover, and asked to be creative with the UI.

## How the design was chosen

All choices were made by the user on 11/05/2026 in the visual companion:

1. Text options first: the user chose to move the players out of the bar, to a strip above the
   ticket, over tightening the two tiers or merging them into one row.
2. Three mockups: a fanned hand (A), a slim dock that magnifies on hover (B), and a floating vote
   chip with a pop-up tray and no bar (C). The user asked for a combination of A and C.
3. Two combinations: a floating hand, and a chip that deals a fan. The user picked "the initial
   state of A" (the small fanned stack peeking up from the bottom edge) with the arc that the
   cards deal into in the second combination.
4. One merged mockup with an arc spread switch (tight, medium, wide). No spread was clicked;
   medium is the default.
5. A playable mock with every decision below. The user played it and approved it ("this feels
   good"). It is kept at `docs/spec/mocks/hand-of-cards-playtest.html`.

## Decisions

| # | Question | Decision |
|---|---|---|
| D1 | Where do the players go? | A strip at the top of the ticket pane, with the round controls |
| D2 | What replaces the bar? | Nothing. A small fanned hand floats at the bottom edge |
| D3 | How do the cards open? | Hover (or keyboard focus) deals them up into an arc |
| D4 | After a pick? | The hand closes right away, even with the mouse still over it |
| D5 | Results after the reveal? | A floating results pill, always full size |
| D6 | Changing a vote after the reveal? | The hand keeps peeking, to the left of the pill |
| D7 | Keyboard? | Arrow keys inside the hand. No number shortcuts |

## Scope

In scope, client only:

1. Players strip at the top of the ticket pane (D1).
2. The hand: peek at rest, arc when open (D2, D3, D4, D7).
3. The results pill (D5, D6).
4. Layout without the bottom bar.

Out of scope:

- Any server or protocol change. Every command already exists (`vote`, `reveal`, `reset`,
  `saveEstimate`).
- How suggested points are picked. `suggestPoints` keeps "most common vote, ties to the higher
  card". The playtest mock broke ties toward the median; that was mock-only.
- Number-key shortcuts (D7). The two-digit cards (13, 21) need a typing buffer, and the user
  chose arrow keys only.
- What "Next" does. It still sends `{ type: "reset", clearTicket: true }`. The mock moved to the
  next ticket to keep the playtest going; in the app, Auto-advance (decision 46) does that.

## 1. Players strip (D1)

The players move from the bottom bar into a strip at the top of the **Ticket** pane, above
`TicketView`. It is sticky at the top of that pane, so it stays visible while the ticket scrolls.

Left to right:

1. The player pills, unchanged (`Pill`: avatar, short name, mini card, outliers, offline fade).
2. The round status, right-aligned: "N of M voted" while voting, "Revealed" after the reveal,
   nothing while idle. The count is the one `RoundSummary` shows today.
3. The round buttons, by phase:

| Phase | Buttons |
|---|---|
| `idle` | Start round |
| `voting` | Reveal (contained), Reset |
| `revealed` | Reset |

Reset in `revealed` is new. It sends `{ type: "reset" }`, which starts a new round on the same
ticket. The server already supports it; today only "Next" is offered after the reveal. The user
played it in the mock. "Next" moves to the results pill (section 3).

Compact mode keeps today's rule: every pill drops its name together when the names do not fit,
measured on the hidden copy that always shows names. The room is now the strip width minus the
status and buttons. To keep the decision independent of the phase (decision 48), the right side
reserves a fixed minimum width, the voting layout ("N of M voted", Reveal, Reset), measured in the
browser and rounded up like `SUMMARY_RESERVED_WIDTH` was. The centering grid from decision 48 is
not needed: the pills are left-aligned in the strip.

## 2. The hand (D2, D3, D4, D7)

### At rest (the peek)

- Eleven cards, 46×64px, stacked in a tight fan at the bottom edge of the window: each card
  offset 11px sideways and tilted 4° per step from the middle, and dropped 0.4px per step
  squared, so they sit on a shallow arc.
- About 30px of the fan shows above the bottom edge. The value is at the top of each card, so
  it reads in the peek.
- Your current vote is raised higher than the rest and filled navy (`primary.main`).
- There is no bar or background behind it.

### Open (the arc)

- Hover on the hand, or keyboard focus, deals the cards up into an arc, with a short stagger
  from the middle out (10ms per step).
- Medium spread: 52px sideways step, 5° tilt per step, 2.2px drop per step squared. The middle
  card is lifted by the end cards' drop, so the outer cards (0 and ☕) land just above the bottom
  edge (13px in the mock) and nothing is cut off.
- Values are centered at 18px. A hovered or focused card lifts 12px and gets a navy outline.
- An invisible hover zone grows with the arc, so moving the mouse up onto a card keeps it open.
- A one-line hint shows under the open arc: "← → to move · Enter to vote · Esc to close".

### Voting

- Clicking a card votes. Clicking your current card again takes the vote back (the same toggle
  as `Deck` today and the server).
- After a pick the hand closes right away (D4), even with the mouse still over it. It does not
  reopen until the mouse leaves the hover zone and comes back, or the hand gets keyboard focus
  again.

### Keyboard (D7)

- The hand is a `role="toolbar"` with `aria-label` such as "Your cards, current vote 5". Its
  cards are `button`s with `aria-pressed` and accessible names ("Vote 5", "Vote coffee break").
  A button inside a button would be invalid HTML, so the hand itself is not a button.
- One tab stop, by roving `tabIndex`: your current card, or the middle card (5) with no vote.
- Focusing that card opens the arc. Inside, ← and → move between cards, Enter or Space votes,
  and Esc closes.
- After a vote or Esc the hand is closed and focus stays on the card. While closed, Enter,
  Space, ← or → reopen the arc and never vote, so a second Enter cannot take the vote back by
  accident.
- Tab out of the hand closes it.

### States

- `idle`, or disconnected: the peek shows dimmed and does not open, like the disabled `Deck`
  today.
- `prefers-reduced-motion: reduce`: the arc opens and closes with no movement or stagger.

### Touch and narrow screens

The playtest covered a laptop with a mouse. For touch and narrow screens, these rulings stand
until someone tests them:

- No hover on touch: tapping the peek opens the arc, tapping a card votes and closes it, and
  tapping outside closes it.
- When the arc would be wider than the window minus 16px on each side, the sideways step shrinks
  to fit. Cards then overlap more, like a real hand, and each value stays in the visible part of
  its card.

## 3. The results pill (D5, D6)

After the reveal, a floating pill sits at the bottom center, 16px above the edge, white with a
soft shadow and a 14px radius. It is always full size (D5). Left to right:

1. The vote chart, `VoteChart` from `RoundSummary`, unchanged.
2. "Avg {average} · Median {median}".
3. One chip: Consensus, Spread {min}–{max}, or No numeric votes (today's `RoundSummary` rule).
4. The Points select, with all of today's `ActionBar` logic unchanged: the suggestion, the manual
   pick in a ref plus `sessionStorage` (`pp.points.pick`), and restore after a refresh.
5. Save (amber, `aria-label="Save to Jira"`, spinner while saving).
6. Next (outlined), which sends `{ type: "reset", clearTicket: true }` as today.

The hand keeps peeking to the left of the pill (D6), and the two are centered together as one
group. Opening the hand works exactly as before the reveal, and a changed vote updates the pill
live (decision 45). While the arc is open, the pill fades to 15% opacity and ignores the mouse,
because the arc overlaps its left end.

The save result stays a toast (decision 43).

## 4. Layout without the bar

- `Layout.tsx` drops the bottom `Paper`, `BOTTOM_BAR_HEIGHT`, the `--bottom-bar-height` variable
  and `BAR_GAP`. At `lg` the panes fill the height under the header.
- The hand and the pill render in a floating group: `position: fixed` at the bottom of the
  window, above the panes (`zIndex` of the app bar).
- At `lg` the group is centered on the **Ticket** column, not the window, so it moves with the
  resize handle. Layout already knows the queue width and the row width, so the center needs no
  new measuring. Below `lg` it is centered on the window.
- Each pane gets bottom padding inside its scroll area, so its last lines can scroll clear of the
  floating group: the peek's height while voting, the pill's height after the reveal.
- The open arc may cover the bottom of both panes while you pick. That is the trade the user
  accepted in the playtest.

## 5. Components

| File | Change |
|---|---|
| `components/Hand.tsx` | **New.** The peek and the arc, open and close rules, keyboard, touch. Props like `Deck`: `deck`, `selected`, `disabled`, `onSelect`, `onClear` |
| `components/ResultsPill.tsx` | **New.** Chart, stats, chip, Points, Save, Next. Takes over `ActionBar`'s points logic and `RoundSummary`'s revealed view |
| `components/RoundControls.tsx` | **New.** Status text and the round buttons for the strip |
| `components/Players.tsx` | Becomes the strip. Drops the deck-row grid and `SUMMARY_RESERVED_WIDTH`, keeps `Pill` and compact mode |
| `components/Layout.tsx` | Drops the bar. Adds the floating group slot and pane padding |
| `App.tsx` | New wiring: strip in the Ticket pane, hand and pill in the floating group |
| `components/Deck.tsx`, `ActionBar.tsx`, `RoundSummary.tsx` | Deleted once their parts have moved. `VoteChart` moves into `ResultsPill.tsx` |

Reuse, do not rewrite: `Pill` and `findOutliers` (Players), `VoteChart` (RoundSummary), the points
effect and storage helpers (ActionBar), `suggestPoints` (`lib/estimate.ts`), `readJson` and
`writeJson` (`storage.ts`).

## 6. Docs

- `docs/spec/08-decision-log.md`: a new entry (the next free number) for this redesign, citing
  the choices above. Mark decision 48 as replaced for the bar and the players row.
- `docs/spec/03-client.md`: replace the Players, RoundSummary, Deck and ActionBar sections with
  the strip, Hand, ResultsPill and RoundControls; update Layout, the accessibility checklist (the
  deck group, the sticky bar note) and the responsive rules (the 148px bar).

## 7. Verification

There are no tests in v1 (decision log), so:

1. The gate: `npm run format && npm run lint && npm run tsc:check && npm run build`.
2. `npm run dev`, two tabs with different `?devUser=` values, at 1200px and 1440px:
   - The hand peeks with no bar. Hover opens the arc and all 11 cards are on screen. A pick
     closes it. Your card is raised in the peek and in the other tab's pill as "voted".
   - Clicking your card again takes the vote back.
   - Keyboard only: Tab to the hand, ← →, Enter, Esc. After a vote, a second Enter reopens the
     arc and does not take the vote back.
   - Reveal from the strip. The pill shows the chart, stats and Points. Change your vote from the
     hand beside it, and the pill updates. Save shows the toast. Next clears the ticket.
   - Reset after the reveal starts a new round on the same ticket.
   - Drag the resize handle: the floating group stays centered on the Ticket column.
   - The last line of each pane scrolls clear of the peek and of the pill.
   - Compact mode gives the same answer while voting and after the reveal.
3. At 375px wide with touch emulation: tap opens, tap votes, tap outside closes, and the arc
   fits with no horizontal scroll.
4. With reduced motion on: no animation.
