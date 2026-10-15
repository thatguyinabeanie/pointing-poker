// Wire contract between server/ws.ts and client/src/useGameSocket.ts. Types only: Node strips
// this file to nothing at runtime, so it must never hold values.
import type { DECK } from "./deck.ts";

export type Card = (typeof DECK)[number];
export type Phase = "idle" | "voting" | "revealed";

export interface TicketComment {
  id: string;
  author: string;
  createdAt: string;
  bodyHtml: string;
}

export interface Ticket {
  key: string;
  summary: string;
  issueType: string;
  status: string;
  url: string;
  currentPoints: number | null;
  // descriptionHtml and every bodyHtml are sanitized server-side.
  // Comments are sent oldest first.
  descriptionHtml: string | null;
  comments: TicketComment[];
  assignee: string | null;
  priority: string | null;
  labels: string[];
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

export interface QueueSettings {
  projectKey: string | null;
  boardId: number | null;
  needsPointingOnly: boolean;
  clearLabelOnSave: boolean;
}
export interface QueueItem {
  key: string;
  summary: string;
  issueType: string;
  status: string;
  url: string;
}
export interface JiraProject {
  key: string;
  name: string;
}
export interface JiraBoard {
  id: number;
  name: string;
  type: string;
}
export interface QueueState {
  items: QueueItem[];
  loading: boolean;
  error: string | null;
  fetchedAt: string | null;
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
  queueSettings: QueueSettings;
  queue: QueueState;
  projects: JiraProject[];
  boards: JiraBoard[];
}

export type ClientCommand =
  | { type: "vote"; card: Card }
  | { type: "reveal" }
  | { type: "reset"; clearTicket?: boolean }
  | { type: "loadTicket"; key: string }
  | { type: "saveEstimate"; points: number }
  | { type: "setQueueSettings"; settings: Partial<QueueSettings> }
  | { type: "refreshQueue" }
  | { type: "refreshProjects" }
  | { type: "searchTickets"; query: string };

export type ServerMessage =
  | { type: "hello"; me: { userId: number; username: string }; deck: Card[] }
  | { type: "state"; snapshot: Snapshot }
  | { type: "error"; id: number; reason: string; message: string }
  | { type: "searchResults"; query: string; items: QueueItem[]; error: string | null };
