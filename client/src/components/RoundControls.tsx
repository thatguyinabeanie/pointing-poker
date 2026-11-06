import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Phase } from "../../../shared/protocol.ts";

interface Props {
  phase: Phase;
  votedCount: number;
  connectedCount: number;
  disabled: boolean;
  onReveal: () => void;
  onReset: (opts: { clearTicket: boolean }) => void;
}

// The round's own controls, at the right end of the players strip: the vote count (or
// "Revealed") and the buttons that move the round along. Reset keeps the ticket, so it
// replays the same ticket; only Next, in the results pill, clears it.
// Reveal stays enabled with zero votes: that is how the room behaved before the strip.
export function RoundControls({
  phase,
  votedCount,
  connectedCount,
  disabled,
  onReveal,
  onReset,
}: Props) {
  const keepTicket = () => onReset({ clearTicket: false });
  return (
    <Stack
      direction="row"
      useFlexGap
      spacing={1}
      sx={{ alignItems: "center", justifyContent: "flex-end", flexShrink: 0 }}
    >
      {phase === "voting" && (
        <Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>
          {votedCount} of {connectedCount} voted
        </Typography>
      )}
      {phase === "revealed" && <Typography variant="body2">Revealed</Typography>}
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
