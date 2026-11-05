import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import type { SxProps, Theme } from "@mui/material/styles";
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

// Module level so the sx is not rebuilt per render; the reasons are on the Stack below.
const ROW_SX: SxProps<Theme> = (theme) => ({
  alignItems: "center",
  flexWrap: { xs: "wrap", lg: "nowrap" },
  [theme.breakpoints.between("lg", "xl")]: { "& .MuiButton-root": { px: 1.5 } },
});

const RESET_LABEL: Record<Phase, string> = {
  idle: "Start round",
  voting: "Reset",
  revealed: "Next",
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
  const suggestion = suggestPoints(stats, deck);

  // Re-suggest on a new reveal, ticket or round, so a new reveal never keeps a stale pick. The
  // one exception is a refresh mid-reveal: a manual pick stored for this exact ticket and round
  // is restored. Any other stored pick is stale and is dropped.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deck is stable; stats is omitted (a new object every snapshot), but suggestion is in the list so a vote change after the reveal re-suggests, and a stored manual pick still wins
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
    setPoints(suggestion ?? "");
  }, [phase, ticketKey, round, suggestion]);

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
  // points select, Save and Next; idle shows Start round. Stats live in RoundSummary, in the
  // players row above. The labels are short so the revealed controls fit one row beside the
  // deck at laptop widths. Wraps so the select and buttons stay on screen below lg, where the
  // bar is not a wide grid cell. At lg it never wraps: a second line overflowed the fixed 148px
  // bar, so the deck makes room instead (see Deck). The deck change alone fits the revealed row
  // with the Save spinner at a 1200px layout with 0px to spare, so the buttons also take 12px
  // side padding between lg and xl to leave room for font differences.
  return (
    <Stack direction="row" useFlexGap spacing={1} sx={ROW_SX}>
      {phase === "voting" && (
        <Button variant="contained" disabled={disabled} onClick={onReveal}>
          Reveal
        </Button>
      )}
      {phase === "revealed" && (
        <>
          <FormControl size="small" sx={{ minWidth: 96 }} disabled={disabled}>
            <InputLabel id={labelId}>Points</InputLabel>
            <Select labelId={labelId} label="Points" value={points} onChange={onPointsChange}>
              {numericDeck.map((card) => (
                <MenuItem key={card} value={card}>
                  {card}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained"
            // The visible text is short to fit the bar; the accessible name keeps the target.
            aria-label="Save to Jira"
            disabled={disabled || !canSave}
            onClick={onSaveClick}
            startIcon={saving ? <CircularProgress size={16} /> : undefined}
          >
            Save
          </Button>
        </>
      )}
      {resetButton}
    </Stack>
  );
}
