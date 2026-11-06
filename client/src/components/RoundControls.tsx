import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { useCallback } from "react";
import type { Phase } from "../../../shared/protocol.ts";

interface Props {
  phase: Phase;
  votedCount: number;
  connectedCount: number;
  disabled: boolean;
  // The results and their controls (App's RoundResults), shown only in the revealed phase. A slot,
  // so the strip does not have to carry the stats, the ticket and the save state through.
  results: ReactNode;
  onReveal: () => void;
  onReset: (opts: { clearTicket: boolean }) => void;
}

// The round's own controls, at the right end of the players strip: the vote count (or, after the
// reveal, the results) and the buttons that move the round along. Reset keeps the ticket, so it
// replays the same ticket; only Next clears it, and Next is in the results.
// Reveal stays enabled with zero votes: that is how the room behaved before the strip.
//
// One row at lg, where the strip has a fixed height. Below lg it wraps, so the revealed row (about
// 650px) stays on screen at a phone's width instead of pushing the page into a horizontal scroll,
// and Reset wraps along with the results rather than on a line of its own.
export function RoundControls({
  phase,
  votedCount,
  connectedCount,
  disabled,
  results,
  onReveal,
  onReset,
}: Props) {
  const keepTicket = useCallback(() => onReset({ clearTicket: false }), [onReset]);
  return (
    <Stack
      direction="row"
      useFlexGap
      spacing={1}
      sx={{
        alignItems: "center",
        justifyContent: "flex-end",
        flexWrap: { xs: "wrap", lg: "nowrap" },
        flexShrink: { xs: 1, lg: 0 },
        minWidth: 0,
      }}
    >
      {phase === "voting" && (
        <Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>
          {votedCount} of {connectedCount} voted
        </Typography>
      )}
      {phase === "revealed" && results}
      {phase === "voting" && (
        <Button variant="contained" size="small" disabled={disabled} onClick={onReveal}>
          Reveal
        </Button>
      )}
      <Button variant="outlined" size="small" disabled={disabled} onClick={keepTicket}>
        {phase === "idle" ? "Start round" : "Reset"}
      </Button>
    </Stack>
  );
}
