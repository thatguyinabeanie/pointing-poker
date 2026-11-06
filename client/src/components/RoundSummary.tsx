import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import { alpha } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import { DECK, isNumericCard } from "../../../shared/deck.ts";
import type { Phase, Snapshot } from "../../../shared/protocol.ts";

interface Props {
  phase: Phase;
  stats: Snapshot["stats"];
}

const BAR_WIDTH = 16;
const BAR_MAX_HEIGHT = 18;

// The results after the reveal, and nothing in the other phases. The vote count moved to the
// players strip's round controls.
export function RoundSummary({ phase, stats }: Props) {
  if (phase !== "revealed" || stats === null) return null;

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

  // Below lg the summary has its own line and the bar's height is auto, so the chart, the Avg
  // and Median text and the chip wrap instead of pushing the page into a horizontal scroll at
  // a 320px viewport. At lg it stays one row, sized to fit the fixed-height players row.
  return (
    <Stack
      direction="row"
      useFlexGap
      spacing={1.5}
      sx={{
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
        flexWrap: { xs: "wrap", lg: "nowrap" },
        rowGap: 0.5,
        whiteSpace: "nowrap",
      }}
    >
      <VoteChart counts={stats.counts} />
      <Typography variant="body2">
        Avg <strong>{stats.average ?? "–"}</strong> · Median <strong>{stats.median ?? "–"}</strong>
      </Typography>
      {chip}
    </Stack>
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
