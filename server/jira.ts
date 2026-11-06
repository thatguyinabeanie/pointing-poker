import { expandBareIssueNumber, ISSUE_KEY, MIN_QUERY_LENGTH } from "../shared/constants.ts";
import type {
  EpicColor,
  JiraBoard,
  JiraProject,
  QueueEpic,
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
  listIssueTypes(projectKey: string): Promise<Result<string[]>>;
  listEpics(settings: QueueSettings): Promise<Result<QueueEpic[]>>;
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
  logger?: { debug(obj: object, msg: string): void; warn(obj: object, msg: string): void };
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
// The epic list reads the parents of up to this many tickets that need points. A bigger queue
// misses the epics of its lowest-ranked tickets, which is accepted over an unbounded scan.
const MAX_EPIC_SCAN = 1000;
const EPIC_SCAN_PAGE_SIZE = 100;
// The project's open epics, listed under the queue's epics so the menu can search all of them.
const MAX_OPEN_EPICS = 1000;
const QUEUE_PAGE_SIZE = 50;
const MAX_SPRINTS = 50;
const SEARCH_PAGE_SIZE = 10;
// Jira's JQL length and result limits are generous at 100 keys, and a queue holds far fewer.
const EPIC_COLOR_CHUNK = 100;
const EPIC_COLORS: ReadonlySet<string> = new Set<EpicColor>([
  "purple",
  "blue",
  "green",
  "teal",
  "yellow",
  "orange",
  "grey",
  "dark_purple",
  "dark_blue",
  "dark_green",
  "dark_teal",
  "dark_yellow",
  "dark_orange",
  "dark_grey",
]);
// The legacy "Epic Color" field holds ghx-label-N. Jira does not document the palette, so this
// table is approximate: it was matched by eye to the board's epic labels.
const GHX_EPIC_COLORS: Readonly<Record<string, EpicColor>> = {
  "ghx-label-1": "dark_orange",
  "ghx-label-2": "orange",
  "ghx-label-3": "yellow",
  "ghx-label-4": "blue",
  "ghx-label-5": "dark_grey",
  "ghx-label-6": "green",
  "ghx-label-7": "purple",
  "ghx-label-8": "dark_purple",
  "ghx-label-9": "orange",
  "ghx-label-10": "blue",
  "ghx-label-11": "teal",
  "ghx-label-12": "grey",
  "ghx-label-13": "dark_green",
  "ghx-label-14": "dark_yellow",
};

interface FieldInfo {
  id: string;
  name: string;
  custom: boolean;
}

/** Exact-name lookup among custom fields. */
function customFieldId(fields: FieldInfo[], name: string): string | null {
  return fields.find((f) => f.custom && f.name === name)?.id ?? null;
}

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

interface RawParent {
  key?: unknown;
  fields?: { summary?: unknown; issuetype?: { name?: unknown; hierarchyLevel?: unknown } };
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

  async function readFields(): Promise<Result<FieldInfo[]>> {
    const res = await request("GET", "/rest/api/3/field");
    if (!res.ok) return res;
    let raw: unknown;
    try {
      raw = JSON.parse(res.text);
    } catch {
      return fail("jira_error", "Jira returned an unreadable field list.");
    }
    const fields: FieldInfo[] = [];
    // A non-array body yields an empty list, so callers report "field not found" as before.
    if (Array.isArray(raw)) {
      for (const f of raw as { custom?: unknown; name?: unknown; id?: unknown }[]) {
        if (typeof f?.id === "string" && typeof f.name === "string") {
          fields.push({ id: f.id, name: f.name, custom: f.custom === true });
        }
      }
    }
    return { ok: true, value: fields };
  }

  let cachedFields: Promise<Result<FieldInfo[]>> | null = null;

  // Story Points discovery and the epic color fields share one /field request. Concurrent
  // callers share it, and failures are evicted so a transient error does not stick.
  function listFields(): Promise<Result<FieldInfo[]>> {
    if (!cachedFields) {
      const p: Promise<Result<FieldInfo[]>> = readFields().then(
        (r) => {
          if (!r.ok && cachedFields === p) cachedFields = null;
          return r;
        },
        (err: unknown) => {
          if (cachedFields === p) cachedFields = null;
          throw err;
        },
      );
      cachedFields = p;
    }
    return cachedFields;
  }

  async function discoverFieldId(retried = false): Promise<Result<string>> {
    // The epic color lookup may have cached a list from before a Story Points field was
    // added, so a miss on a list this call did not fetch re-reads /field once before failing.
    const fresh = cachedFields === null;
    const listed = listFields();
    const fields = await listed;
    if (!fields.ok) return fields;
    const id =
      customFieldId(fields.value, "Story Points") ??
      customFieldId(fields.value, "Story point estimate");
    if (id) return { ok: true, value: id };
    // Evict like any other failure so a Story Points field added later is found on the next
    // call. The identity check keeps a newer in-flight list from being dropped.
    if (cachedFields === listed) cachedFields = null;
    if (!fresh && !retried) return discoverFieldId(true);
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

  // The Type filter's menu. The project endpoint lists the types the project's scheme allows,
  // which is the set `issuetype in (...)` accepts for this project. Cached like the boards.
  async function listIssueTypes(projectKey: string): Promise<Result<string[]>> {
    const cacheKey = `issueTypes:${projectKey}`;
    const cached = cacheGet<string[]>(cacheKey);
    if (cached) return { ok: true, value: cached };

    const res = await request(
      "GET",
      `/rest/api/3/project/${encodeURIComponent(projectKey)}`,
      undefined,
      {
        notFoundMessage: `Jira project ${projectKey} not found, or not visible to this account (404).`,
      },
    );
    if (!res.ok) return res;
    const project = parseJson(res.text) as { issueTypes?: { name?: unknown }[] } | undefined;
    if (!project || !Array.isArray(project.issueTypes)) {
      return fail("jira_error", "Jira returned an unreadable issue type list.");
    }
    // A Set keeps Jira's order. Team-managed projects can list two types with one name, and the
    // menu and the JQL work by name, so a repeat would only be a duplicate menu row.
    const names = new Set<string>();
    for (const t of project.issueTypes) {
      if (typeof t?.name === "string" && t.name.trim() !== "") names.add(t.name);
    }
    const value = [...names];
    cachePut(cacheKey, value);
    return { ok: true, value };
  }

  // The project's open epics, key and name only, in rank order. Cached like the other lists,
  // because it does not follow the queue (the queue's own epics are scanned on every call).
  async function listOpenEpics(
    projectKey: string,
  ): Promise<Result<{ key: string; name: string }[]>> {
    const cacheKey = `openEpics:${projectKey}`;
    const cached = cacheGet<{ key: string; name: string }[]>(cacheKey);
    if (cached) return { ok: true, value: cached };

    const jql = `project = ${jqlQuote(projectKey)} AND issuetype = Epic AND statusCategory != Done ORDER BY Rank ASC`;
    const value: { key: string; name: string }[] = [];
    let pageToken: string | undefined;
    while (value.length < MAX_OPEN_EPICS) {
      const found = await searchIssues(
        jql,
        Math.min(EPIC_SCAN_PAGE_SIZE, MAX_OPEN_EPICS - value.length),
        ["summary"],
        pageToken,
      );
      if (!found.ok) return found;
      for (const item of found.value.items) value.push({ key: item.key, name: item.summary });
      // An empty page with a token would repeat forever, so it ends the loop too.
      if (found.value.nextPageToken === null || found.value.items.length === 0) break;
      pageToken = found.value.nextPageToken;
    }
    cachePut(cacheKey, value);
    return { ok: true, value };
  }

  // The Epic filter's menu: first the epics of the tickets that still need points, in the order
  // they first appear in the queue (rank order, inQueue true), then every other open epic of the
  // project (inQueue false, rank order). The queue epics come from a scan because CIVIS has more
  // than 100 open epics, and the first 100 left out the epics of the queued tickets (decision 52);
  // the open list below them is what the menu's search looks through. The Type filter applies to
  // the scan, so the top group matches the queue; the Epic filter does not, or picking one epic
  // would shrink the menu to that epic. The scan is not cached, because it must follow the queue.
  async function listEpics(settings: QueueSettings): Promise<Result<QueueEpic[]>> {
    if (settings.projectKey === null) return { ok: true, value: [] };
    const projectKey = settings.projectKey;
    const clause = await needsPointingClause(settings);
    const jql = `project = ${jqlQuote(projectKey)} AND ${clause} AND parent is not EMPTY ORDER BY Rank ASC`;

    // A Map keeps the first appearance of each epic. A sub-task's story parent is not an epic,
    // so parseEpic leaves it out.
    const epics = new Map<string, QueueEpic>();
    let scanned = 0;
    let pageToken: string | undefined;
    let more = false;
    while (scanned < MAX_EPIC_SCAN) {
      const found = await searchIssues(
        jql,
        Math.min(EPIC_SCAN_PAGE_SIZE, MAX_EPIC_SCAN - scanned),
        ["parent"],
        pageToken,
      );
      if (!found.ok) return found;
      for (const item of found.value.items) {
        if (item.epic && !epics.has(item.epic.key)) {
          epics.set(item.epic.key, { ...item.epic, inQueue: true });
        }
      }
      scanned += found.value.items.length;
      more = found.value.nextPageToken !== null;
      // An empty page with a token would repeat forever, so it ends the scan too.
      if (found.value.nextPageToken === null || found.value.items.length === 0) break;
      pageToken = found.value.nextPageToken;
    }
    // A full scan with a next page means the top group is missing some epics; leave a trace.
    if (scanned >= MAX_EPIC_SCAN && more) {
      opts.logger?.debug({ scanned, epics: epics.size }, "jira epic scan capped");
    }

    // The open-epics list is a convenience. A project with no "Epic" issue type answers 400, and
    // then the menu lists only the queue's epics: one warn line, no error for the user. A selected
    // epic whose tickets are all pointed is then not listed, so the room drops it (setEpics).
    const open = await listOpenEpics(projectKey);
    if (open.ok) {
      for (const epic of open.value) {
        if (!epics.has(epic.key)) {
          epics.set(epic.key, { key: epic.key, name: epic.name, color: null, inQueue: false });
        }
      }
    } else {
      opts.logger?.warn({ reason: open.reason, projectKey }, "jira open epics unavailable");
    }

    const colors = await epicColors([...epics.keys()]);
    const value = [...epics.values()].map((epic) => ({
      ...epic,
      color: colors.get(epic.key) ?? null,
    }));
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

  // The queue's needs-pointing clause, shared with listEpics so the Epic menu and the queue
  // cannot drift apart. The Type filter joins here, so the board and no-board paths, the count
  // and the epic list all filter the same way, and the per-section cap applies after filtering
  // (decisions 50 and 52).
  async function needsPointingClause(settings: QueueSettings): Promise<string> {
    // Prefer the field id (cf[NNNNN]) when we know it: it is immune to renamed or duplicate
    // fields. Discovery failure is not fatal here, the field name works in most sites.
    const field = await storyPointsFieldId();
    const idMatch = field.ok ? /^customfield_(\d+)$/.exec(field.value) : null;
    const pointsField = idMatch ? `cf[${idMatch[1]}]` : '"Story Points"';
    // A ticket needs pointing when it is not Done and has no Story Points. Any To Do status
    // counts (Untriaged and Backlog alike); a label filter used to hide unpointed Backlog
    // tickets, so it was removed (decision log, 10/15/2026).
    const typeFilter =
      settings.issueTypes.length > 0
        ? ` AND issuetype in (${settings.issueTypes.map(jqlQuote).join(", ")})`
        : "";
    return `statusCategory != Done AND ${pointsField} is EMPTY${typeFilter}`;
  }

  // Sections are `Result`s all the way down: the first failed section fails the refresh, so
  // the queue is never partial.
  async function searchQueue(settings: QueueSettings): Promise<Result<QueueSection[]>> {
    // ws.ts never calls this without a project. If something does, say what is missing rather
    // than "Jira is not configured", which sent people checking the env vars.
    if (settings.projectKey === null) return fail("jira_error", "No project selected.");

    // The Epic filter is `parent in (...)`: an epic's children name it as their parent. It is
    // added here and not in needsPointingClause, because the epic menu must not shrink to the
    // epics already picked.
    const epicFilter =
      settings.epicKeys.length > 0
        ? ` AND parent in (${settings.epicKeys.map(jqlQuote).join(", ")})`
        : "";
    const clause = `${await needsPointingClause(settings)}${epicFilter}`;

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
      return {
        ok: true,
        value: total === 0 ? [] : await withEpicColors([all]),
      };
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
    return {
      ok: true,
      value: await withEpicColors(sections.value.filter((section) => section.total > 0)),
    };
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
      `/rest/agile/1.0/board/${boardId}/${endpoint}?jql=${encodeURIComponent(clause)}&maxResults=${QUEUE_PAGE_SIZE}&fields=summary,issuetype,status,parent`,
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

  // Only an epic-level parent counts: a sub-task's parent is a story, not an epic.
  // hierarchyLevel 1 is Jira's epic level; the type name is the fallback when it is missing.
  function parseEpic(parent: RawParent | null | undefined): QueueEpic | null {
    if (typeof parent?.key !== "string") return null;
    const type = parent.fields?.issuetype;
    const level = type?.hierarchyLevel;
    const isEpic =
      typeof level === "number"
        ? level === 1
        : typeof type?.name === "string" && type.name.toLowerCase() === "epic";
    if (!isEpic) return null;
    const name = parent.fields?.summary;
    // inQueue only means something in Snapshot.epics, where listEpics sets it. A queue row's epic
    // cannot know the rest of the queue, so it is false here.
    return {
      key: parent.key,
      name: typeof name === "string" ? name : "",
      color: null,
      inQueue: false,
    };
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
        parent?: RawParent;
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
        epic: parseEpic(issue.fields?.parent),
      });
    }
    return items;
  }

  // Epic colors are cosmetic, so this never rejects: whatever Jira would not give is left out
  // and the chip falls back to the neutral color. Only counts and reasons are logged.
  async function epicColors(keys: string[]): Promise<Map<string, EpicColor>> {
    const colors = new Map<string, EpicColor>();
    if (keys.length === 0) return colors;
    try {
      const fields = await listFields();
      if (!fields.ok) {
        opts.logger?.debug(
          { reason: fields.reason, keys: keys.length },
          "jira epic colors unavailable",
        );
        return colors;
      }
      const issueColorId = customFieldId(fields.value, "Issue color");
      const epicColorId = customFieldId(fields.value, "Epic Color");
      const wanted = [issueColorId, epicColorId].filter((id): id is string => id !== null);
      if (wanted.length === 0) return colors;

      const chunks: string[][] = [];
      for (let i = 0; i < keys.length; i += EPIC_COLOR_CHUNK) {
        chunks.push(keys.slice(i, i + EPIC_COLOR_CHUNK));
      }
      // Chunks run concurrently so their timeouts do not add up while the queue spinner waits.
      // bulkfetch (not `key in (...)` JQL) because JQL answers 400 for the whole list when one
      // key is deleted or hidden; bulkfetch returns the rest and lists the bad keys in
      // issueErrors, which only gets counted.
      await Promise.all(
        chunks.map(async (chunk) => {
          const res = await request("POST", "/rest/api/3/issue/bulkfetch", {
            issueIdsOrKeys: chunk,
            fields: wanted,
          });
          if (!res.ok) {
            opts.logger?.debug(
              { reason: res.reason, keys: chunk.length },
              "jira epic colors unavailable",
            );
            return;
          }
          const data = parseJson(res.text) as
            | {
                issues?: { key?: unknown; fields?: Record<string, unknown> }[];
                issueErrors?: unknown;
              }
            | undefined;
          if (!Array.isArray(data?.issues)) {
            opts.logger?.debug(
              { reason: "unreadable", keys: chunk.length },
              "jira epic colors unavailable",
            );
            return;
          }
          if (Array.isArray(data.issueErrors) && data.issueErrors.length > 0) {
            opts.logger?.debug(
              { skipped: data.issueErrors.length, keys: chunk.length },
              "jira epic colors skipped keys",
            );
          }
          for (const issue of data.issues) {
            if (typeof issue?.key !== "string") continue;
            const color = pickEpicColor(issue.fields, issueColorId, epicColorId);
            if (color) colors.set(issue.key, color);
          }
        }),
      );
    } catch (err) {
      // Only the error name, as in request(): messages can embed request details.
      opts.logger?.debug(
        { reason: err instanceof Error ? err.name : "Error", keys: keys.length },
        "jira epic colors unavailable",
      );
    }
    return colors;
  }

  // "Issue color" (team-managed) holds a name like "dark_yellow"; the legacy "Epic Color"
  // (company-managed) holds ghx-label-N. The newer field wins when both are set.
  function pickEpicColor(
    fields: Record<string, unknown> | undefined,
    issueColorId: string | null,
    epicColorId: string | null,
  ): EpicColor | null {
    const issueColor = issueColorId ? fields?.[issueColorId] : undefined;
    if (typeof issueColor === "string" && EPIC_COLORS.has(issueColor)) {
      return issueColor as EpicColor;
    }
    const legacy = epicColorId ? fields?.[epicColorId] : undefined;
    // Object.hasOwn keeps a value like "constructor" from reading Object.prototype.
    if (typeof legacy === "string" && Object.hasOwn(GHX_EPIC_COLORS, legacy)) {
      return GHX_EPIC_COLORS[legacy] ?? null;
    }
    return null;
  }

  // Copies the items, setting epic.color from the map; the inputs are not mutated.
  function applyEpicColors(items: QueueItem[], colors: Map<string, EpicColor>): QueueItem[] {
    return items.map((item) => {
      const color = item.epic ? colors.get(item.epic.key) : undefined;
      return item.epic && color ? { ...item, epic: { ...item.epic, color } } : item;
    });
  }

  async function colorsFor(lists: QueueItem[][]): Promise<Map<string, EpicColor>> {
    const keys = new Set<string>();
    for (const items of lists) {
      for (const item of items) if (item.epic) keys.add(item.epic.key);
    }
    return epicColors([...keys]);
  }

  async function colorItems(items: QueueItem[]): Promise<QueueItem[]> {
    return applyEpicColors(items, await colorsFor([items]));
  }

  async function withEpicColors<T extends { items: QueueItem[] }>(sections: T[]): Promise<T[]> {
    const colors = await colorsFor(sections.map((section) => section.items));
    return sections.map((section) => ({
      ...section,
      items: applyEpicColors(section.items, colors),
    }));
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

  // /rest/api/3/search is deprecated; /search/jql pages with nextPageToken. A picker needs one
  // page, so callers that do not pass a token get the first page and `more` says whether a next
  // one exists. listEpics passes the token back to scan on, and asks for fewer fields.
  async function searchIssues(
    jql: string,
    maxResults: number,
    fields: string[] = ["summary", "issuetype", "status", "parent"],
    pageToken?: string,
  ): Promise<Result<{ items: QueueItem[]; more: boolean; nextPageToken: string | null }>> {
    const res = await request("POST", "/rest/api/3/search/jql", {
      jql,
      fields,
      maxResults,
      ...(pageToken === undefined ? {} : { nextPageToken: pageToken }),
    });
    if (!res.ok) return res;

    const data = parseJson(res.text) as { issues?: unknown; nextPageToken?: unknown } | undefined;
    const items = data ? parseIssues(data.issues) : undefined;
    if (!data || !items) {
      return fail("jira_error", "Jira returned search results in an unexpected shape.");
    }
    const nextPageToken = typeof data.nextPageToken === "string" ? data.nextPageToken : null;
    return { ok: true, value: { items, more: nextPageToken !== null, nextPageToken } };
  }

  async function runSearch(jql: string, maxResults: number): Promise<Result<QueueItem[]>> {
    const found = await searchIssues(jql, maxResults);
    return found.ok ? { ok: true, value: await colorItems(found.value.items) } : found;
  }

  async function searchTickets(
    projectKey: string | null,
    query: string,
  ): Promise<Result<QueueItem[]>> {
    // The room's Type and Epic filters are not applied here on purpose: search is one person's
    // lookup, and it must still find any ticket, including one the queue is hiding (decisions 50
    // and 52).
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
    listIssueTypes,
    listEpics,
    boardType,
    searchQueue,
    searchTickets,
  };
}
