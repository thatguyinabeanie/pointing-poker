import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import { alpha, type Theme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useLayoutEffect, useRef, useState } from "react";
import { isNumericCard } from "../../../shared/deck.ts";
import type { Phase, PlayerView } from "../../../shared/protocol.ts";
import { initials } from "../lib/initials.ts";
import { RoundControls } from "./RoundControls.tsx";

interface Props {
  players: PlayerView[];
  phase: Phase;
  meId: number | null;
  disabled: boolean;
  onReveal: () => void;
  onReset: (opts: { clearTicket: boolean }) => void;
}

type Outlier = "highest" | "lowest";

// Highest and lowest numeric votes, only when at least two distinct values exist. Offline
// players who voted are included: the server's stats count their vote, so their tile must
// be able to explain the numbers.
// Gated on phase, not on p.vote: the UI must never leak a vote before reveal even if
// a buggy or stale snapshot carries one.
function findOutliers(players: PlayerView[], revealed: boolean): Map<number, Outlier> {
  const result = new Map<number, Outlier>();
  if (!revealed) return result;
  const numeric = players.flatMap((p) =>
    p.vote !== null && isNumericCard(p.vote) ? [{ id: p.userId, v: Number(p.vote) }] : [],
  );
  const values = numeric.map((n) => n.v);
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (numeric.length < 2 || max === min) return result;
  for (const n of numeric) {
    if (n.v === max) result.set(n.id, "highest");
    else if (n.v === min) result.set(n.id, "lowest");
  }
  return result;
}

// Shared by the visible list and its hidden measuring copy, so both lay the pills out the same
// way and the measurement matches what would render. The 2px side padding keeps the viewer's
// avatar ring (outlineOffset 2) from being clipped by the overflow on the first pill.
const PILL_LIST_SX = {
  display: "flex",
  alignItems: "center",
  gap: 1,
  listStyle: "none",
  m: 0,
  px: "2px",
  py: 0,
} as const;

// The gap between the pills and the controls at lg, in px, so the compact-mode math and the
// rendered space cannot disagree. It is the controls cell's left padding, not a flex gap: a gap
// would also apply when the pills are shifted all the way left and would not be reserved.
const COLUMN_GAP = 16;

// The controls width reserved at lg, whatever the phase, so compact mode does not depend on
// the phase: the voting controls ("N of M voted", Reveal, Reset) and the revealed ones
// ("Revealed", Reset) differ in width, and measuring only the current one would let names show
// in one phase and drop in the other. 280 is a starting guess; Task 4 of the hand-of-cards plan
// measures the voting layout in Chrome and corrects it. It is the CSS min-width of the
// controls cell, so a wider real layout counts at its real width.
const CONTROLS_RESERVED_WIDTH = 280;

// The players strip, at the top of the Ticket pane: the pills left-aligned, the round controls
// at the right. At lg it sticks to the top of the pane while the ticket scrolls under it, with
// a fixed height so it never grows. Below lg it is not sticky and wraps.
export function Players({ players, phase, meId, disabled, onReveal, onReset }: Props) {
  const revealed = phase === "revealed";
  const outliers = findOutliers(players, revealed);
  const connected = players.filter((p) => p.connected);
  const votedCount = connected.filter((p) => p.hasVoted).length;

  // noSsr: there is no server rendering, and the default first-render false would run the
  // compact check once with the stacked layout's rule at lg.
  const isLg = useMediaQuery((t: Theme) => t.breakpoints.up("lg"), { noSsr: true });
  const rowRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLUListElement>(null);
  const [compact, setCompact] = useState(false);

  // Compact mode measures the hidden copy, which always shows the names, and never the visible
  // list. Measuring the visible list would loop: dropping the names makes the pills fit, which
  // would bring the names back, which would make them overflow again.
  // At lg the names fit while the pills fit left of the controls' reserve and the gap. The
  // reserve is at least CONTROLS_RESERVED_WIDTH, so the answer is the same while voting and
  // after the reveal.
  // Below lg the controls wrap onto their own line, so the pills get the whole row.
  // The row, the controls and the hidden copy are all observed, so a reveal, a join, a leave or
  // a long new name re-checks even when the window width is unchanged.
  // Layout effect so the first paint is already in the right mode.
  useLayoutEffect(() => {
    const row = rowRef.current;
    const controls = controlsRef.current;
    const measure = measureRef.current;
    if (!row || !controls || !measure) return;
    const check = () => {
      // getBoundingClientRect, not offsetWidth: a fractional controls width rounded down could
      // let the names through by a fraction of a pixel and clip the last pill.
      const available = isLg
        ? row.clientWidth -
          Math.max(controls.getBoundingClientRect().width, CONTROLS_RESERVED_WIDTH) -
          COLUMN_GAP
        : row.clientWidth;
      setCompact(measure.scrollWidth > available);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(row);
    observer.observe(controls);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [isLg]);

  const pills = (isCompact: boolean) =>
    players.map((p) => (
      <Pill
        key={p.userId}
        player={p}
        isMe={p.userId === meId}
        revealed={revealed}
        outlier={outliers.get(p.userId)}
        compact={isCompact}
      />
    ));

  return (
    <Box
      ref={rowRef}
      sx={{
        // Relative below lg: the hidden measuring copy is positioned against the row.
        position: { xs: "relative", lg: "sticky" },
        top: { lg: 0 },
        // Above the ticket text that scrolls under the strip.
        zIndex: { lg: 1 },
        bgcolor: "background.paper",
        display: "flex",
        flexWrap: { xs: "wrap", lg: "nowrap" },
        alignItems: "center",
        columnGap: 2,
        rowGap: 0.5,
        height: { lg: 52 },
        minHeight: 52,
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      <Box
        component="ul"
        aria-label="Participants"
        sx={{
          ...PILL_LIST_SX,
          flex: "1 1 0",
          minWidth: 0,
          // Stretch to the row's height so the overflow clip does not cut the avatar ring.
          alignSelf: "stretch",
          // Below lg the strip's height is auto, so the pills wrap onto more lines instead of
          // being clipped: compact mode only drops the names, and non-shrinking pills can still
          // be wider than a phone, which hid the trailing players and their votes. Only the
          // fixed-height strip at lg clips.
          flexWrap: { xs: "wrap", lg: "nowrap" },
          flexBasis: { xs: "100%", lg: 0 },
          overflow: { lg: "hidden" },
        }}
      >
        {pills(compact)}
      </Box>
      {/* The cell's min-width reserves the room at lg, so the pills never get more than the row
          minus the reserve. It is a block below lg so the controls wrap rather than push the
          page into a horizontal scroll. */}
      <Box
        ref={controlsRef}
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          minWidth: { lg: CONTROLS_RESERVED_WIDTH },
          ml: { xs: "auto", lg: 0 },
          py: { xs: 0.5, lg: 0 },
        }}
      >
        <RoundControls
          phase={phase}
          votedCount={votedCount}
          connectedCount={connected.length}
          disabled={disabled}
          onReveal={onReveal}
          onReset={onReset}
        />
      </Box>
      {/* The clipping box keeps the max-content copy from widening the page: on its own, a
          copy wider than the window (12 or more players) added a horizontal scrollbar. */}
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
          visibility: "hidden",
        }}
      >
        <Box
          component="ul"
          ref={measureRef}
          sx={{
            ...PILL_LIST_SX,
            height: 0,
            overflow: "hidden",
            whiteSpace: "nowrap",
            // max-content so the copy is never squeezed to the row width, which would make
            // scrollWidth report the squeezed width instead of what the pills need.
            width: "max-content",
          }}
        >
          {pills(false)}
        </Box>
      </Box>
    </Box>
  );
}

interface PillProps {
  player: PlayerView;
  isMe: boolean;
  revealed: boolean;
  outlier: Outlier | undefined;
  compact: boolean;
}

// The pill shows the username's first word ("Ana" for "Ana Lima"), so more players keep their
// names before the row goes compact. The full username stays in the title and every aria-label.
// Trailing punctuation is stripped so "Lima, Ana" shows "Lima" rather than "Lima,". If nothing
// is left (a username like ", Ana" or ";"), the full username is shown.
function shortName(username: string): string {
  const first = username
    .trim()
    .split(/\s+/)[0]
    .replace(/[,.;:]+$/, "");
  return first || username;
}

function Pill({ player: p, isMe, revealed, outlier, compact }: PillProps) {
  const faceUp = revealed && p.vote !== null;
  // An offline player keeps the pill's dimming. Their card shows only face-up after reveal,
  // because the server counts their vote in the stats; before reveal a card would mean nothing.
  return (
    <Box
      component="li"
      title={compact ? p.username : undefined}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        // Pills never shrink: an overflowing row goes compact instead of squeezing the names.
        flexShrink: 0,
        p: "3px 8px 3px 3px",
        borderRadius: "16px",
        bgcolor: "action.hover",
        opacity: p.connected ? 1 : 0.35,
      }}
    >
      <Avatar
        role="img"
        aria-label={p.username}
        title={p.username}
        sx={{
          width: 26,
          height: 26,
          fontSize: 11,
          // Ring is an outline so the avatar keeps its size; the name is also bold, so
          // the viewer marker never relies on the ring alone.
          ...(isMe && { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 }),
        }}
      >
        {initials(p.username)}
      </Avatar>
      {compact ? null : (
        <Typography
          variant="caption"
          title={p.username}
          sx={{
            fontSize: 13,
            maxWidth: 96,
            flexShrink: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: isMe ? 700 : 400,
          }}
        >
          {shortName(p.username)}
        </Typography>
      )}
      {p.connected || faceUp ? (
        <Card
          name={p.username}
          faceUp={faceUp}
          vote={p.vote}
          voted={p.hasVoted}
          outlier={outlier}
        />
      ) : null}
    </Box>
  );
}

interface CardProps {
  name: string;
  faceUp: boolean;
  vote: string | null;
  voted: boolean;
  outlier: Outlier | undefined;
}

function Card({ name, faceUp, vote, voted, outlier }: CardProps) {
  const label = outlier
    ? `${name} voted ${vote}, ${outlier}`
    : faceUp
      ? `${name} voted ${vote}`
      : voted
        ? `${name} has voted`
        : `${name} has not voted`;
  return (
    <Box
      role="img"
      aria-label={label}
      sx={[
        {
          flexShrink: 0,
          width: 18,
          height: 24,
          borderRadius: "3px",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1,
        },
        faceUp
          ? {
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: outlier ? "warning.main" : "divider",
              color: outlier ? "warning.main" : "text.primary",
              ...(outlier && { bgcolor: (t) => alpha(t.palette.warning.main, 0.12) }),
            }
          : voted
            ? {
                border: "1px solid",
                borderColor: "primary.main",
                backgroundImage: (t) =>
                  `repeating-linear-gradient(45deg, ${t.palette.primary.main} 0 2px, ${alpha(t.palette.primary.main, 0.55)} 2px 4px)`,
              }
            : { border: "1px dashed", borderColor: "text.disabled" },
      ]}
    >
      {faceUp ? vote : null}
    </Box>
  );
}
