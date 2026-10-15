import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import { useEffect, useId, useState } from "react";
import { isNumericCard } from "../../../shared/deck.ts";
import type { JiraSave, Phase, Snapshot, Ticket } from "../../../shared/protocol.ts";
import { suggestPoints } from "../lib/estimate.ts";

interface Props {
  phase: Phase;
  stats: Snapshot["stats"];
  ticket: Ticket | null;
  deck: readonly string[];
  disabled: boolean;
  jiraSave: JiraSave;
  onReveal: () => void;
  onReset: (opts: { clearTicket: boolean }) => void;
  onSave: (points: number) => void;
}

const RESET_LABEL: Record<Phase, string> = {
  idle: "Start round",
  voting: "Reset",
  revealed: "Next ticket",
};

export function ActionBar({
  phase,
  stats,
  ticket,
  deck,
  disabled,
  jiraSave,
  onReveal,
  onReset,
  onSave,
}: Props) {
  const labelId = useId();
  const [points, setPoints] = useState<string>("");

  // Re-suggest on a new reveal or ticket, so a new reveal never keeps a stale pick.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deck is stable; stats is omitted so a manual pick survives later snapshots
  useEffect(() => {
    setPoints(suggestPoints(stats, deck) ?? "");
  }, [phase, ticket?.key]);

  const saving = jiraSave.status === "saving";
  const canSave = phase === "revealed" && ticket !== null && points !== "" && !saving;
  const numericDeck = deck.filter(isNumericCard);

  const resetButton = (
    <Button
      variant="outlined"
      disabled={disabled}
      onClick={() => onReset({ clearTicket: phase === "revealed" })}
    >
      {RESET_LABEL[phase]}
    </Button>
  );

  // One row, controls chosen by phase: voting shows Reveal and Reset; revealed shows the
  // points select, Save and Next ticket; idle shows Start round. Stats live in ParticipantChips.
  return (
    <Stack direction="row" useFlexGap spacing={1} sx={{ alignItems: "center" }}>
      {phase === "voting" && (
        <Button variant="contained" disabled={disabled} onClick={onReveal}>
          Reveal
        </Button>
      )}
      {phase === "revealed" && (
        <>
          <FormControl size="small" sx={{ minWidth: 140 }} disabled={disabled}>
            <InputLabel id={labelId}>Story points</InputLabel>
            <Select
              labelId={labelId}
              label="Story points"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
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
            disabled={disabled || !canSave}
            onClick={() => onSave(Number(points))}
            startIcon={saving ? <CircularProgress size={16} /> : undefined}
          >
            Save to Jira
          </Button>
        </>
      )}
      {resetButton}
      {jiraSave.status === "saved" && (
        <Alert severity="success" sx={{ py: 0, maxWidth: 260 }}>
          Saved {jiraSave.points} pts by {jiraSave.by}
        </Alert>
      )}
      {jiraSave.status === "error" && (
        <Alert severity="error" sx={{ py: 0, maxWidth: 260 }}>
          {jiraSave.message}
        </Alert>
      )}
    </Stack>
  );
}
