import { DECK, isNumericCard } from "../shared/deck.ts";
import type {
  Card,
  JiraBoard,
  JiraProject,
  JiraSave,
  Phase,
  PlayerView,
  QueueSection,
  QueueSettings,
  QueueState,
  SessionHistoryEntry,
  Snapshot,
  Ticket,
} from "../shared/protocol.ts";

export interface Player {
  userId: number;
  username: string;
  connections: number;
  vote: Card | null;
}

export interface GameState {
  phase: Phase;
  ticket: Ticket | null;
  players: Map<number, Player>;
  round: number;
  jiraSave: JiraSave;
  queueSettings: QueueSettings;
  queue: QueueState;
  projects: JiraProject[];
  boards: JiraBoard[];
  // Newest first. Lives in memory only, so a restart clears it.
  history: SessionHistoryEntry[];
}

export type Result = { ok: true; state: GameState } | { ok: false; reason: string };
type Stats = NonNullable<Snapshot["stats"]>;

export function createInitialState(opts: { defaultProjectKey?: string | null } = {}): GameState {
  return {
    phase: "idle",
    ticket: null,
    players: new Map(),
    round: 0,
    jiraSave: { status: "idle" },
    queueSettings: {
      projectKey: opts.defaultProjectKey ?? null,
      boardId: null,
    },
    queue: { sections: [], loading: false, error: null, fetchedAt: null },
    projects: [],
    boards: [],
    history: [],
  };
}

const ok = (state: GameState): Result => ({ ok: true, state });
const fail = (reason: string): Result => ({ ok: false, reason });

function isCard(card: string): card is Card {
  return (DECK as readonly string[]).includes(card);
}

// Players are replaced, never edited in place, so earlier states stay valid snapshots.
function withPlayers(state: GameState, edit: (players: Map<number, Player>) => void): GameState {
  const players = new Map(state.players);
  edit(players);
  return { ...state, players };
}

// A tab refresh or a second browser tab would otherwise double-count the same person,
// so identity is the userId and each socket just bumps a counter.
export function join(state: GameState, identity: { userId: number; username: string }): Result {
  return ok(
    withPlayers(state, (players) => {
      const existing = players.get(identity.userId);
      players.set(
        identity.userId,
        existing
          ? { ...existing, username: identity.username, connections: existing.connections + 1 }
          : { userId: identity.userId, username: identity.username, connections: 1, vote: null },
      );
    }),
  );
}

// The vote is kept on disconnect: flaky wifi or a reload must not erase a player's card
// mid-round. Zero-connection players are only dropped when the next round starts.
export function leave(state: GameState, userId: number): Result {
  const player = state.players.get(userId);
  if (!player) return ok(state);
  return ok(
    withPlayers(state, (players) => {
      players.set(userId, { ...player, connections: Math.max(0, player.connections - 1) });
    }),
  );
}

function prune(state: GameState): GameState {
  return withPlayers(state, (players) => {
    for (const [id, p] of players) if (p.connections === 0) players.delete(id);
  });
}

function clearVotes(state: GameState): GameState {
  return withPlayers(state, (players) => {
    for (const [id, p] of players) players.set(id, { ...p, vote: null });
  });
}

// Shared by reset and loadTicket: both begin a fresh round.
function newRound(state: GameState, ticket: Ticket | null, phase: Phase): GameState {
  return {
    ...clearVotes(prune(state)),
    ticket,
    phase,
    round: state.round + 1,
    jiraSave: { status: "idle" },
  };
}

export function vote(state: GameState, userId: number, card: string): Result {
  if (state.phase !== "voting") return fail("not_voting");
  if (!isCard(card)) return fail("invalid_card");
  const player = state.players.get(userId);
  if (!player) return fail("unknown_player");
  return ok(
    withPlayers(state, (players) => {
      // Clicking the selected card again withdraws it, so there is no separate "clear" command.
      players.set(userId, { ...player, vote: player.vote === card ? null : card });
    }),
  );
}

// Partial votes are allowed: a stuck teammate should not block the room.
export function reveal(state: GameState, now: string = new Date().toISOString()): Result {
  if (state.phase !== "voting") return fail("not_voting");
  return ok(recordReveal({ ...state, phase: "revealed" }, now));
}

const MAX_HISTORY = 50;

// One row per ticket key: a re-reveal replaces the row, keeps its saved points and moves it to
// the top. The array is replaced, never mutated, because viewFor hands it out by reference.
// A reveal with zero votes records nothing: an empty reveal (for example right after reloading a
// ticket from History) would otherwise wipe the row's stats and mark it re-voted.
export function recordReveal(state: GameState, now: string): GameState {
  const { ticket } = state;
  const voters = [...state.players.values()].filter((p) => p.vote !== null).length;
  if (ticket === null || voters === 0) return state;
  const stats = summarize(state.players.values());
  const previous = state.history.find((row) => row.key === ticket.key);
  const row: SessionHistoryEntry = {
    key: ticket.key,
    summary: ticket.summary,
    issueType: ticket.issueType,
    url: ticket.url,
    average: stats.average,
    min: stats.min,
    max: stats.max,
    consensus: stats.consensus,
    voters,
    revoted: previous !== undefined,
    savedPoints: previous?.savedPoints ?? null,
    revealedAt: now,
  };
  const rest = state.history.filter((r) => r.key !== ticket.key);
  return { ...state, history: [row, ...rest].slice(0, MAX_HISTORY) };
}

// Keyed by ticket, not by round, so a save that finishes after the room moved on still lands.
// Returns the same state object when no row matches so callers can skip a broadcast.
export function markHistorySaved(state: GameState, key: string, points: number): Result {
  if (!state.history.some((row) => row.key === key)) return ok(state);
  return ok({
    ...state,
    history: state.history.map((row) => (row.key === key ? { ...row, savedPoints: points } : row)),
  });
}

export function reset(state: GameState, opts: { clearTicket?: boolean } = {}): Result {
  // From idle without clearTicket this starts a ticket-less round, so the app
  // still works when Jira is down or unconfigured.
  return opts.clearTicket
    ? ok(newRound(state, null, "idle"))
    : ok(newRound(state, state.ticket, "voting"));
}

export function loadTicket(state: GameState, ticket: Ticket): Result {
  return ok(newRound(state, ticket, "voting"));
}

// Queue mutators. None of them touch the round: browsing the queue never disturbs a vote.

// Returns the same state object when nothing changed, so the caller can skip a refetch
// by comparing references.
export function setQueueSettings(state: GameState, partial: Partial<QueueSettings>): Result {
  const next: QueueSettings = { ...state.queueSettings };
  if (partial.projectKey !== undefined) next.projectKey = partial.projectKey;
  if (partial.boardId !== undefined) next.boardId = partial.boardId;

  const projectChanged = next.projectKey !== state.queueSettings.projectKey;
  // A board belongs to one project, so a project change always drops the board, even if
  // the same message also named one (that id was picked from the old project's list).
  if (projectChanged) next.boardId = null;

  const changed = projectChanged || next.boardId !== state.queueSettings.boardId;
  if (!changed) return ok(state);

  return ok({
    ...state,
    queueSettings: next,
    boards: projectChanged ? [] : state.boards,
    queue: { ...state.queue, loading: true },
  });
}

export function setQueueLoading(state: GameState): Result {
  return ok({ ...state, queue: { ...state.queue, loading: true } });
}

// On error the previous sections stay visible next to the message, so a transient Jira
// failure does not blank the list; fetchedAt keeps the time of the last good fetch.
export function setQueue(
  state: GameState,
  result: { sections: QueueSection[] } | { error: string },
  fetchedAt: string,
): Result {
  // fetchedAt is a parameter because this module does no I/O, and reading the clock is I/O.
  const queue: QueueState =
    "error" in result
      ? { ...state.queue, loading: false, error: result.error }
      : { sections: result.sections, loading: false, error: null, fetchedAt };
  return ok({ ...state, queue });
}

export function setProjects(state: GameState, projects: JiraProject[]): Result {
  return ok({ ...state, projects });
}

export function setBoards(state: GameState, boards: JiraBoard[]): Result {
  return ok({ ...state, boards });
}

export function markSave(state: GameState, save: JiraSave): Result {
  if (save.status !== "idle") {
    if (state.phase !== "revealed") return fail("not_revealed");
    if (!state.ticket) return fail("no_ticket");
  }
  // Jira now holds these points, so the ticket's Current chip shows them without a reload.
  if (save.status === "saved" && state.ticket) {
    return ok({
      ...state,
      jiraSave: save,
      ticket: { ...state.ticket, currentPoints: save.points },
    });
  }
  return ok({ ...state, jiraSave: save });
}

export function canSave(state: GameState, points: number): boolean {
  return state.phase === "revealed" && state.ticket !== null && isNumericCard(String(points));
}

export function summarize(players: Iterable<Player>): Stats {
  const counts: Record<string, number> = {};
  const numeric: number[] = [];
  for (const { vote } of players) {
    if (vote === null) continue;
    counts[vote] = (counts[vote] ?? 0) + 1;
    if (isNumericCard(vote)) numeric.push(Number(vote));
  }
  if (numeric.length === 0) {
    return { average: null, min: null, max: null, counts, consensus: false };
  }
  const sum = numeric.reduce((a, b) => a + b, 0);
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  return {
    average: Math.round((sum / numeric.length) * 10) / 10,
    min,
    max,
    counts,
    consensus: min === max,
  };
}

// Built per recipient because hiding other players' cards is enforced here, not in the client.
export function viewFor(state: GameState, viewerId: number): Snapshot {
  const revealed = state.phase === "revealed";
  const players: PlayerView[] = [...state.players.values()]
    .map((p) => ({
      userId: p.userId,
      username: p.username,
      connected: p.connections > 0,
      hasVoted: p.vote !== null,
      vote: revealed || p.userId === viewerId ? p.vote : null,
    }))
    .sort((a, b) => a.username.localeCompare(b.username));
  return {
    phase: state.phase,
    round: state.round,
    ticket: state.ticket,
    players,
    stats: revealed ? summarize(state.players.values()) : null,
    jiraSave: state.jiraSave,
    // Shared room state, identical for every viewer.
    queueSettings: state.queueSettings,
    queue: state.queue,
    projects: state.projects,
    boards: state.boards,
    history: state.history,
  };
}
