// Wire contract between server/ws.ts and client/src/useGameSocket.ts. Types only: Node strips
// this file to nothing at runtime, so it must never hold values.
import type { DECK } from "./deck.ts";

export type Card = (typeof DECK)[number];

export type Phase = "idle" | "voting" | "revealed";

export interface Ticket {
  key: string;
  summary: string;
  issueType: string;
  status: string;
  url: string;
  currentPoints: number | null;
}

export type JiraSave =
  | { status: "idle" }
  | { status: "saving"; points: number; by: string }
  | { status: "saved"; points: number; by: string }
  | { status: "error"; points: number; message: string };

export interface PlayerView {
  userId: number;
  username: string;
  connected: boolean;
  hasVoted: boolean;
  // Null for other players until reveal, even when hasVoted is true.
  vote: Card | null;
}

export interface Snapshot {
  phase: Phase;
  round: number;
  ticket: Ticket | null;
  players: PlayerView[];
  stats: {
    average: number | null;
    min: number | null;
    max: number | null;
    counts: Record<string, number>;
    consensus: boolean;
  } | null;
  jiraSave: JiraSave;
}

export type ClientCommand =
  | { type: "vote"; card: Card }
  | { type: "reveal" }
  | { type: "reset"; clearTicket?: boolean }
  | { type: "loadTicket"; key: string }
  | { type: "saveEstimate"; points: number };

export type ServerMessage =
  | { type: "hello"; me: { userId: number; username: string }; deck: Card[] }
  | { type: "state"; snapshot: Snapshot }
  | { type: "error"; id: number; reason: string; message: string };
