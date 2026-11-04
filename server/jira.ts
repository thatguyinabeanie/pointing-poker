import { expandBareIssueNumber, ISSUE_KEY, MIN_QUERY_LENGTH } from "../shared/constants.ts";
import type {
  JiraBoard,
  JiraProject,
  QueueItem,
  QueueSection,
  QueueSettings,
  Ticket,
  TicketComment,
  TicketHistoryChange,
  TicketHistoryEntry,
} from "../shared/protocol.ts";
import { capSanitizedHtml, sanitizeJiraHtml } from "./sanitize.ts";

export type JiraErrorReason =
  | "not_configured"
  | "bad_credentials"
  | "forbidden"
  | "not_found"
  | "field_not_editable"
  | "rate_limited"
  | "unreachable"
  | "no_points_field"
  | "query_too_short"
  | "jira_error";

export type JiraFailure = { ok: false; reason: JiraErrorReason; message: string };
export type Result<T> = { ok: true; value: T } | JiraFailure;

export interface JiraClient {
  storyPointsFieldId(): Promise<Result<string>>;
  getIssue(key: string): Promise<Result<Ticket>>;
  setStoryPoints(key: string, points: number): Promise<Result<void>>;
  listProjects(): Promise<Result<JiraProject[]>>;
  listBoards(projectKey: string): Promise<Result<JiraBoard[]>>;
  boardType(boardId: number): Promise<Result<string>>;
  searchQueue(settings: QueueSettings): Promise<Result<QueueSection[]>>;
  searchTickets(projectKey: string | null, query: string): Promise<Result<QueueItem[]>>;
}

export interface JiraClientOptions {
  baseUrl: string;
  email: string;
  token: string;
  fieldOverride?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  // Optional, pino-compatible. Only sizes and counts are ever passed, never ticket content.
  logger?: { debug(obj: object, msg: string): void };
}

const DEFAULT_TIMEOUT_MS = 10_000;
const BASE_FIELDS = "summary,issuetype,status,assignee,priority,labels,description";
const MAX_COMMENTS = 50;
const MAX_DESCRIPTION_CHARS = 200_000;
const MAX_COMMENT_CHARS = 20_000;
const MAX_HISTORY_ENTRIES = 100;
const MAX_HISTORY_VALUE_CHARS = 200;
// Long text fields: the client shows "edited" instead of the values.
const EDITED_FIELDS = new Set(["description", "environment"]);
// Jira may answer with fewer entries than asked for, so paging is bounded rather than assumed.
// The cap counts window requests only; the first probe request (which learns `total`) is extra.
const MAX_HISTORY_REQUESTS = 10;
const LIST_CACHE_MS = 10 * 60 * 1000;
const MAX_PROJECTS = 500;
const MAX_BOARDS = 500;
const QUEUE_PAGE_SIZE = 50;
const MAX_SPRINTS = 50;
const SEARCH_PAGE_SIZE = 10;

function fail(reason: JiraErrorReason, message: string): JiraFailure {
  return { ok: false, reason, message };
}

/** For callers to use when the Jira env vars are missing, so the app can still run without Jira. */
export function notConfigured(): JiraFailure {
  return fail("not_configured", "Jira is not configured for this service.");
}

// Jira reports validation problems as { errorMessages: string[], errors: { field: message } }.
function describeJiraBody(text: string): string {
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === "object") {
      const { errorMessages, errors } = body as {
        errorMessages?: unknown;
        errors?: unknown;
      };
      const parts: string[] = [];
      if (Array.isArray(errorMessages)) {
        parts.push(...errorMessages.filter((m): m is string => typeof m === "string"));
      }
      if (errors && typeof errors === "object") {
        for (const [field, msg] of Object.entries(errors)) {
          if (typeof msg === "string") parts.push(`${field}: ${msg}`);
        }
      }
      return parts.join("; ");
    }
  } catch {
    // Not JSON (e.g. an HTML error page from a proxy); fall through.
  }
  return "";
}

type HttpOk = { ok: true; status: number; text: string };

// Per-call tweaks to the shared status mapping.
interface RequestOptions {
  // What a 400 means for this call. Default: field_not_editable on PUT, jira_error otherwise.
  badRequestReason?: JiraErrorReason;
  // Replaces the issue-centric default 404 text (board and project lookups are not issues).
  notFoundMessage?: string;
}

// JQL string literals: backslash and double quote must be escaped inside "...".
function jqlQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// `text ~` is parsed as Lucene, so a query like "foo(bar)" or "a:b" made Jira answer 400.
// Jira's analyzer splits words on these characters anyway, so spaces find the same tickets
// and avoid depending on Jira's own escape rules.
function luceneSafe(value: string): string {
  return value
    .replace(/[+\-&|!(){}[\]^~*?\\:"/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface RawComment {
  id?: unknown;
  author?: { displayName?: unknown } | null;
  created?: unknown;
  renderedBody?: unknown;
}

interface RawHistoryItem {
  field?: unknown;
  fieldId?: unknown;
  fromString?: unknown;
  // Read only after a typeof string check, which keeps Object.prototype.toString out.
  toString?: unknown;
}

interface RawHistoryEntry {
  id?: unknown;
  author?: { displayName?: unknown } | null;
  created?: unknown;
  items?: unknown;
}

export function createJiraClient(opts: JiraClientOptions): JiraClient {
  const baseUrl = opts.baseUrl.replace(/\/$/, "");
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // Built once and only ever placed in the request header; never in a message or log.
  const authorization = `Basic ${Buffer.from(`${opts.email}:${opts.token}`).toString("base64")}`;

  async function request(
    method: "GET" | "PUT" | "POST",
    path: string,
    body?: unknown,
    reqOpts: RequestOptions = {},
  ): Promise<HttpOk | JiraFailure> {
    const headers: Record<string, string> = {
      Authorization: authorization,
      Accept: "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // Timeouts (TimeoutError/AbortError) and network failures (TypeError) all mean
      // "could not reach Jira". Only the error name is reported, never its message,
      // since undici messages can embed request details.
      const name = err instanceof Error ? err.name : "Error";
      return fail("unreachable", `Could not reach Jira (${name}).`);
    }

    if (res.status >= 200 && res.status < 300) {
      return { ok: true, status: res.status, text: await res.text().catch(() => "") };
    }

    const detail = describeJiraBody(await res.text().catch(() => ""));
    const withDetail = (base: string) => (detail ? `${base}: ${detail}` : base);
    switch (res.status) {
      case 401:
        return fail("bad_credentials", "Jira rejected the credentials (401).");
      case 403:
        return fail("forbidden", "The Jira account lacks permission for this action (403).");
      case 404:
        return fail(
          "not_found",
          reqOpts.notFoundMessage ?? "Jira issue not found, or not visible to this account (404).",
        );
      case 429:
        return fail("rate_limited", "Jira rate limit hit (429). Try again shortly.");
      case 400:
        if (reqOpts.badRequestReason) {
          return fail(reqOpts.badRequestReason, withDetail("Jira returned HTTP 400"));
        }
        // A 400 on a write is almost always "field not on the edit screen" or a bad value.
        if (method === "PUT") {
          return fail("field_not_editable", withDetail("Jira refused the update (400)"));
        }
        return fail("jira_error", withDetail("Jira returned HTTP 400"));
      default:
        return fail("jira_error", withDetail(`Jira returned HTTP ${res.status}`));
    }
  }

  async function discoverFieldId(): Promise<Result<string>> {
    const res = await request("GET", "/rest/api/3/field");
    if (!res.ok) return res;
    try {
      const fields: unknown = JSON.parse(res.text);
      if (Array.isArray(fields)) {
        const customNamed = (name: string) =>
          fields.find(
            (f: { custom?: unknown; name?: unknown; id?: unknown }) =>
              f?.custom === true && f.name === name && typeof f.id === "string",
          );
        const found = customNamed("Story Points") ?? customNamed("Story point estimate");
        if (found) return { ok: true, value: found.id as string };
      }
    } catch {
      return fail("jira_error", "Jira returned an unreadable field list.");
    }
    return fail(
      "no_points_field",
      'No custom field named "Story Points" or "Story point estimate".',
    );
  }

  let cachedFieldId: Promise<Result<string>> | null = null;

  function storyPointsFieldId(): Promise<Result<string>> {
    if (opts.fieldOverride) {
      return Promise.resolve({ ok: true, value: opts.fieldOverride });
    }
    if (!cachedFieldId) {
      // Concurrent callers share this one request. Failures are evicted so a transient
      // error (or a field added later) does not stick for the life of the process.
      const p: Promise<Result<string>> = discoverFieldId().then(
        (r) => {
          if (!r.ok && cachedFieldId === p) cachedFieldId = null;
          return r;
        },
        (err: unknown) => {
          if (cachedFieldId === p) cachedFieldId = null;
          throw err;
        },
      );
      cachedFieldId = p;
    }
    return cachedFieldId;
  }

  function renderDescription(html: unknown): string | null {
    if (typeof html !== "string" || html.trim() === "") return null;
    return capSanitizedHtml(sanitizeJiraHtml(html, baseUrl), baseUrl, MAX_DESCRIPTION_CHARS);
  }

  // Maps the comment endpoint's page. It is requested newest first (see fetchComments), so the
  // list is reversed here to give the oldest-first order the UI shows.
  function buildComments(raw: RawComment[]): TicketComment[] {
    return raw
      .map((c, i): TicketComment => {
        const body = c.renderedBody;
        return {
          id: typeof c.id === "string" ? c.id : String(i),
          author: typeof c.author?.displayName === "string" ? c.author.displayName : "Unknown",
          createdAt: typeof c.created === "string" ? c.created : "",
          bodyHtml:
            typeof body === "string"
              ? capSanitizedHtml(sanitizeJiraHtml(body, baseUrl), baseUrl, MAX_COMMENT_CHARS)
              : "",
        };
      })
      .reverse();
  }

  // expand=renderedFields on the issue does not put renderedBody on comments (that property
  // exists only on the comment endpoint, with expand=renderedBody), so every comment came back
  // with an empty body. orderBy=-created with maxResults=MAX_COMMENTS returns exactly the latest
  // MAX_COMMENTS in one request, so no paging is needed. A failure here must not fail the ticket
  // load: players can still vote without the comments, so it degrades to none.
  async function fetchComments(key: string): Promise<TicketComment[]> {
    const res = await request(
      "GET",
      `/rest/api/3/issue/${encodeURIComponent(key)}/comment?orderBy=-created&maxResults=${MAX_COMMENTS}&expand=renderedBody`,
    );
    if (!res.ok) {
      opts.logger?.debug({ key, reason: res.reason }, "jira comments fetch failed");
      return [];
    }
    const page = parseJson(res.text) as { comments?: unknown } | undefined;
    if (!page || !Array.isArray(page.comments)) {
      opts.logger?.debug({ key }, "jira comments unreadable");
      return [];
    }
    return buildComments(page.comments.slice(0, MAX_COMMENTS) as RawComment[]);
  }

  function buildHistoryChange(item: RawHistoryItem): TicketHistoryChange | null {
    if (typeof item.field !== "string") return null;
    const from = typeof item.fromString === "string" ? item.fromString : null;
    const to = typeof item.toString === "string" ? item.toString : null;
    const edited =
      EDITED_FIELDS.has(item.field.toLowerCase()) ||
      (typeof item.fieldId === "string" && EDITED_FIELDS.has(item.fieldId.toLowerCase())) ||
      (from?.length ?? 0) > MAX_HISTORY_VALUE_CHARS ||
      (to?.length ?? 0) > MAX_HISTORY_VALUE_CHARS;
    // Values are dropped for edited changes so long text never reaches the client.
    return { field: item.field, from: edited ? null : from, to: edited ? null : to, edited };
  }

  // Input is oldest first (Jira's order); output is newest first. Entries with no usable
  // changes are dropped, since the History tab would show an empty block.
  function buildHistory(raw: RawHistoryEntry[]): TicketHistoryEntry[] {
    const entries: TicketHistoryEntry[] = [];
    raw.forEach((e, i) => {
      const items = Array.isArray(e?.items) ? (e.items as RawHistoryItem[]) : [];
      const changes = items
        .map((item) => (item && typeof item === "object" ? buildHistoryChange(item) : null))
        .filter((c): c is TicketHistoryChange => c !== null);
      if (changes.length === 0) return;
      entries.push({
        id: typeof e.id === "string" ? e.id : String(i),
        author: typeof e.author?.displayName === "string" ? e.author.displayName : "Unknown",
        createdAt: typeof e.created === "string" ? e.created : "",
        changes,
      });
    });
    return entries.reverse();
  }

  // The changelog endpoint is oldest first and has no sort option, so the newest
  // MAX_HISTORY_ENTRIES are reached by reading `total` from the first page and paging from
  // total - MAX_HISTORY_ENTRIES. Like comments, any failure (including a later page) degrades to
  // an empty history instead of failing the ticket load, because a half-read list would silently
  // skip changes. Only counts and the failure reason are logged.
  async function fetchHistory(
    key: string,
  ): Promise<{ history: TicketHistoryEntry[]; truncated: boolean }> {
    const empty = { history: [], truncated: false };
    const path = `/rest/api/3/issue/${encodeURIComponent(key)}/changelog`;

    let startAt = 0;
    let wanted = MAX_HISTORY_ENTRIES;
    let start = 0;
    let probed = false;
    let windowRequests = 0;
    const raw: RawHistoryEntry[] = [];

    // The first request only learns `total`; it does not count against the window budget unless
    // its page is reused (start is 0).
    while (windowRequests < MAX_HISTORY_REQUESTS) {
      const res = await request(
        "GET",
        `${path}?startAt=${startAt}&maxResults=${MAX_HISTORY_ENTRIES}`,
      );
      if (!res.ok) {
        opts.logger?.debug({ key, reason: res.reason }, "jira changelog fetch failed");
        return empty;
      }
      const page = parseJson(res.text) as
        | { total?: unknown; values?: unknown; isLast?: unknown }
        | undefined;
      if (!page || !Array.isArray(page.values) || typeof page.total !== "number") {
        opts.logger?.debug({ key }, "jira changelog unreadable");
        return empty;
      }

      if (!probed) {
        probed = true;
        start = Math.max(0, page.total - MAX_HISTORY_ENTRIES);
        wanted = page.total - start;
        if (start > 0) {
          // The probe began before the window, so discard it and restart at the window.
          startAt = start;
          continue;
        }
      }

      windowRequests += 1;
      raw.push(...(page.values as RawHistoryEntry[]));
      if (raw.length >= wanted) break;
      // An empty page or isLast before the window is full means entries are missing.
      if (page.isLast === true || page.values.length === 0) break;
      startAt += page.values.length;
    }

    // A short read could omit the newest changes while looking complete, so show none.
    if (raw.length < wanted) {
      opts.logger?.debug(
        { key, reason: "short_read", read: raw.length, wanted },
        "jira changelog short",
      );
      return empty;
    }

    const history = buildHistory(raw.slice(-MAX_HISTORY_ENTRIES));
    opts.logger?.debug(
      { key, read: raw.length, kept: history.length, truncated: start > 0 },
      "jira changelog read",
    );
    return { history, truncated: start > 0 };
  }

  async function getIssue(key: string): Promise<Result<Ticket>> {
    // Discovery failure must not block reads: players can still vote on a ticket whose
    // current points we cannot show. Only saving hard-requires the field id.
    const field = await storyPointsFieldId();
    const fieldId = field.ok ? field.value : null;
    const fields = fieldId ? `${BASE_FIELDS},${fieldId}` : BASE_FIELDS;

    // expand=renderedFields makes Jira return the description as HTML (the v3 API otherwise
    // gives Atlassian Document Format JSON). Comments come from their own endpoint.
    const res = await request(
      "GET",
      `/rest/api/3/issue/${encodeURIComponent(key)}?fields=${fields}&expand=renderedFields`,
    );
    if (!res.ok) return res;

    try {
      const data = JSON.parse(res.text) as {
        key: string;
        fields: {
          summary: string;
          issuetype: { name: string };
          status: { name: string };
          assignee?: { displayName?: unknown } | null;
          priority?: { name?: unknown } | null;
          labels?: unknown;
          [fieldId: string]: unknown;
        };
        renderedFields?: { description?: unknown } | null;
      };
      const raw = fieldId ? data.fields[fieldId] : null;
      // If renderedFields is missing, degrade to no description rather than failing the whole
      // load: players can still vote on the summary alone.
      const descriptionHtml = renderDescription(data.renderedFields?.description);
      const [comments, changelog] = await Promise.all([fetchComments(key), fetchHistory(key)]);
      opts.logger?.debug(
        {
          key: data.key,
          descriptionChars: descriptionHtml?.length ?? 0,
          commentCount: comments.length,
          historyCount: changelog.history.length,
          historyTruncated: changelog.truncated,
        },
        "jira issue rendered",
      );
      return {
        ok: true,
        value: {
          key: data.key,
          summary: data.fields.summary,
          issueType: data.fields.issuetype.name,
          status: data.fields.status.name,
          url: `${baseUrl}/browse/${key}`,
          currentPoints: typeof raw === "number" ? raw : null,
          descriptionHtml,
          comments,
          assignee:
            typeof data.fields.assignee?.displayName === "string"
              ? data.fields.assignee.displayName
              : null,
          priority:
            typeof data.fields.priority?.name === "string" ? data.fields.priority.name : null,
          labels: Array.isArray(data.fields.labels)
            ? data.fields.labels.filter((l): l is string => typeof l === "string")
            : [],
          history: changelog.history,
          historyTruncated: changelog.truncated,
        },
      };
    } catch {
      return fail("jira_error", "Jira returned an issue in an unexpected shape.");
    }
  }

  async function setStoryPoints(key: string, points: number): Promise<Result<void>> {
    const field = await storyPointsFieldId();
    if (!field.ok) return field;

    const res = await request("PUT", `/rest/api/3/issue/${encodeURIComponent(key)}`, {
      fields: { [field.value]: points },
    });
    if (!res.ok) return res;
    // Jira answers a successful edit with 204 No Content; any other 2xx is unexpected.
    if (res.status !== 204) {
      return fail("jira_error", `Jira returned unexpected HTTP ${res.status} for the update.`);
    }
    return { ok: true, value: undefined };
  }

  // Successful list lookups are cached per client instance. Failures are never cached.
  const listCache = new Map<string, { at: number; value: unknown }>();

  function cacheGet<T>(key: string): T | null {
    const hit = listCache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > LIST_CACHE_MS) {
      listCache.delete(key);
      return null;
    }
    return hit.value as T;
  }

  function cachePut(key: string, value: unknown): void {
    listCache.set(key, { at: Date.now(), value });
  }

  function parseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }

  async function listProjects(): Promise<Result<JiraProject[]>> {
    const cached = cacheGet<JiraProject[]>("projects");
    if (cached) return { ok: true, value: cached };

    const projects: JiraProject[] = [];
    let startAt = 0;
    // Bounded by MAX_PROJECTS, and by isLast from Jira.
    while (projects.length < MAX_PROJECTS) {
      const res = await request(
        "GET",
        `/rest/api/3/project/search?orderBy=key&maxResults=100&startAt=${startAt}`,
        undefined,
        { notFoundMessage: "Jira project list not found (404)." },
      );
      if (!res.ok) return res;
      const page = parseJson(res.text) as
        | { values?: { key?: unknown; name?: unknown }[]; isLast?: unknown }
        | undefined;
      if (!page || !Array.isArray(page.values)) {
        return fail("jira_error", "Jira returned an unreadable project list.");
      }
      for (const p of page.values) {
        if (typeof p.key === "string" && typeof p.name === "string") {
          projects.push({ key: p.key, name: p.name });
        }
      }
      if (page.isLast === true || page.values.length === 0) break;
      startAt += page.values.length;
    }
    const value = projects.slice(0, MAX_PROJECTS);
    cachePut("projects", value);
    return { ok: true, value };
  }

  async function listBoards(projectKey: string): Promise<Result<JiraBoard[]>> {
    const cacheKey = `boards:${projectKey}`;
    const cached = cacheGet<JiraBoard[]>(cacheKey);
    if (cached) return { ok: true, value: cached };

    const boards: JiraBoard[] = [];
    let startAt = 0;
    while (boards.length < MAX_BOARDS) {
      const res = await request(
        "GET",
        `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}&maxResults=50&startAt=${startAt}`,
        undefined,
        {
          notFoundMessage: `Jira project ${projectKey} not found, or not visible to this account (404).`,
        },
      );
      if (!res.ok) return res;
      const page = parseJson(res.text) as
        | { values?: { id?: unknown; name?: unknown; type?: unknown }[]; isLast?: unknown }
        | undefined;
      if (!page || !Array.isArray(page.values)) {
        return fail("jira_error", "Jira returned an unreadable board list.");
      }
      for (const b of page.values) {
        if (typeof b.id === "number" && typeof b.name === "string") {
          boards.push({ id: b.id, name: b.name, type: typeof b.type === "string" ? b.type : "" });
        }
      }
      if (page.isLast === true || page.values.length === 0) break;
      startAt += page.values.length;
    }
    const value = boards.slice(0, MAX_BOARDS);
    cachePut(cacheKey, value);
    return { ok: true, value };
  }

  // The board type decides how the queue is sectioned: scrum boards have sprints, kanban
  // boards do not. Cached like the other board lookups.
  async function boardType(boardId: number): Promise<Result<string>> {
    const cacheKey = `boardType:${boardId}`;
    const cached = cacheGet<string>(cacheKey);
    if (cached !== null) return { ok: true, value: cached };

    const res = await request("GET", `/rest/agile/1.0/board/${boardId}/configuration`, undefined, {
      notFoundMessage: boardNotFound(boardId),
    });
    if (!res.ok) return res;
    const config = parseJson(res.text) as { type?: unknown } | undefined;
    if (!config) return fail("jira_error", "Jira returned an unreadable board configuration.");
    const value = typeof config.type === "string" ? config.type.toLowerCase() : "";
    cachePut(cacheKey, value);
    return { ok: true, value };
  }

  function boardNotFound(boardId: number): string {
    return `Jira board ${boardId} not found, or not visible to this account (404).`;
  }

  // Sections are `Result`s all the way down: the first failed section fails the refresh, so
  // the queue is never partial.
  async function searchQueue(settings: QueueSettings): Promise<Result<QueueSection[]>> {
    // ws.ts never calls this without a project. If something does, say what is missing rather
    // than "Jira is not configured", which sent people checking the env vars.
    if (settings.projectKey === null) return fail("jira_error", "No project selected.");

    // Prefer the field id (cf[NNNNN]) when we know it: it is immune to renamed or duplicate
    // fields. Discovery failure is not fatal here, the field name works in most sites.
    const field = await storyPointsFieldId();
    const idMatch = field.ok ? /^customfield_(\d+)$/.exec(field.value) : null;
    const pointsField = idMatch ? `cf[${idMatch[1]}]` : '"Story Points"';

    // A ticket needs pointing when it is not Done and has no Story Points. Any To Do status
    // counts (Untriaged and Backlog alike); a label filter used to hide unpointed Backlog
    // tickets, so it was removed (decision log, 10/15/2026).
    const clause = `statusCategory != Done AND ${pointsField} is EMPTY`;

    if (settings.boardId === null) {
      const found = await searchIssues(
        `project = ${jqlQuote(settings.projectKey)} AND ${clause} ORDER BY Rank ASC`,
        QUEUE_PAGE_SIZE,
      );
      if (!found.ok) return found;
      const { items, more } = found.value;
      // /search/jql has no total, so only ask for a count when the page was full.
      let total = items.length;
      if (more) {
        const counted = await approximateCount(
          `project = ${jqlQuote(settings.projectKey)} AND ${clause}`,
        );
        if (counted.ok) total = Math.max(counted.value, items.length);
      }
      const all: QueueSection = { id: "all", name: "Tickets", kind: "all", total, items };
      return { ok: true, value: total === 0 ? [] : [all] };
    }

    // With a board, the Agile API mirrors the board's backlog page: it applies the board's own
    // filter and returns issues in rank order, per sprint and for the backlog. That needs one
    // endpoint per section, so boards no longer share the single JQL search used above.
    const boardId = settings.boardId;
    const type = await boardType(boardId);
    if (!type.ok) return type;

    const sections = await (type.value === "scrum"
      ? scrumSections(boardId, clause)
      : otherSections(boardId, clause));
    if (!sections.ok) return sections;
    return { ok: true, value: sections.value.filter((section) => section.total > 0) };
  }

  async function scrumSections(boardId: number, clause: string): Promise<Result<QueueSection[]>> {
    const sprints = await listOpenSprints(boardId);
    if (!sprints.ok) return sprints;
    // All sections load in parallel; Promise.all keeps the order of this array.
    const results = await Promise.all([
      ...sprints.value.map((sprint) =>
        boardSection(
          boardId,
          `sprint/${sprint.id}/issue`,
          clause,
          `sprint-${sprint.id}`,
          sprint.name,
          sprint.kind,
        ),
      ),
      boardSection(boardId, "backlog", clause, "backlog", "Backlog", "backlog"),
    ]);
    return collect(results);
  }

  async function otherSections(boardId: number, clause: string): Promise<Result<QueueSection[]>> {
    const backlog = await boardSection(boardId, "backlog", clause, "backlog", "Backlog", "backlog");
    if (backlog.ok) return { ok: true, value: [backlog.value] };
    // A kanban board with its backlog disabled rejects /backlog; its issues are still readable.
    const all = await boardSection(boardId, "issue", clause, "all", "Tickets", "all");
    return all.ok ? { ok: true, value: [all.value] } : all;
  }

  function collect(results: Result<QueueSection>[]): Result<QueueSection[]> {
    const value: QueueSection[] = [];
    for (const r of results) {
      if (!r.ok) return r;
      value.push(r.value);
    }
    return { ok: true, value };
  }

  async function listOpenSprints(
    boardId: number,
  ): Promise<Result<{ id: number; name: string; kind: "active" | "future" }[]>> {
    const sprints: { id: number; name: string; kind: "active" | "future" }[] = [];
    let startAt = 0;
    while (sprints.length < MAX_SPRINTS) {
      const res = await request(
        "GET",
        `/rest/agile/1.0/board/${boardId}/sprint?state=active,future&maxResults=50&startAt=${startAt}`,
        undefined,
        { notFoundMessage: boardNotFound(boardId) },
      );
      if (!res.ok) return res;
      const page = parseJson(res.text) as
        | { values?: { id?: unknown; name?: unknown; state?: unknown }[]; isLast?: unknown }
        | undefined;
      if (!page || !Array.isArray(page.values)) {
        return fail("jira_error", "Jira returned an unreadable sprint list.");
      }
      for (const sp of page.values) {
        if (typeof sp.id === "number" && typeof sp.name === "string") {
          sprints.push({
            id: sp.id,
            name: sp.name,
            kind: sp.state === "active" ? "active" : "future",
          });
        }
      }
      if (page.isLast === true || page.values.length === 0) break;
      startAt += page.values.length;
    }
    // The API already lists sprints in page order; this only makes sure active ones lead.
    const capped = sprints.slice(0, MAX_SPRINTS);
    return {
      ok: true,
      value: [
        ...capped.filter((x) => x.kind === "active"),
        ...capped.filter((x) => x.kind === "future"),
      ],
    };
  }

  // One Agile API list (a sprint's issues, the backlog, or all board issues). Rank order is
  // the endpoints' default, so no ORDER BY, and the board's own filter is already applied.
  async function boardSection(
    boardId: number,
    endpoint: string,
    clause: string,
    id: string,
    name: string,
    kind: QueueSection["kind"],
  ): Promise<Result<QueueSection>> {
    const res = await request(
      "GET",
      `/rest/agile/1.0/board/${boardId}/${endpoint}?jql=${encodeURIComponent(clause)}&maxResults=${QUEUE_PAGE_SIZE}&fields=summary,issuetype,status`,
      undefined,
      { notFoundMessage: boardNotFound(boardId) },
    );
    if (!res.ok) return res;
    const data = parseJson(res.text) as { issues?: unknown; total?: unknown } | undefined;
    const items = data ? parseIssues(data.issues) : undefined;
    if (!data || !items) {
      return fail("jira_error", "Jira returned board issues in an unexpected shape.");
    }
    const total =
      typeof data.total === "number" ? Math.max(data.total, items.length) : items.length;
    return { ok: true, value: { id, name, kind, total, items } };
  }

  function parseIssues(issues: unknown): QueueItem[] | undefined {
    if (!Array.isArray(issues)) return undefined;
    const items: QueueItem[] = [];
    for (const issue of issues as {
      key?: unknown;
      fields?: {
        summary?: unknown;
        issuetype?: { name?: unknown };
        status?: { name?: unknown };
      };
    }[]) {
      if (typeof issue.key !== "string") continue;
      items.push({
        key: issue.key,
        summary: typeof issue.fields?.summary === "string" ? issue.fields.summary : "",
        issueType:
          typeof issue.fields?.issuetype?.name === "string" ? issue.fields.issuetype.name : "",
        status: typeof issue.fields?.status?.name === "string" ? issue.fields.status.name : "",
        url: `${baseUrl}/browse/${issue.key}`,
      });
    }
    return items;
  }

  async function approximateCount(jql: string): Promise<Result<number>> {
    const res = await request("POST", "/rest/api/3/search/approximate-count", { jql });
    if (!res.ok) return res;
    const data = parseJson(res.text) as { count?: unknown } | undefined;
    if (typeof data?.count !== "number") {
      return fail("jira_error", "Jira returned an unreadable ticket count.");
    }
    return { ok: true, value: data.count };
  }

  // /rest/api/3/search is deprecated; /search/jql pages with nextPageToken. One page is
  // enough for a picker, so the token is ignored; `more` says whether a next page exists.
  async function searchIssues(
    jql: string,
    maxResults: number,
  ): Promise<Result<{ items: QueueItem[]; more: boolean }>> {
    const res = await request("POST", "/rest/api/3/search/jql", {
      jql,
      fields: ["summary", "issuetype", "status"],
      maxResults,
    });
    if (!res.ok) return res;

    const data = parseJson(res.text) as { issues?: unknown; nextPageToken?: unknown } | undefined;
    const items = data ? parseIssues(data.issues) : undefined;
    if (!data || !items) {
      return fail("jira_error", "Jira returned search results in an unexpected shape.");
    }
    return { ok: true, value: { items, more: typeof data.nextPageToken === "string" } };
  }

  async function runSearch(jql: string, maxResults: number): Promise<Result<QueueItem[]>> {
    const found = await searchIssues(jql, maxResults);
    return found.ok ? { ok: true, value: found.value.items } : found;
  }

  async function searchTickets(
    projectKey: string | null,
    query: string,
  ): Promise<Result<QueueItem[]>> {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      return fail("query_too_short", `Type at least ${MIN_QUERY_LENGTH} characters to search.`);
    }
    // An exact key is looked up directly (in any project), and so is a bare number when the
    // room has a project; anything else is a prefix text search, scoped to the room's project
    // when one is set. Without the expansion "14417" became text ~ "14417*" and found nothing.
    const key = expandBareIssueNumber(q, projectKey);
    if (ISSUE_KEY.test(key)) {
      return runSearch(
        `key = ${jqlQuote(key.toUpperCase())} AND statusCategory != Done ORDER BY updated DESC`,
        SEARCH_PAGE_SIZE,
      );
    }
    const text = luceneSafe(q);
    if (text.length < MIN_QUERY_LENGTH) {
      return fail("query_too_short", `Type at least ${MIN_QUERY_LENGTH} characters to search.`);
    }
    const scope = projectKey === null ? "" : `project = ${jqlQuote(projectKey)} AND `;
    return runSearch(
      `${scope}text ~ ${jqlQuote(`${text}*`)} AND statusCategory != Done ORDER BY updated DESC`,
      SEARCH_PAGE_SIZE,
    );
  }

  return {
    storyPointsFieldId,
    getIssue,
    setStoryPoints,
    listProjects,
    listBoards,
    boardType,
    searchQueue,
    searchTickets,
  };
}
