import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { MouseEvent, ReactNode } from "react";
import { useCallback, useLayoutEffect, useRef } from "react";
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

// The buttons whose click ends the phase they are shown in, so they unmount under the focus.
type Step = "reveal" | "next";

// After a focused Reveal: the Points select, or Save when Points is disabled. Both are inside
// the results slot, so they are found by the data-round-focus attributes RoundResults sets. A
// disabled Select's display has aria-disabled, a disabled Button the disabled attribute.
const AFTER_REVEAL_SELECTOR =
  '[data-round-focus="points"]:not([aria-disabled="true"]), [data-round-focus="save"]:not(:disabled)';

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

  // Reveal unmounts the Reveal button and Next unmounts the results, so a keyboard user who
  // pressed either was left with focus on body and had to Tab in from the top (final review,
  // 11/06/2026). Focus moves back into the strip only when this client's button had focus at
  // click time: the phase also changes from auto-reveal and from another tab's Reveal or Next,
  // and those must never pull focus away from what the viewer is doing. The click is caught in
  // the capture phase because Next lives in the results slot, which this component does not
  // render; its data-round-step attribute names it. Read at click time, because by the time the
  // snapshot arrives the button is gone.
  const stackRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLButtonElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);
  const pendingStep = useRef<Step | null>(null);
  const onClickCapture = useCallback((e: MouseEvent<HTMLElement>) => {
    const button = (e.target as Element).closest<HTMLElement>("[data-round-step]");
    const step = button?.dataset.roundStep;
    pendingStep.current =
      button === document.activeElement && (step === "reveal" || step === "next") ? step : null;
  }, []);
  // Layout effect so focus lands before paint, with no frame where the strip has no focus ring.
  useLayoutEffect(() => {
    const step = pendingStep.current;
    // Any phase change clears the flag. A click whose phase change never came (a rejected
    // message) keeps it until the next phase change, and the body check below keeps that later
    // change from pulling focus away from anything the viewer has moved to since.
    pendingStep.current = null;
    if (step === null) return;
    // Only when focus really fell: the browser reports body once the focused button is removed.
    // If the viewer has already moved focus somewhere else, leave it there.
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    let target: HTMLElement | null = null;
    if (step === "reveal" && phase === "revealed") {
      target = stackRef.current?.querySelector<HTMLElement>(AFTER_REVEAL_SELECTOR) ?? null;
    } else if (step === "next" && phase !== "revealed") {
      // Start round in idle. With auto-advance the next round may already be voting, where Reveal
      // comes first and Reset (the same button as Start round) is the fallback.
      const reveal = revealRef.current;
      target = reveal && !reveal.disabled ? reveal : resetRef.current;
    }
    if (target && !(target instanceof HTMLButtonElement && target.disabled)) target.focus();
  }, [phase]);

  return (
    <Stack
      ref={stackRef}
      direction="row"
      useFlexGap
      spacing={1}
      onClickCapture={onClickCapture}
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
        <Button
          ref={revealRef}
          variant="contained"
          size="small"
          data-round-step="reveal"
          disabled={disabled}
          onClick={onReveal}
        >
          Reveal
        </Button>
      )}
      <Button
        ref={resetRef}
        variant="outlined"
        size="small"
        disabled={disabled}
        onClick={keepTicket}
      >
        {phase === "idle" ? "Start round" : "Reset"}
      </Button>
    </Stack>
  );
}
