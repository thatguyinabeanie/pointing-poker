import { useCallback, useEffect, useRef, useState } from "react";
import { isNumericCard } from "../../shared/deck.ts";
import type { Phase, Snapshot } from "../../shared/protocol.ts";
import { suggestPoints } from "./lib/estimate.ts";
import { readJson, removeItem, writeJson } from "./storage.ts";

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

interface Args {
  phase: Phase;
  round: number;
  ticketKey: string | null;
  stats: Snapshot["stats"];
  deck: readonly string[];
}

// The points shown in the results pill's select: the suggestion, or the viewer's manual pick for
// this ticket and round.
export function usePointsPick({ phase, round, ticketKey, stats, deck }: Args): {
  points: string;
  setManualPoints: (points: string) => void;
} {
  const [points, setPoints] = useState<string>("");
  const suggestion = suggestPoints(stats, deck);
  // The manual pick for this ticket and round, kept in memory as well as in sessionStorage.
  // writeJson ignores failures, so with storage blocked or full the stored copy can be missing,
  // and the next changed suggestion would then silently replace the user's pick.
  const manualPick = useRef<StoredPick | null>(null);

  // Re-suggest on a new reveal, ticket or round, so a new reveal never keeps a stale pick. A
  // manual pick for this exact ticket and round wins over the suggestion: the in-memory one
  // first, then the stored one, which is what survives a refresh mid-reveal. Any other pick is
  // stale and is dropped from both places.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deck is stable; stats is omitted (a new object every snapshot), but suggestion is in the list so a vote change after the reveal re-suggests, and a manual pick (in memory, or stored for a refresh) still wins
  useEffect(() => {
    const isCurrent = (pick: StoredPick | null): pick is StoredPick =>
      pick !== null &&
      phase === "revealed" &&
      pick.ticketKey === ticketKey &&
      pick.round === round &&
      deck.includes(pick.points) &&
      isNumericCard(pick.points);
    if (isCurrent(manualPick.current)) {
      setPoints(manualPick.current.points);
      return;
    }
    const stored = readPick();
    if (isCurrent(stored)) {
      manualPick.current = stored;
      setPoints(stored.points);
      return;
    }
    manualPick.current = null;
    removeItem("session", PICK_KEY);
    setPoints(suggestion ?? "");
  }, [phase, ticketKey, round, suggestion]);

  // Only a manual pick is stored; the suggestion is recomputed from stats on restore anyway.
  const setManualPoints = useCallback(
    (next: string) => {
      setPoints(next);
      if (ticketKey !== null) {
        const pick = { ticketKey, round, points: next };
        manualPick.current = pick;
        writeJson("session", PICK_KEY, pick);
      }
    },
    [ticketKey, round],
  );

  return { points, setManualPoints };
}
