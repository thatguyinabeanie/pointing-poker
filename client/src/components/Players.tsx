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

// The gap between the players row's three columns, in px, so the compact-mode math and the
// rendered gap cannot disagree.
const COLUMN_GAP = 16;

// The players row, the top tier of the bottom bar. At lg it uses the deck row's 1fr auto 1fr
// grid, so the pills sit centered over the deck, with the round summary (vote count or results)
// in the right cell. A fixed height there, so the bar never grows. Below lg the pills and the
// summary stack, centered.
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
  // At lg the summary's width is counted on both sides of the center cell. The two 1fr columns
  // are only equal while the pills leave room for a column as wide as the summary on the left,
  // so this keeps the pills centered on the deck instead of drifting left as the row fills.
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
      const available = isLg
        ? row.clientWidth - 2 * summary.getBoundingClientRect().width - 2 * COLUMN_GAP
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
        columnGap: `${COLUMN_GAP}px`,
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
          flexWrap: "nowrap",
          overflow: "hidden",
        }}
      >
        {pills(compact)}
      </Box>
      <Box ref={summaryRef} sx={{ justifySelf: { lg: "end" } }}>
        <RoundSummary
          phase={phase}
          stats={stats}
          votedCount={votedCount}
          connectedCount={connected.length}
        />
      </Box>
      <Box
        component="ul"
        ref={measureRef}
        aria-hidden
        sx={{
          ...PILL_LIST_SX,
          visibility: "hidden",
          position: "absolute",
          top: 0,
          left: 0,
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
  );
}

interface PillProps {
  player: PlayerView;
  isMe: boolean;
  revealed: boolean;
  outlier: Outlier | undefined;
  compact: boolean;
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
          {p.username}
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
