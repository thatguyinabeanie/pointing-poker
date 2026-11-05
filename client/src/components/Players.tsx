import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import { alpha, type Theme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useLayoutEffect, useRef, useState } from "react";
import { isNumericCard } from "../../../shared/deck.ts";
import type { Phase, PlayerView, Snapshot } from "../../../shared/protocol.ts";
import { initials } from "../lib/initials.ts";
import { RoundSummary } from "./RoundSummary.tsx";

interface Props {
  players: PlayerView[];
  phase: Phase;
  meId: number | null;
  stats: Snapshot["stats"];
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

// The space between the pills and the summary at lg, in px, so the compact-mode math and the
// rendered space cannot disagree. It is the right cell's left padding, not a grid column gap:
// a column gap would also sit between the empty left cell and the pills, so pills shifted all
// the way left would still lose 16px at the row's left edge.
const COLUMN_GAP = 16;

// The summary width reserved at lg, whatever the phase. While voting the summary is a short
// "N of M voted", so measuring only the real summary let 7 players at 1440px show names while
// voting and drop them at the reveal, when the chart widened it. The user chose (11/05/2026)
// that compact mode must not depend on the phase. A typical revealed summary (bars for 5
// distinct cards 2, 3, 5, 8, 13, "Avg 6.2 · Median 5", a "Spread 2–13" chip) measured 366.9px
// in Chrome at a 1440px layout (PR follow-up, 11/05/2026); this rounds it up to the next 10px.
// It is the CSS min-width of the summary's box, so a wider real summary counts at its real
// width, and the grid's right column can never get narrower than it.
const SUMMARY_RESERVED_WIDTH = 370;

// The players row, the top tier of the bottom bar. At lg it uses the deck row's 1fr auto 1fr
// grid, so the pills sit centered over the deck, with the round summary (vote count or results)
// in the right cell. A fixed height there, so the bar never grows. Below lg the pills and the
// summary stack, centered.
// The reserve is kept on the right only (the user's decision, 11/05/2026): reserving it on
// both sides kept only about 5 names at a 1440px layout. Because the right 1fr column cannot
// shrink below the reserve plus the gap, the grid itself keeps the pills exactly centered while
// both 1fr columns can be that wide, and once they cannot, the left column gives up the
// difference, so the pills shift left only as far as needed and never cover the summary.
export function Players({ players, phase, meId, stats }: Props) {
  const revealed = phase === "revealed";
  const outliers = findOutliers(players, revealed);
  const connected = players.filter((p) => p.connected);
  const votedCount = connected.filter((p) => p.hasVoted).length;

  // noSsr: there is no server rendering, and the default first-render false would run the
  // compact check once with the stacked layout's rule at lg.
  const isLg = useMediaQuery((t: Theme) => t.breakpoints.up("lg"), { noSsr: true });
  const rowRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLUListElement>(null);
  const [compact, setCompact] = useState(false);

  // Compact mode measures the hidden copy, which always shows the names, and never the visible
  // list. Measuring the visible list would loop: dropping the names makes the pills fit, which
  // would bring the names back, which would make them overflow again.
  // At lg the names fit while the pills fit left of the summary's reserve and the gap; the grid
  // decides whether they sit centered or shifted left (see the component comment). The reserve
  // box is at least SUMMARY_RESERVED_WIDTH wide, so the answer is the same while voting and
  // after the reveal.
  // Below lg the summary sits on its own line, so the pills get the whole row.
  // The row, the summary and the hidden copy are all observed, so a reveal (wider summary), a
  // join, a leave or a long new name re-checks even when the window width is unchanged.
  // Layout effect so the first paint is already in the right mode.
  useLayoutEffect(() => {
    const row = rowRef.current;
    const summary = summaryRef.current;
    const measure = measureRef.current;
    if (!row || !summary || !measure) return;
    const check = () => {
      // getBoundingClientRect, not offsetWidth: a fractional summary width rounded down could
      // let the names through by a fraction of a pixel and clip the last pill.
      const available = isLg
        ? row.clientWidth - summary.getBoundingClientRect().width - COLUMN_GAP
        : row.clientWidth;
      setCompact(measure.scrollWidth > available);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(row);
    observer.observe(summary);
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
        position: "relative",
        display: "grid",
        gridTemplateColumns: { xs: "1fr", lg: "1fr auto 1fr" },
        justifyItems: { xs: "center", lg: "stretch" },
        alignItems: "center",
        rowGap: 0.5,
        height: { lg: 44 },
        minHeight: 44,
        pb: 1,
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      {/* Empty left cell, the twin of the deck row's, so the center column lines up. */}
      <Box sx={{ display: { xs: "none", lg: "block" } }} />
      <Box
        component="ul"
        aria-label="Participants"
        sx={{
          ...PILL_LIST_SX,
          // "safe" falls back to start alignment if the pills ever overflow, so the overflow is
          // clipped on the right and the first pills are never pushed out of reach on the left.
          justifyContent: "safe center",
          // Stretch to the row's height so the overflow clip does not cut the avatar ring.
          alignSelf: "stretch",
          minWidth: 0,
          maxWidth: "100%",
          // Below lg the bar's height is auto, so the pills wrap onto more lines instead of
          // being clipped: compact mode only drops the names, and non-shrinking pills can still
          // be wider than a phone, which hid the trailing players and their votes. Only the
          // fixed-height row at lg clips.
          flexWrap: { xs: "wrap", lg: "nowrap" },
          overflow: { lg: "hidden" },
        }}
      >
        {pills(compact)}
      </Box>
      {/* The cell keeps its automatic min-width, so the 1fr column's minimum is its content:
          the gap plus the reserve box. The reserve box is at least SUMMARY_RESERVED_WIDTH wide
          at lg and grows with a wider summary, which stays at the right edge. Both are blocks
          below lg: as flex containers they kept the summary (flexShrink 0) from wrapping, and
          it scrolled a 360px page sideways. */}
      <Box
        sx={{
          display: { xs: "block", lg: "flex" },
          justifyContent: { lg: "flex-end" },
          pl: { lg: `${COLUMN_GAP}px` },
        }}
      >
        <Box
          ref={summaryRef}
          sx={{
            display: { xs: "block", lg: "flex" },
            justifyContent: { lg: "flex-end" },
            minWidth: { lg: SUMMARY_RESERVED_WIDTH },
          }}
        >
          <RoundSummary
            phase={phase}
            stats={stats}
            votedCount={votedCount}
            connectedCount={connected.length}
          />
        </Box>
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
function shortName(username: string): string {
  return username.trim().split(/\s+/)[0] || username;
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
