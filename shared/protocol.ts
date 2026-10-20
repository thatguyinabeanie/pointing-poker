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

export interface TicketHistoryChange {
  // Jira's display name for the field, e.g. "status" or "Story Points".
  field: string;
  // Plain text from Jira's fromString and toString; null when Jira had no value.
  from: string | null;
  to: string | null;
  // True for long text fields: the client shows "edited" and drops the values.
  edited: boolean;
}

export interface TicketHistoryEntry {
  id: string;
  // Jira displayName, or "Unknown" when Jira sent none.
  author: string;
  createdAt: string;
  changes: TicketHistoryChange[];
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
  // Changelog entries are sent newest first. historyTruncated is true when older
  // entries were left out to stay under the cap.
  history: TicketHistoryEntry[];
  historyTruncated: boolean;
}

export interface SessionHistoryEntry {
  key: string;
  summary: string;
  issueType: string;
  // Jira browse link for the ticket, used by the row's key link.
  url: string;
  // From the revealed stats.
  average: number | null;
  min: number | null;
  max: number | null;
  consensus: boolean;
  // Players with a vote at reveal.
  voters: number;
  // Revealed more than once in this room.
  revoted: boolean;
  // Set when Save to Jira succeeds for this key.
  savedPoints: number | null;
  // ISO time of the latest reveal.
  revealedAt: string;
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
export type QueueSectionKind = "active" | "future" | "backlog" | "all";
export interface QueueSection {
  // "sprint-<sprintId>", "backlog", or "all"
  id: string;
  // Sprint name, "Backlog", or "Tickets" for the no-board list
  name: string;
  kind: QueueSectionKind;
  // Matching tickets in Jira for this section; may exceed items.length (per-section cap 50)
  total: number;
  items: QueueItem[];
}
export interface QueueState {
  sections: QueueSection[];
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
  // Newest first. Same list for every viewer.
  history: SessionHistoryEntry[];
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
  | {
      type: "hello";
      me: { userId: number; username: string };
      deck: Card[];
    }
  | { type: "state"; snapshot: Snapshot }
  | { type: "error"; id: number; reason: string; message: string }
  | { type: "searchResults"; query: string; items: QueueItem[]; error: string | null };
