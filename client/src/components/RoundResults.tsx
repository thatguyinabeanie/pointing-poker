import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import { alpha, type Theme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { type HTMLAttributes, useCallback, useId } from "react";
import { DECK, isNumericCard } from "../../../shared/deck.ts";
import type { JiraSave, Snapshot, Ticket } from "../../../shared/protocol.ts";
import { usePointsPick } from "../usePointsPick.ts";

interface Props {
  round: number;
  stats: Snapshot["stats"];
  ticket: Ticket | null;
  deck: readonly string[];
  disabled: boolean;
  jiraSave: JiraSave;
  onSave: (points: number) => void;
  onNext: () => void;
}

const BAR_WIDTH = 16;
const BAR_GAP = 4;
const BAR_MAX_HEIGHT = 18;
// The chart's width budget at lg: the three-bar chart's natural width (3 × 16 + 2 × 4 = 56px),
// the chart CONTROLS_RESERVED_WIDTH was measured with. See chartGeometry.
const CHART_MAX_WIDTH = 3 * BAR_WIDTH + 2 * BAR_GAP;
// The narrowest bar that still fits its 10px value underneath: "0.5" and ☕ are about 12px wide.
const MIN_LABELED_BAR_WIDTH = 12;

// The Points select's input is 32px tall instead of the small size's 40px, so it fits the 52px
// strip with room for the floating label above it. 23px of text (16px at line-height 1.4375em)
// plus 4.5px top and bottom. Two classes in the selector beat the input's own one-class padding.
const COMPACT_SELECT_SX = {
  "& .MuiSelect-select": { paddingTop: "4.5px", paddingBottom: "4.5px" },
} as const;

// Module scope so the Select gets one object across renders.
const POINTS_DISPLAY_PROPS: HTMLAttributes<HTMLDivElement> & { "data-round-focus": string } = {
  "data-round-focus": "points",
};

// The results after the reveal, with the controls that act on them: the points select, Save and
// Next. They sit in the players strip (user ruling, 11/06/2026: the floating pill "would be better
// if it was on the same bar as the names with point cards"), so this renders a fragment and
// RoundControls lays the items out in its own row, with Reset after Next. One row means Reset
// wraps along with the rest below lg. RoundControls renders it only in the revealed phase, and it
// returns nothing without stats.
export function RoundResults({
  round,
  stats,
  ticket,
  deck,
  disabled,
  jiraSave,
  onSave,
  onNext,
}: Props) {
  const labelId = useId();
  const { points, setManualPoints } = usePointsPick({
    round,
    ticketKey: ticket?.key ?? null,
    stats,
    deck,
  });
  const onPointsChange = useCallback(
    (e: { target: { value: string } }) => setManualPoints(e.target.value),
    [setManualPoints],
  );
  const onSaveClick = useCallback(() => onSave(Number(points)), [onSave, points]);

  if (stats === null) return null;

  const saving = jiraSave.status === "saving";
  const canSave = ticket !== null && points !== "" && !saving;
  const numericDeck = deck.filter(isNumericCard);

  const chip = stats.consensus ? (
    <Chip size="small" variant="outlined" color="success" label="Consensus" />
  ) : stats.min !== null ? (
    <Chip
      size="small"
      variant="outlined"
      color="warning"
      label={`Spread ${stats.min}–${stats.max}`}
    />
  ) : (
    <Chip size="small" variant="outlined" label="No numeric votes" />
  );

  return (
    <>
      <VoteChart counts={stats.counts} />
      <Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>
        Avg <strong>{stats.average ?? "–"}</strong> · Median <strong>{stats.median ?? "–"}</strong>
      </Typography>
      {chip}
      <FormControl size="small" sx={{ minWidth: 96 }} disabled={disabled}>
        {/* Always shrunk, with the outline always notched: unshrunk, the label is placed for a
            40px input and would sit low in the 32px one when there is no suggestion. */}
        <InputLabel id={labelId} shrink>
          Points
        </InputLabel>
        <Select
          labelId={labelId}
          label="Points"
          notched
          value={points}
          onChange={onPointsChange}
          // RoundControls moves focus here after a focused Reveal (see RoundControls).
          SelectDisplayProps={POINTS_DISPLAY_PROPS}
          sx={COMPACT_SELECT_SX}
        >
          {numericDeck.map((card) => (
            <MenuItem key={card} value={card}>
              {card}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Button
        variant="contained"
        size="small"
        // The visible text is short to fit the strip; the accessible name keeps the target.
        aria-label="Save to Jira"
        // RoundControls moves focus here after a focused Reveal when Points cannot take it.
        data-round-focus="save"
        disabled={disabled || !canSave}
        onClick={onSaveClick}
        startIcon={saving ? <CircularProgress size={16} /> : undefined}
      >
        Save
      </Button>
      {/* data-round-step lets RoundControls see, at click time, that this button had focus, so
          it can put focus back on the strip when the results unmount (see RoundControls). */}
      <Button
        variant="outlined"
        size="small"
        data-round-step="next"
        disabled={disabled}
        onClick={onNext}
      >
        Next
      </Button>
    </>
  );
}

// The bar widths and gap for `bars` bars. Below lg the strip wraps, so the chart keeps its natural
// 16px bars. At lg the strip is one fixed row and CONTROLS_RESERVED_WIDTH was measured with a
// three-bar chart, so the chart never gets wider than that: one 16px bar per distinct vote grew
// without limit (up to 11 with ☕ and ?), and at about five values the controls passed the reserve,
// the names switched at the reveal and the pills clipped at 1200px (final review, 11/06/2026).
// Past three bars the gap drops to 2px so the bars lose less of the budget to gaps.
function chartGeometry(bars: number, capped: boolean): { bar: number; gap: number } {
  if (!capped || bars <= 3) return { bar: BAR_WIDTH, gap: BAR_GAP };
  const gap = 2;
  return { bar: (CHART_MAX_WIDTH - (bars - 1) * gap) / bars, gap };
}

function VoteChart({ counts }: { counts: Record<string, number> }) {
  // noSsr, as in Players: there is no server rendering, and the default first-render false would
  // draw the uncapped chart for one frame at lg.
  const isLg = useMediaQuery((t: Theme) => t.breakpoints.up("lg"), { noSsr: true });
  // Object.entries puts integer-like keys ("1", "3") before "0.5" and "?", so the bars would
  // not follow the deck. Walk the deck instead and keep the cards that were actually voted.
  const cards = DECK.filter((card) => card in counts);
  if (cards.length === 0) return null;
  const maxCount = Math.max(...cards.map((card) => counts[card]));
  const label = cards
    .map((card) => `${card}: ${counts[card]} ${counts[card] === 1 ? "vote" : "votes"}`)
    .join(", ");
  const { bar, gap } = chartGeometry(cards.length, isLg);
  // A value under a bar narrower than the widest label ("0.5", ☕) would run into its neighbors,
  // so the labels go and the title gives a mouse user the same text the aria-label gives a screen
  // reader. With the labels shown there is no title, so a screen reader does not hear it twice.
  const showValues = bar >= MIN_LABELED_BAR_WIDTH;
  return (
    <Box
      role="img"
      aria-label={label}
      title={showValues ? undefined : label}
      sx={{ display: "flex", alignItems: "flex-end", gap: `${gap}px`, flexShrink: 0 }}
    >
      {cards.map((card) => (
        <Box
          key={card}
          sx={{ display: "flex", flexDirection: "column", alignItems: "center", width: bar }}
        >
          <Box
            sx={{
              width: bar,
              height: (counts[card] / maxCount) * BAR_MAX_HEIGHT,
              borderRadius: "2px 2px 0 0",
              bgcolor: isNumericCard(card)
                ? (t) => alpha(t.palette.primary.main, 0.4)
                : "text.disabled",
            }}
          />
          {showValues ? (
            <Typography
              component="span"
              sx={{ fontSize: 10, lineHeight: "12px", color: "text.secondary" }}
            >
              {card}
            </Typography>
          ) : null}
        </Box>
      ))}
    </Box>
  );
}
