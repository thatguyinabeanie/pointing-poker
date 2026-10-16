import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import { useCallback, useEffect, useId, useState } from "react";
import { isNumericCard } from "../../../shared/deck.ts";
import type { JiraSave, Phase, Snapshot, Ticket } from "../../../shared/protocol.ts";
import { suggestPoints } from "../lib/estimate.ts";
import { readJson, removeItem, writeJson } from "../storage.ts";

// sessionStorage (per tab), so a refresh keeps the pick but two tabs never overwrite each other.
const PICK_KEY = "pp.points.pick";

type StoredPick = { ticketKey: string; round: number; points: string };

function readPick(): StoredPick | null {
  return readJson("session", PICK_KEY, (v) => {
    if (typeof v !== "object" || v === null) return null;
    const { ticketKey, round, points } = v as Record<string, unknown>;
    return typeof ticketKey === "string" && typeof round === "number" && typeof points === "string"
      ? { ticketKey, round, points }
      : null;
  });
}

interface Props {
  phase: Phase;
  round: number;
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
  round,
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
  const ticketKey = ticket?.key ?? null;

  // Re-suggest on a new reveal, ticket or round, so a new reveal never keeps a stale pick. The
  // one exception is a refresh mid-reveal: a manual pick stored for this exact ticket and round
  // is restored. Any other stored pick is stale and is dropped.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deck is stable; stats is omitted so a manual pick survives later snapshots
  useEffect(() => {
    const stored = readPick();
    if (
      stored !== null &&
      phase === "revealed" &&
      stored.ticketKey === ticketKey &&
      stored.round === round &&
      deck.includes(stored.points) &&
      isNumericCard(stored.points)
    ) {
      setPoints(stored.points);
      return;
    }
    removeItem("session", PICK_KEY);
    setPoints(suggestPoints(stats, deck) ?? "");
  }, [phase, ticketKey, round]);

  const saving = jiraSave.status === "saving";
  const canSave = phase === "revealed" && ticket !== null && points !== "" && !saving;
  const numericDeck = deck.filter(isNumericCard);

  const onResetClick = useCallback(
    () => onReset({ clearTicket: phase === "revealed" }),
    [onReset, phase],
  );
  // Only a manual pick is stored; the suggestion is recomputed from stats on restore anyway.
  const onPointsChange = useCallback(
    (e: { target: { value: string } }) => {
      setPoints(e.target.value);
      if (ticketKey !== null) {
        writeJson("session", PICK_KEY, { ticketKey, round, points: e.target.value });
      }
    },
    [ticketKey, round],
  );
  const onSaveClick = useCallback(() => onSave(Number(points)), [onSave, points]);

  const resetButton = (
    <Button variant="outlined" disabled={disabled} onClick={onResetClick}>
      {RESET_LABEL[phase]}
    </Button>
  );

  // One row, controls chosen by phase: voting shows Reveal and Reset; revealed shows the
  // points select, Save and Next ticket; idle shows Start round. Stats live in Players.
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
            <Select labelId={labelId} label="Story points" value={points} onChange={onPointsChange}>
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
            onClick={onSaveClick}
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
