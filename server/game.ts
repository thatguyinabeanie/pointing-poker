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
  // The project's issue type names (the Type menu), not the selection in queueSettings.
  issueTypes: string[];
  // Newest first. Lives in memory only, so a restart clears it.
  history: SessionHistoryEntry[];
  // Room-wide switch, kept across rounds and tickets (newRound spreads state). Only a server
  // restart puts it back to on.
  autoReveal: boolean;
  // Room-wide switch, kept across rounds (newRound spreads state). Off by default, and a server
  // restart turns it off again.
  autoAdvance: boolean;
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
      issueTypes: [],
    },
    queue: { sections: [], loading: false, error: null, fetchedAt: null },
    projects: [],
    boards: [],
    issueTypes: [],
    history: [],
    autoReveal: true,
    autoAdvance: false,
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
// Leaving can also reveal: the last player who had not voted may be the one who disconnected.
export function leave(
  state: GameState,
  userId: number,
  now: string = new Date().toISOString(),
): Result {
  const player = state.players.get(userId);
  if (!player) return ok(state);
  return ok(
    autoRevealIfReady(
      withPlayers(state, (players) => {
        players.set(userId, { ...player, connections: Math.max(0, player.connections - 1) });
      }),
      now,
    ),
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

export function vote(
  state: GameState,
  userId: number,
  card: string,
  now: string = new Date().toISOString(),
): Result {
  if (state.phase !== "voting" && state.phase !== "revealed") return fail("not_voting");
  if (!isCard(card)) return fail("invalid_card");
  const player = state.players.get(userId);
  if (!player) return fail("unknown_player");
  const next = withPlayers(state, (players) => {
    // Clicking the selected card again withdraws it, so there is no separate "clear" command.
    players.set(userId, { ...player, vote: player.vote === card ? null : card });
  });
  // Before the reveal, auto-reveal may fire. After it, a vote change updates the history row in
  // place, except after an empty reveal: recordReveal wrote nothing then (or left an older row
  // from a previous round untouched), so refreshing would drop this first vote or edit the old
  // round's row in place. That vote is the round's first result, so it is recorded the way a
  // fresh reveal would be.
  if (next.phase !== "revealed") return ok(autoRevealIfReady(next, now));
  return ok(hasVotes(state) ? refreshRevealedRow(next) : recordReveal(next, now));
}

function hasVotes(state: GameState): boolean {
  return [...state.players.values()].some((p) => p.vote !== null);
}

// Flips the cards once every connected player holds a vote. Disconnected players are left out
// of the check on purpose: they keep their vote (and it shows on reveal), but a closed tab must
// not stall the room. A withdrawn card leaves a null vote, so it never reveals.
function autoRevealIfReady(state: GameState, now: string): GameState {
  if (!state.autoReveal || state.phase !== "voting") return state;
  const connected = [...state.players.values()].filter((p) => p.connections > 0);
  if (connected.length === 0 || connected.some((p) => p.vote === null)) return state;
  return revealState(state, now);
}

// Shared by the manual and the automatic reveal so both write session history the same way.
function revealState(state: GameState, now: string): GameState {
  return recordReveal({ ...state, phase: "revealed" }, now);
}

export function setAutoReveal(
  state: GameState,
  enabled: boolean,
  now: string = new Date().toISOString(),
): Result {
  // Turning it on can reveal at once if everyone connected had already voted.
  return ok(autoRevealIfReady({ ...state, autoReveal: enabled }, now));
}

// Only sets the flag. The advance itself happens in ws.ts after a successful Jira save.
export function setAutoAdvance(state: GameState, enabled: boolean): Result {
  return ok({ ...state, autoAdvance: enabled });
}

// The ticket after currentKey in queue order (sprints first, then backlog), or the first ticket
// when currentKey is not queued. Null when there is nothing to advance to.
export function nextQueueKey(queue: QueueState, currentKey: string | null): string | null {
  const keys = queue.sections.flatMap((section) => section.items.map((item) => item.key));
  const at = currentKey === null ? -1 : keys.indexOf(currentKey);
  if (at === -1) return keys[0] ?? null;
  return keys.slice(at + 1).find((key) => key !== currentKey) ?? null;
}

// Partial votes are allowed: a stuck teammate should not block the room.
export function reveal(state: GameState, now: string = new Date().toISOString()): Result {
  if (state.phase !== "voting") return fail("not_voting");
  return ok(revealState(state, now));
}

const MAX_HISTORY = 50;

// A vote changed after the reveal: recompute the stats on the existing row, same position. This
// does not use recordReveal because that marks any existing row as re-voted and moves it to the
// top, and a changed vote is the same reveal, not a new round. With no votes left the row keeps
// its last stats (summarize would give nulls) rather than going blank.
export function refreshRevealedRow(state: GameState): GameState {
  const { ticket } = state;
  if (ticket === null) return state;
  const index = state.history.findIndex((row) => row.key === ticket.key);
  const voters = [...state.players.values()].filter((p) => p.vote !== null).length;
  if (index === -1 || voters === 0) return state;
  const stats = summarize(state.players.values());
  const history = [...state.history];
  history[index] = {
    ...history[index],
    average: stats.average,
    min: stats.min,
    max: stats.max,
    consensus: stats.consensus,
    voters,
  };
  return { ...state, history };
}

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
  if (partial.issueTypes !== undefined) {
    // Only names from the project's own list: Jira answers 400 to `issuetype in (...)` with an
    // unknown name, so a selection sent for the previous project would fail the whole queue.
    // With no list loaded every name is dropped, which leaves the queue unfiltered.
    const known = new Set(state.issueTypes);
    next.issueTypes = [...new Set(partial.issueTypes)].filter((name) => known.has(name));
  }

  const projectChanged = next.projectKey !== state.queueSettings.projectKey;
  // A board belongs to one project, so a project change always drops the board, even if
  // the same message also named one (that id was picked from the old project's list).
  // Issue types are per project too, so the type filter is dropped in the same place.
  if (projectChanged) {
    next.boardId = null;
    next.issueTypes = [];
  }

  const changed =
    projectChanged ||
    next.boardId !== state.queueSettings.boardId ||
    !sameNames(next.issueTypes, state.queueSettings.issueTypes);
  if (!changed) return ok(state);

  return ok({
    ...state,
    queueSettings: next,
    boards: projectChanged ? [] : state.boards,
    issueTypes: projectChanged ? [] : state.issueTypes,
    queue: { ...state.queue, loading: true },
  });
}

// Order-insensitive: the menu sends names in click order, and the JQL `in (...)` ignores order,
// so a reordered selection is not a change and must not refetch the queue.
function sameNames(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((name) => set.has(name));
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

export function setIssueTypes(state: GameState, types: string[]): Result {
  return ok({ ...state, issueTypes: types });
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
    return { average: null, median: null, min: null, max: null, counts, consensus: false };
  }
  const sum = numeric.reduce((a, b) => a + b, 0);
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const sorted = [...numeric].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const medianRaw =
    sorted.length % 2 === 1 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    average: Math.round((sum / numeric.length) * 10) / 10,
    median: Math.round(medianRaw * 10) / 10,
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
    issueTypes: state.issueTypes,
    history: state.history,
    autoReveal: state.autoReveal,
    autoAdvance: state.autoAdvance,
  };
}
