import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import { alpha } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { useCallback, useId } from "react";
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
const BAR_MAX_HEIGHT = 18;

// The Points select's input is 32px tall instead of the small size's 40px, so it fits the 52px
// strip with room for the floating label above it. 23px of text (16px at line-height 1.4375em)
// plus 4.5px top and bottom. Two classes in the selector beat the input's own one-class padding.
const COMPACT_SELECT_SX = {
  "& .MuiSelect-select": { paddingTop: "4.5px", paddingBottom: "4.5px" },
} as const;

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
        disabled={disabled || !canSave}
        onClick={onSaveClick}
        startIcon={saving ? <CircularProgress size={16} /> : undefined}
      >
        Save
      </Button>
      <Button variant="outlined" size="small" disabled={disabled} onClick={onNext}>
        Next
      </Button>
    </>
  );
}

function VoteChart({ counts }: { counts: Record<string, number> }) {
  // Object.entries puts integer-like keys ("1", "3") before "0.5" and "?", so the bars would
  // not follow the deck. Walk the deck instead and keep the cards that were actually voted.
  const cards = DECK.filter((card) => card in counts);
  if (cards.length === 0) return null;
  const maxCount = Math.max(...cards.map((card) => counts[card]));
  const label = cards
    .map((card) => `${card}: ${counts[card]} ${counts[card] === 1 ? "vote" : "votes"}`)
    .join(", ");
  return (
    <Box role="img" aria-label={label} sx={{ display: "flex", alignItems: "flex-end", gap: "4px" }}>
      {cards.map((card) => (
        <Box
          key={card}
          sx={{ display: "flex", flexDirection: "column", alignItems: "center", width: BAR_WIDTH }}
        >
          <Box
            sx={{
              width: BAR_WIDTH,
              height: (counts[card] / maxCount) * BAR_MAX_HEIGHT,
              borderRadius: "2px 2px 0 0",
              bgcolor: isNumericCard(card)
                ? (t) => alpha(t.palette.primary.main, 0.4)
                : "text.disabled",
            }}
          />
          <Typography
            component="span"
            sx={{ fontSize: 10, lineHeight: "12px", color: "text.secondary" }}
          >
            {card}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
