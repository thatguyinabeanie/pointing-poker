import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { RawData, WebSocket } from "ws";
import { z } from "zod";
import { DECK } from "../shared/deck.ts";
import type { QueueItem, QueueSettings, ServerMessage } from "../shared/protocol.ts";
import { env } from "./env.ts";
import * as game from "./game.ts";
import { trackSocket } from "./heartbeat.ts";
import { resolveIdentity } from "./identity.ts";
import type { JiraClient, JiraFailure, Result as JiraResult } from "./jira.ts";
import { userLog } from "./log.ts";

// Spec 02-server.md section 7. Unknown keys are stripped (zod's default object behavior).
// `card` is a plain string on purpose: game.vote is the single place that checks deck membership.
const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("vote"), card: z.string().max(8) }),
  z.object({ type: z.literal("reveal") }),
  z.object({ type: z.literal("reset"), clearTicket: z.boolean().optional() }),
  z.object({ type: z.literal("loadTicket"), key: z.string().trim().min(1).max(64) }),
  z.object({ type: z.literal("saveEstimate"), points: z.number().int().nonnegative() }),
  z.object({
    type: z.literal("setQueueSettings"),
    settings: z.object({
      projectKey: z
        .string()
        .trim()
        .regex(/^[A-Z][A-Z0-9_]*$/i)
        .max(32)
        .nullable()
        .optional(),
      boardId: z.number().int().positive().nullable().optional(),
      needsPointingOnly: z.boolean().optional(),
      clearLabelOnSave: z.boolean().optional(),
    }),
  }),
  z.object({ type: z.literal("refreshQueue") }),
  z.object({ type: z.literal("refreshProjects") }),
  z.object({ type: z.literal("searchTickets"), query: z.string().max(200) }),
]);

type Command = z.infer<typeof commandSchema>;

// Used only to tell `unknown_type` apart from `invalid_message` when validation fails.
const COMMAND_TYPES: ReadonlySet<string> = new Set(
  commandSchema.options.map((option) => option.shape.type.value),
);

const REFRESH_QUEUE_WINDOW_MS = 5000;
// A peer that never finishes the close handshake would hold app.close() open; index.ts's 5s
// hard exit is the final backstop, this just keeps a clean shutdown well inside it.
const CLOSE_TERMINATE_MS = 1000;

const MESSAGES = {
  bad_json: "Messages must be JSON.",
  invalid_message: "That message is not valid.",
  unknown_type: "That message type is not supported.",
  internal_error: "Something went wrong.",
  bad_key: "Enter a Jira key like PP-123, or just the number.",
  invalid_points: "Pick a numeric card value.",
  save_in_progress: "A save is already running.",
  query_too_short: "Type at least 2 characters to search.",
} as const;

// Game reason strings to user text, per command (the same reason reads differently per action).
const VOTE_MESSAGES: Record<string, string> = {
  not_voting: "Voting is not open.",
  invalid_card: "That card is not in the deck.",
  unknown_player: "Refresh the page to rejoin.",
};
const SAVE_GUARD_MESSAGES: Record<string, string> = {
  not_revealed: "Reveal the votes before saving.",
  no_ticket: "Load a ticket before saving.",
};

/**
 * Origin rule (section 7 step 2). A missing Origin is allowed: browsers always send one on a
 * WebSocket upgrade, so its absence means a non-browser client, which a cross-site page cannot
 * impersonate. With an allow list, the Origin's host must match an entry (entries may be bare
 * hosts or full origins); without one, it must match the Host header.
 */
export function isOriginAllowed(
  origin: string | undefined,
  host: string | undefined,
  allowed: string[],
): boolean {
  if (origin === undefined) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  if (allowed.length > 0) {
    return allowed.some((entry) => normalizeAllowedEntry(entry) === originHost);
  }
  return host !== undefined && host.toLowerCase() === originHost;
}

function normalizeAllowedEntry(entry: string): string | null {
  if (!entry.includes("://")) return entry.toLowerCase();
  try {
    return new URL(entry).host.toLowerCase();
  } catch {
    // A malformed entry matches nothing rather than failing every connection.
    return null;
  }
}

/**
 * The `preClose` option for `@fastify/websocket`, registered by app.ts:
 * `app.register(fastifyWebsocket, { ..., preClose: wsPreClose(app) })`.
 * It must be the plugin option, not an app.addHook('preClose') from here: the plugin's default
 * preClose closes every socket with no status code, and only the option replaces it. Because a
 * custom preClose replaces the default entirely, it also closes the ws server.
 */
export function wsPreClose(app: FastifyInstance): () => Promise<void> {
  return async () => {
    for (const client of app.websocketServer.clients) {
      try {
        client.close(1001, "server shutting down");
        setTimeout(() => client.terminate(), CLOSE_TERMINATE_MS).unref();
      } catch (err) {
        app.log.error({ err }, "ws close failed");
        client.terminate();
      }
    }
    await new Promise<void>((resolve) => app.websocketServer.close(() => resolve()));
  };
}

export async function wsRoutes(app: FastifyInstance, opts: { jira: JiraClient }): Promise<void> {
  const { jira } = opts;

  // All room state lives in this closure, not at module scope, so each app instance is isolated.
  const defaultProjectKey = env().JIRA_DEFAULT_PROJECT?.toUpperCase() ?? null;
  // A name or numeric id; only Jira can say which board it is, so it is resolved at bootstrap.
  let defaultBoard = env().JIRA_DEFAULT_BOARD ?? null;
  if (defaultBoard !== null && defaultProjectKey === null) {
    app.log.warn("JIRA_DEFAULT_BOARD is ignored because JIRA_DEFAULT_PROJECT is not set");
    defaultBoard = null;
  }
  let state = game.createInitialState({ defaultProjectKey });
  let loadSeq = 0;
  let errorId = 0;
  let queueSeq = 0;
  let boardsSeq = 0;
  let lastQueueRefreshAt = 0;
  let bootstrapped = false;
  const registry = new Map<number, Set<WebSocket>>();

  function label(): string {
    return env().JIRA_NEEDS_POINTING_LABEL;
  }

  function send(socket: WebSocket, msg: ServerMessage): void {
    if (socket.readyState !== socket.OPEN) return;
    try {
      socket.send(JSON.stringify(msg));
    } catch (err) {
      app.log.error({ err }, "ws send failed");
    }
  }

  function broadcast(): void {
    let recipients = 0;
    for (const [userId, sockets] of registry) {
      // One snapshot per user: every tab of that user sees the same view.
      const snapshot = game.viewFor(state, userId);
      for (const socket of sockets) {
        send(socket, { type: "state", snapshot });
        recipients += 1;
      }
    }
    app.log.debug({ recipients }, "broadcast");
  }

  function sendError(socket: WebSocket, reason: string, message: string): void {
    errorId += 1;
    send(socket, { type: "error", id: errorId, reason, message });
  }

  function applyState(result: game.Result): boolean {
    if (!result.ok) return false;
    state = result.state;
    return true;
  }

  // ---------- Jira-backed helpers shared by commands and bootstrap (section 14) ----------

  async function fetchQueue(): Promise<void> {
    const seq = ++queueSeq;
    // setQueueSettings already set loading and broadcast it; skip a second identical broadcast.
    if (!state.queue.loading) {
      applyState(game.setQueueLoading(state));
      broadcast();
    }
    let outcome: { items: QueueItem[] } | { error: string };
    try {
      const res = await jira.searchQueue(state.queueSettings, label());
      outcome = res.ok ? { items: res.value } : { error: res.message };
      if (!res.ok) app.log.warn({ reason: res.reason }, "queue fetch failed");
    } catch (err) {
      app.log.error({ err }, "queue fetch threw");
      outcome = { error: "Could not load the queue." };
    }
    if (seq !== queueSeq) {
      app.log.debug({ seq }, "dropped stale queue result");
      return;
    }
    applyState(game.setQueue(state, outcome, new Date().toISOString()));
    if ("items" in outcome) app.log.info({ count: outcome.items.length }, "queue refreshed");
    broadcast();
  }

  // "skipped" (no project) and "stale" (a newer fetch or a project change won) mean nothing
  // was applied; bootstrap needs them told apart from a real success.
  type BoardsOutcome =
    | { status: "ok" | "skipped" | "stale" }
    | { status: "failed"; failure: JiraFailure };

  async function loadBoards(): Promise<BoardsOutcome> {
    const projectKey = state.queueSettings.projectKey;
    // A null project clears nothing and fetches nothing.
    if (projectKey === null) return { status: "skipped" };
    const seq = ++boardsSeq;
    const res = await jira.listBoards(projectKey);
    if (seq !== boardsSeq || state.queueSettings.projectKey !== projectKey) {
      app.log.debug({ projectKey }, "dropped stale boards result");
      return { status: "stale" };
    }
    if (!res.ok) {
      app.log.warn({ reason: res.reason, projectKey }, "boards fetch failed");
      return { status: "failed", failure: res };
    }
    applyState(game.setBoards(state, res.value));
    broadcast();
    return { status: "ok" };
  }

  // Returns the failure so refreshProjects can report it; automatic callers only log it.
  async function fetchBoards(): Promise<JiraFailure | null> {
    const outcome = await loadBoards();
    return outcome.status === "failed" ? outcome.failure : null;
  }

  // Resolves JIRA_DEFAULT_BOARD (numeric id or board name) against the default project's boards
  // and applies it before the first queue fetch. Any miss leaves boardId null so the queue works.
  async function applyDefaultBoard(): Promise<void> {
    const wanted = defaultBoard;
    if (wanted === null) return;
    const untouched = () =>
      state.queueSettings.boardId === null && state.queueSettings.projectKey === defaultProjectKey;

    let outcome: BoardsOutcome | "threw";
    try {
      outcome = await loadBoards();
      // Stale means another boards fetch raced this one; ask again once rather than guess.
      if (outcome.status === "stale" && untouched()) outcome = await loadBoards();
    } catch (err) {
      app.log.error({ err }, "bootstrap boards fetch threw");
      outcome = "threw";
    }
    // The user changed the project or board while this was loading: leave their choice alone.
    if (!untouched()) return;

    const fail = (msg: string, extra: object = {}) =>
      app.log.warn({ projectKey: defaultProjectKey, ...extra }, msg);
    if (outcome === "threw" || outcome.status !== "ok") {
      fail("JIRA_DEFAULT_BOARD not applied: boards could not be loaded; starting with no board");
      return;
    }
    const needle = wanted.trim();
    const matches = /^\d+$/.test(needle)
      ? state.boards.filter((board) => board.id === Number(needle))
      : state.boards.filter((board) => board.name.trim().toLowerCase() === needle.toLowerCase());
    const [match] = matches;
    if (matches.length === 1 && match) {
      applyState(game.setQueueSettings(state, { boardId: match.id }));
      broadcast();
    } else if (matches.length === 0) {
      fail("JIRA_DEFAULT_BOARD matches no board of the default project; starting with no board");
    } else {
      fail(
        "JIRA_DEFAULT_BOARD name is ambiguous (several boards share it); use the numeric board id",
        { matches: matches.length },
      );
    }
  }

  async function fetchProjects(): Promise<JiraFailure | null> {
    const res = await jira.listProjects();
    if (!res.ok) {
      app.log.warn({ reason: res.reason }, "projects fetch failed");
      return res;
    }
    applyState(game.setProjects(state, res.value));
    broadcast();
    return null;
  }

  // First connection fills the shared lists and the queue. Failures stay in logs / queue.error.
  function bootstrap(): void {
    if (bootstrapped) return;
    bootstrapped = true;
    const onThrow = (err: unknown) => app.log.error({ err }, "bootstrap fetch failed");
    void fetchProjects().catch(onThrow);
    // The queue waits for default board resolution so its first fetch uses the resolved board.
    void (async () => {
      if (defaultBoard === null) {
        void fetchBoards().catch(onThrow);
      } else {
        await applyDefaultBoard();
      }
      await fetchQueue();
    })().catch(onThrow);
  }

  app.get("/ws", { websocket: true }, (socket, request) => {
    // Synchronous on purpose: the plugin drops messages that arrive before listeners exist.
    trackSocket(socket);

    const { origin, host } = request.headers;
    if (!isOriginAllowed(origin, host, env().ALLOWED_ORIGINS ?? [])) {
      request.log.warn({ origin, host }, "ws origin rejected");
      socket.close(1008, "bad origin");
      return;
    }

    // Identity comes only from the upgrade request (proxy headers), never from a message body.
    const identity = resolveIdentity(request);
    if (identity === null) {
      socket.close(4401, "unauthenticated");
      return;
    }
    // Bound once: nested function declarations are hoisted, so they lose the null narrowing.
    const { userId, username } = identity;
    const log: FastifyBaseLogger = userLog(request.log, userId);

    let sockets = registry.get(userId);
    if (!sockets) {
      sockets = new Set();
      registry.set(userId, sockets);
    }
    sockets.add(socket);

    // Per socket: only the latest search on this socket delivers results.
    let searchSeq = 0;

    function runAsync(handle: () => Promise<void>): void {
      void handle().catch((err) => {
        log.error({ err }, "command failed");
        sendError(socket, "internal_error", MESSAGES.internal_error);
      });
    }

    function parse(raw: RawData, isBinary: boolean): Command | null {
      if (isBinary) {
        sendError(socket, "bad_json", MESSAGES.bad_json);
        return null;
      }
      let data: unknown;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        sendError(socket, "bad_json", MESSAGES.bad_json);
        return null;
      }
      const parsed = commandSchema.safeParse(data);
      if (parsed.success) return parsed.data;
      const type =
        typeof data === "object" && data !== null && "type" in data ? data.type : undefined;
      if (typeof type === "string" && !COMMAND_TYPES.has(type)) {
        sendError(socket, "unknown_type", MESSAGES.unknown_type);
      } else {
        sendError(socket, "invalid_message", MESSAGES.invalid_message);
      }
      return null;
    }

    function dispatch(cmd: Command): void {
      // Type, userId (bound in `log`) and phase only: never the card or the free-text query.
      log.debug({ type: cmd.type, phase: state.phase }, "ws command");
      switch (cmd.type) {
        case "vote": {
          const result = game.vote(state, userId, cmd.card);
          if (!applyState(result)) {
            const reason = result.ok ? "internal_error" : result.reason;
            if (reason === "unknown_player") log.warn("vote from unknown player");
            sendError(socket, reason, VOTE_MESSAGES[reason] ?? MESSAGES.internal_error);
            return;
          }
          broadcast();
          return;
        }
        case "reveal": {
          const result = game.reveal(state);
          if (!applyState(result)) {
            sendError(
              socket,
              result.ok ? "internal_error" : result.reason,
              "There is nothing to reveal.",
            );
            return;
          }
          broadcast();
          return;
        }
        case "reset":
          applyState(game.reset(state, { clearTicket: cmd.clearTicket }));
          broadcast();
          return;
        case "loadTicket":
          runAsync(() => loadTicket(cmd.key));
          return;
        case "saveEstimate":
          saveEstimate(cmd.points);
          return;
        case "setQueueSettings":
          setQueueSettings(cmd.settings);
          return;
        case "refreshQueue":
          if (Date.now() - lastQueueRefreshAt < REFRESH_QUEUE_WINDOW_MS) {
            log.debug("ignored refreshQueue inside window");
            return;
          }
          lastQueueRefreshAt = Date.now();
          runAsync(fetchQueue);
          return;
        case "refreshProjects":
          runAsync(refreshProjects);
          return;
        case "searchTickets":
          runAsync(() => searchTickets(cmd.query));
          return;
      }
    }

    async function loadTicket(rawKey: string): Promise<void> {
      let key = rawKey.trim();
      const projectKey = state.queueSettings.projectKey;
      // A bare number uses the room's project; without one it fails the key check below.
      if (/^\d+$/.test(key) && projectKey !== null) key = `${projectKey}-${key}`;
      if (!/^[A-Z]+-\d+$/i.test(key)) {
        sendError(socket, "bad_key", MESSAGES.bad_key);
        return;
      }
      key = key.toUpperCase();

      const seq = ++loadSeq;
      const res = await jira.getIssue(key);
      if (seq !== loadSeq) {
        log.debug({ key }, "dropped stale loadTicket result");
        return;
      }
      if (!res.ok) {
        log.warn({ reason: res.reason, key, message: res.message }, "loadTicket failed");
        sendError(socket, res.reason, loadFailureMessage(key, res));
        return;
      }
      applyState(game.loadTicket(state, res.value));
      log.info({ key }, "ticket loaded");
      broadcast();
    }

    function saveEstimate(points: number): void {
      if (!game.canSave(state, points)) {
        const reason =
          state.phase !== "revealed"
            ? "not_revealed"
            : state.ticket === null
              ? "no_ticket"
              : "invalid_points";
        sendError(
          socket,
          reason,
          reason === "invalid_points" ? MESSAGES.invalid_points : SAVE_GUARD_MESSAGES[reason],
        );
        return;
      }
      if (state.jiraSave.status === "saving") {
        sendError(socket, "save_in_progress", MESSAGES.save_in_progress);
        return;
      }
      // canSave guarantees a ticket; the check narrows the type.
      if (state.ticket === null) return;
      const round = state.round;
      const key = state.ticket.key;
      const by = username;

      applyState(game.markSave(state, { status: "saving", points, by }));
      broadcast();

      runAsync(async () => {
        let res: JiraResult<void>;
        try {
          res = await jira.setStoryPoints(key, points);
        } catch (err) {
          log.error({ err, key }, "setStoryPoints threw");
          res = { ok: false, reason: "jira_error", message: "Saving to Jira failed." };
        }
        if (!res.ok) log.warn({ reason: res.reason, key, message: res.message }, "save failed");

        if (state.round !== round) {
          // A reset or new ticket happened mid-flight: leave the new round's save state alone.
          log.info({ key, points, ok: res.ok }, "save finished for a stale round");
        } else {
          log.info({ key, points, ok: res.ok }, "save finished");
          applyState(
            game.markSave(
              state,
              res.ok
                ? { status: "saved", points, by }
                : { status: "error", points, message: res.message },
            ),
          );
          broadcast();
        }
        if (!res.ok) return;

        // The captured key stays valid on a stale round, so label removal and refresh still run.
        if (state.queueSettings.clearLabelOnSave) {
          const removed = await jira.removeLabel(key, label());
          if (!removed.ok) {
            log.warn({ reason: removed.reason, key }, "label removal failed");
            sendError(socket, removed.reason, removed.message);
          }
        }
        // The ticket has points now, so it leaves the queue. Not subject to the 5s refresh window.
        await fetchQueue();
      });
    }

    function setQueueSettings(settings: Partial<QueueSettings>): void {
      const before = state;
      const normalized: Partial<QueueSettings> = { ...settings };
      // Jira project keys are uppercase; normalizing keeps "pp" and "PP" from counting as a change.
      if (typeof normalized.projectKey === "string") {
        normalized.projectKey = normalized.projectKey.toUpperCase();
      }
      const result = game.setQueueSettings(state, normalized);
      // Same object back means no effective change: no refetch and no loading flash.
      if (!result.ok || result.state === before) return;
      const projectChanged =
        result.state.queueSettings.projectKey !== before.queueSettings.projectKey;
      applyState(result);
      broadcast();
      if (projectChanged) {
        runAsync(async () => {
          await fetchBoards();
        });
      }
      runAsync(fetchQueue);
    }

    async function refreshProjects(): Promise<void> {
      // jira.ts caches both lists for 10 minutes and the protocol has no cache-bypass argument,
      // so inside that window this re-sends the cached lists.
      const [projectsFailure, boardsFailure] = await Promise.all([fetchProjects(), fetchBoards()]);
      const failure = projectsFailure ?? boardsFailure;
      if (failure) sendError(socket, failure.reason, failure.message);
    }

    async function searchTickets(query: string): Promise<void> {
      const mySeq = ++searchSeq;
      log.debug({ queryLength: query.length }, "searchTickets");
      const res = await jira.searchTickets(state.queueSettings.projectKey, query);
      if (mySeq !== searchSeq) {
        log.debug("dropped stale search result");
        return;
      }
      if (res.ok) {
        send(socket, { type: "searchResults", query, items: res.value, error: null });
        return;
      }
      const error = res.reason === "query_too_short" ? MESSAGES.query_too_short : res.message;
      send(socket, { type: "searchResults", query, items: [], error });
    }

    socket.on("message", (raw, isBinary) => {
      // The plugin's errorHandler does not see exceptions thrown here, so catch them ourselves.
      try {
        const cmd = parse(raw, isBinary);
        if (cmd) dispatch(cmd);
      } catch (err) {
        log.error({ err }, "ws message handler failed");
        sendError(socket, "internal_error", MESSAGES.internal_error);
      }
    });

    socket.on("close", (code) => {
      try {
        const set = registry.get(userId);
        if (set) {
          set.delete(socket);
          if (set.size === 0) registry.delete(userId);
        }
        applyState(game.leave(state, userId));
        log.info({ code }, "ws closed");
        broadcast();
      } catch (err) {
        log.error({ err }, "ws close handler failed");
      }
    });

    try {
      applyState(game.join(state, identity));
      log.info("ws connected");
      // Hello first, so the client knows `me` before its first snapshot.
      send(socket, { type: "hello", me: { userId, username }, deck: [...DECK] });
      broadcast();
      bootstrap();
    } catch (err) {
      log.error({ err }, "ws join failed");
      sendError(socket, "internal_error", MESSAGES.internal_error);
    }
  });
}

function loadFailureMessage(key: string, failure: JiraFailure): string {
  switch (failure.reason) {
    case "not_found":
      return `${key} was not found, or the service account cannot see it.`;
    case "bad_credentials":
      return "Jira rejected the service credentials. Ask an admin to check JIRA_API_TOKEN.";
    case "unreachable":
      return "Could not reach Jira. You can still start an unticketed round with Reset.";
    default:
      return failure.message;
  }
}
