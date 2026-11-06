import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import type {
  CSSProperties,
  FocusEvent,
  KeyboardEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CARD_HEIGHT, CARD_WIDTH, cardPose, fitStep, openLift } from "../lib/handLayout.ts";

interface Props {
  deck: readonly string[];
  selected: string | null;
  disabled: boolean;
  onSelect: (card: string) => void;
  onClear: () => void;
}

// Values from the approved playtest (docs/spec/mocks/hand-of-cards-playtest.html).
const PEEK = 30; // px of the fan above the bottom edge at rest
const SELECTED_RAISE = 18; // your vote stands out in the peek
const OPEN_SELECTED_RAISE = 8;
const HOVER_LIFT = 12;
const STAGGER_MS = 10;
const ROOT_WIDTH = 120;
// Tall enough for the raised card, so the panes' bottom padding clears the whole peek.
const ROOT_HEIGHT = PEEK + SELECTED_RAISE;
// The mock's open hover zone reached 390px each side of the center at the full 52px step.
const ZONE_SIDE_MARGIN = 130;
// The arc rises from the cards' rest position, whose bottom edge is this far below the window.
const REST_BOTTOM = PEEK - CARD_HEIGHT;
// The arc is centered on the hand, which is not centered on the window once the pill sits beside
// it. So the room is twice the distance to the nearer window edge, minus 16px on each side (spec:
// narrow screens). The root is measured, never the cards, so the open transforms cannot feed back.
function availableWidth(root: HTMLElement | null): number {
  if (!root) return window.innerWidth - 32;
  const rect = root.getBoundingClientRect();
  const center = rect.left + rect.width / 2;
  return 2 * Math.min(center, window.innerWidth - center) - 32;
}

const spoken = (card: string) => (card === "☕" ? "coffee break" : card);

type PickSource = "mouse" | "touch" | "keyboard";

// Per-card values (pose, padding, delay) arrive as inline style and CSS variables, so this sx is
// built once. The hover pose lives in a variable because an inline transform would beat :hover.
const CARD_SX: SxProps<Theme> = (theme) => {
  // On top while lifted, so a narrowed arc's overlap does not hide the outline.
  const lifted = {
    transform: "var(--hover-pose)",
    transitionDelay: "0ms",
    zIndex: 3,
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: 2,
  };
  return {
    position: "absolute",
    left: "50%",
    bottom: REST_BOTTOM,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    marginLeft: `${-CARD_WIDTH / 2}px`,
    boxSizing: "border-box",
    display: "grid",
    placeItems: "start center",
    padding: "5px 0 0",
    border: `1px solid ${theme.palette.grey[400]}`,
    borderRadius: "6px",
    bgcolor: "background.paper",
    color: "text.primary",
    font: "inherit",
    fontWeight: 700,
    fontSize: 13,
    boxShadow: "0 2px 6px rgba(10, 33, 56, 0.18)",
    cursor: "pointer",
    userSelect: "none",
    transform: "var(--pose)",
    transition:
      "transform 300ms cubic-bezier(0.2, 0.8, 0.3, 1.15), font-size 200ms, padding 200ms, background-color 150ms",
    // The stagger deals the arc from the middle out. A variable, so the hover rule can drop it.
    transitionDelay: "var(--delay)",
    "&[aria-pressed='true']": {
      bgcolor: "primary.main",
      color: "primary.contrastText",
      borderColor: "primary.main",
      zIndex: 2,
    },
    "&:disabled": { cursor: "default" },
    "[data-hand-open='true'] &": { placeItems: "center", paddingTop: 0, fontSize: 18 },
    "[data-hand-open='true'] &:focus-visible": lifted,
    // Touch browsers keep :hover on the last tapped element, which left a card stuck lifted.
    "@media (hover: hover)": { "[data-hand-open='true'] &:hover": lifted },
    "@media (prefers-reduced-motion: reduce)": { transition: "none" },
  };
};

const HINT_SX: SxProps<Theme> = {
  position: "absolute",
  left: "50%",
  bottom: 4,
  transform: "translateX(-50%)",
  fontSize: 10,
  color: "text.secondary",
  whiteSpace: "nowrap",
  pointerEvents: "none",
  opacity: 0,
  transition: "opacity 200ms",
  "[data-hand-open='true'] > &": { opacity: 1 },
  "@media (prefers-reduced-motion: reduce)": { transition: "none" },
};

// The vote cards: a small fan peeking up from the bottom edge, dealt into an arc on hover or
// keyboard focus. Open and close rules are in spec section 2; the playtest mock shows the feel.
export function Hand({ deck, selected, disabled, onSelect, onClear }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpenState] = useState(false);
  // Event handlers read the latest value before React re-renders, so it is mirrored in a ref.
  const openRef = useRef(false);
  // Set by a pick or Esc so the hand stays closed with the mouse still over it (D4). Cleared when
  // the mouse leaves, focus leaves, or keyboard focus, a key or a tap reopens it.
  const suppressedRef = useRef(false);
  // A tap on the peek must open without voting, so a click needs the state from before the press.
  const pressRef = useRef({ type: "mouse", wasOpen: false });
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [step, setStep] = useState(() => fitStep(availableWidth(null), deck.length));

  // The card buttons in deck order, or -1 for anything else (the hover zone, the hint).
  const cards = useCallback(
    () => Array.from(rootRef.current?.querySelectorAll("button") ?? []),
    [],
  );
  const indexOf = useCallback(
    (target: EventTarget | null) => cards().indexOf(target as HTMLButtonElement),
    [cards],
  );

  const setOpen = useCallback((next: boolean) => {
    openRef.current = next;
    setOpenState(next);
  }, []);
  const reopen = useCallback(() => {
    if (disabled) return;
    suppressedRef.current = false;
    setOpen(true);
  }, [disabled, setOpen]);

  const measureStep = useCallback(
    () => setStep(fitStep(availableWidth(rootRef.current), deck.length)),
    [deck.length],
  );
  // The hand moves without a window resize when the pill appears or goes (the floating row changes
  // size), for example a reveal from another tab while the arc is open. Layout re-centers the
  // group from its own observer, so the measure waits a frame for that to land. A drag of the
  // Ticket column moves the hand too, but the arc is closed then and opening measures again.
  useEffect(() => {
    const row = rootRef.current?.parentElement;
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measureStep);
    };
    const observer = new ResizeObserver(later);
    if (row) observer.observe(row);
    window.addEventListener("resize", later);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", later);
    };
  }, [measureStep]);

  // Going idle or offline mid-pick must not leave the arc open to reappear later.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled, setOpen]);

  const isOpen = open && !disabled;

  // Measured again on opening, before paint, so the first frame of the arc already fits.
  useLayoutEffect(() => {
    if (isOpen) measureStep();
  }, [isOpen, measureStep]);

  // A mouse leaving the hover zone already closes the arc. Touch has no hover, so a tap anywhere
  // but a card closes it; for a mouse the hover zone counts as part of the hand.
  useEffect(() => {
    if (!isOpen) return;
    const onDocumentPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root || !(e.target instanceof Element)) return;
      const inside =
        e.pointerType === "mouse"
          ? root.contains(e.target)
          : indexOf(e.target.closest("button")) >= 0;
      if (!inside) setOpen(false);
    };
    document.addEventListener("pointerdown", onDocumentPointerDown);
    return () => document.removeEventListener("pointerdown", onDocumentPointerDown);
  }, [isOpen, indexOf, setOpen]);

  const pick = useCallback(
    (index: number, source: PickSource) => {
      const card = deck[index];
      // Same toggle as the server: your current card again takes the vote back.
      if (card === selected) onClear();
      else onSelect(card);
      setOpen(false);
      // A click leaves focus on the card, and focus opens the arc, so a mouse pick lets go of it.
      // A keyboard pick keeps focus on the card (spec).
      const active = document.activeElement;
      if (
        source === "mouse" &&
        active instanceof HTMLElement &&
        rootRef.current?.contains(active)
      ) {
        active.blur();
      }
      // After the blur, because the blur's focusout clears the suppression.
      suppressedRef.current = true;
    },
    [deck, selected, onClear, onSelect, setOpen],
  );

  const onClick = useCallback(
    (e: MouseEvent) => {
      const index = indexOf((e.target as Element).closest("button"));
      if (index < 0) return;
      // detail 0 is a click with no pointer: a screen reader activating "Vote 5". It always
      // picks, open or closed, or the activation would do nothing. This cannot break "a second
      // Enter never votes": Enter and Space never make this click, because onKeyDown cancels
      // Enter and onKeyUp cancels Space.
      if (e.detail === 0) {
        pick(index, "keyboard");
        return;
      }
      const press = pressRef.current;
      if (press.wasOpen) pick(index, press.type === "mouse" ? "mouse" : "touch");
      // A tap on the closed peek only opens it. A mouse click there means a pick just closed the
      // hand with the mouse still over it, so it stays closed until the mouse leaves (D4).
      else if (press.type !== "mouse") reopen();
    },
    [indexOf, pick, reopen],
  );

  // Runs on pointermove as well as pointerenter: a mouse resting on the disabled peek when a round
  // starts never enters again, so the first move opens it. A pick's suppression lasts until the
  // pointer leaves, so moving over the hand after a pick still cannot reopen it (D4).
  const onHover = useCallback(
    (e: ReactPointerEvent) => {
      if (e.pointerType !== "mouse" || disabled) return;
      if (!suppressedRef.current && !openRef.current) setOpen(true);
    },
    [disabled, setOpen],
  );
  const onPointerLeave = useCallback(
    (e: ReactPointerEvent) => {
      if (e.pointerType !== "mouse") return;
      suppressedRef.current = false;
      // As in the mock: a keyboard user's arc stays open when the mouse happens to pass over it.
      if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
    },
    [setOpen],
  );
  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    pressRef.current = { type: e.pointerType, wasOpen: openRef.current };
  }, []);

  const onFocus = useCallback(
    (e: FocusEvent) => {
      const index = indexOf(e.target);
      if (index >= 0) setFocusIndex(index);
      if (disabled) return;
      // Keyboard focus reopens even after a pick (spec). Focus from a click on the peek must not,
      // or clicking right after a pick would undo D4; the browser's focus-visible rule tells the
      // two apart.
      if (e.target instanceof HTMLElement && e.target.matches(":focus-visible")) reopen();
      else if (!suppressedRef.current) setOpen(true);
    },
    [indexOf, disabled, reopen, setOpen],
  );
  const onBlur = useCallback(
    (e: FocusEvent) => {
      if (rootRef.current?.contains(e.relatedTarget as Node | null)) return;
      setFocusIndex(null);
      suppressedRef.current = false;
      setOpen(false);
    },
    [setOpen],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const index = indexOf(e.target);
      if (index < 0) return;
      const isArrow = e.key === "ArrowLeft" || e.key === "ArrowRight";
      const isActivate = e.key === "Enter" || e.key === " ";
      // A held Enter would pick, reopen, then pick again and take the vote back.
      if (isActivate && e.repeat) {
        e.preventDefault();
        return;
      }
      if (!openRef.current) {
        // Closed: these keys only reopen, so a second Enter after a vote cannot take it back.
        if (isArrow || isActivate) {
          e.preventDefault();
          reopen();
        }
        return;
      }
      if (isArrow) {
        e.preventDefault();
        const next = index + (e.key === "ArrowRight" ? 1 : -1);
        cards()[Math.max(0, Math.min(deck.length - 1, next))]?.focus();
      } else if (isActivate) {
        e.preventDefault();
        pick(index, "keyboard");
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        suppressedRef.current = true;
      }
    },
    [indexOf, cards, deck.length, pick, reopen, setOpen],
  );
  // A button clicks itself on Space keyup; onKeyDown already handled Space.
  const onKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.key === " ") e.preventDefault();
  }, []);

  const middle = (deck.length - 1) / 2;
  const selectedIndex = selected === null ? -1 : deck.indexOf(selected);
  // One tab stop: the card with focus, else your vote, else the middle card (5).
  const tabStop = focusIndex ?? (selectedIndex >= 0 ? selectedIndex : Math.floor(middle));
  const rise = openLift(deck.length, step) - REST_BOTTOM;
  // The zone grows with the arc so moving up from the peek to an end card never leaves it.
  const zoneSide = isOpen ? ROOT_WIDTH / 2 - (middle * step + ZONE_SIDE_MARGIN) : -20;
  const zoneHeight = isOpen ? openLift(deck.length, step) + CARD_HEIGHT + 60 : ROOT_HEIGHT;
  // When the arc narrows, the next card covers the right of each card; center the value in the
  // part that still shows.
  const coveredRight = isOpen ? Math.max(0, CARD_WIDTH - step) : 0;

  return (
    <Box
      ref={rootRef}
      role="toolbar"
      aria-label={
        selected === null ? "Your cards, no vote" : `Your cards, current vote ${spoken(selected)}`
      }
      data-hand-open={isOpen ? "true" : "false"}
      onClick={onClick}
      onPointerEnter={onHover}
      onPointerMove={onHover}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      style={
        { "--zone-side": `${zoneSide}px`, "--zone-height": `${zoneHeight}px` } as CSSProperties
      }
      sx={{
        position: "relative",
        width: ROOT_WIDTH,
        height: ROOT_HEIGHT,
        flex: "none",
        // Above the faded pill, which is later in the DOM and gets its own stacking context from
        // its opacity, so it would otherwise veil the open arc's right-end cards.
        zIndex: 1,
        opacity: disabled ? 0.5 : 1,
        "&::before": {
          content: '""',
          position: "absolute",
          left: "var(--zone-side)",
          right: "var(--zone-side)",
          bottom: 0,
          height: "var(--zone-height)",
        },
      }}
    >
      {deck.map((card, index) => {
        const offset = index - middle;
        const isSelected = index === selectedIndex;
        const pose = cardPose(offset, isOpen, step);
        const raise = isSelected ? (isOpen ? OPEN_SELECTED_RAISE : SELECTED_RAISE) : 0;
        const at = (up: number) =>
          `translate(${pose.x}px, ${pose.y - up}px) rotate(${pose.rotate}deg)`;
        return (
          <Box
            key={card}
            component="button"
            type="button"
            aria-label={`Vote ${spoken(card)}`}
            aria-pressed={isSelected}
            tabIndex={index === tabStop ? 0 : -1}
            disabled={disabled}
            style={
              {
                "--pose": at((isOpen ? rise : 0) + raise),
                "--hover-pose": at(rise + HOVER_LIFT),
                "--delay": `${Math.abs(offset) * STAGGER_MS}ms`,
                paddingRight: coveredRight,
              } as CSSProperties
            }
            sx={CARD_SX}
          >
            {card}
          </Box>
        );
      })}
      <Box component="span" aria-hidden sx={HINT_SX}>
        ← → to move · Enter to vote · Esc to close
      </Box>
    </Box>
  );
}
