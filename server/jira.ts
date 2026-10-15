import type {
  JiraBoard,
  JiraProject,
  QueueItem,
  QueueSettings,
  Ticket,
  TicketComment,
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
  boardFilterId(boardId: number): Promise<Result<number>>;
  searchQueue(settings: QueueSettings, label: string): Promise<Result<QueueItem[]>>;
  removeLabel(key: string, label: string): Promise<Result<void>>;
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
const BASE_FIELDS = "summary,issuetype,status,assignee,priority,labels,description,comment";
const MAX_COMMENTS = 50;
const MAX_HTML_CHARS = 200_000;
const LIST_CACHE_MS = 10 * 60 * 1000;
const MAX_PROJECTS = 500;
const MAX_BOARDS = 500;
const QUEUE_PAGE_SIZE = 50;
const SEARCH_PAGE_SIZE = 10;
const MIN_QUERY_LENGTH = 2;
const ISSUE_KEY = /^[A-Z][A-Z0-9]+-\d+$/i;

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

interface RawComment {
  id?: unknown;
  author?: { displayName?: unknown } | null;
  created?: unknown;
}
interface RawRenderedComment {
  id?: unknown;
  renderedBody?: unknown;
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
    return capSanitizedHtml(sanitizeJiraHtml(html, baseUrl), baseUrl, MAX_HTML_CHARS);
  }

  // Jira lists comments oldest first. Rendered and raw comments are paired by id, falling
  // back to position, and only the most recent MAX_COMMENTS are kept.
  function buildComments(
    raw: RawComment[] | undefined,
    rendered: RawRenderedComment[] | undefined,
  ): TicketComment[] {
    if (!Array.isArray(raw)) return [];
    const renderedById = new Map<string, string>();
    for (const r of rendered ?? []) {
      if (typeof r?.id === "string" && typeof r.renderedBody === "string")
        renderedById.set(r.id, r.renderedBody);
    }
    const offset = Math.max(0, raw.length - MAX_COMMENTS);
    return raw.slice(offset).map((c, i): TicketComment => {
      const id = typeof c.id === "string" ? c.id : String(offset + i);
      const body = renderedById.get(id) ?? rendered?.[offset + i]?.renderedBody;
      return {
        id,
        author: typeof c.author?.displayName === "string" ? c.author.displayName : "Unknown",
        createdAt: typeof c.created === "string" ? c.created : "",
        bodyHtml:
          typeof body === "string"
            ? capSanitizedHtml(sanitizeJiraHtml(body, baseUrl), baseUrl, MAX_HTML_CHARS)
            : "",
      };
    });
  }

  async function getIssue(key: string): Promise<Result<Ticket>> {
    // Discovery failure must not block reads: players can still vote on a ticket whose
    // current points we cannot show. Only saving hard-requires the field id.
    const field = await storyPointsFieldId();
    const fieldId = field.ok ? field.value : null;
    const fields = fieldId ? `${BASE_FIELDS},${fieldId}` : BASE_FIELDS;

    // expand=renderedFields makes Jira return description and comment bodies as HTML
    // (the v3 API otherwise gives Atlassian Document Format JSON).
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
          comment?: { comments?: RawComment[] };
          [fieldId: string]: unknown;
        };
        renderedFields?: {
          description?: unknown;
          comment?: { comments?: RawRenderedComment[] };
        } | null;
      };
      const raw = fieldId ? data.fields[fieldId] : null;
      // If renderedFields is missing, degrade to no description and no comments rather
      // than failing the whole load: players can still vote on the summary alone.
      const rendered = data.renderedFields ?? undefined;
      const descriptionHtml = renderDescription(rendered?.description);
      const comments = buildComments(data.fields.comment?.comments, rendered?.comment?.comments);
      opts.logger?.debug(
        {
          key: data.key,
          descriptionChars: descriptionHtml?.length ?? 0,
          commentCount: comments.length,
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

  async function boardFilterId(boardId: number): Promise<Result<number>> {
    const cacheKey = `boardFilter:${boardId}`;
    const cached = cacheGet<number>(cacheKey);
    if (cached !== null) return { ok: true, value: cached };

    const res = await request("GET", `/rest/agile/1.0/board/${boardId}/configuration`, undefined, {
      notFoundMessage: `Jira board ${boardId} not found, or not visible to this account (404).`,
    });
    if (!res.ok) return res;
    const config = parseJson(res.text) as { filter?: { id?: unknown } } | undefined;
    // Jira returns the filter id as a string in this payload; accept either form.
    const raw = config?.filter?.id;
    const id = typeof raw === "string" ? Number(raw) : raw;
    if (typeof id !== "number" || !Number.isInteger(id)) {
      return fail("jira_error", "Jira returned a board configuration without a filter.");
    }
    cachePut(cacheKey, id);
    return { ok: true, value: id };
  }

  async function searchQueue(settings: QueueSettings, label: string): Promise<Result<QueueItem[]>> {
    if (settings.projectKey === null) return notConfigured();

    // Prefer the field id (cf[NNNNN]) when we know it: it is immune to renamed or duplicate
    // fields. Discovery failure is not fatal here, the field name works in most sites.
    const field = await storyPointsFieldId();
    const idMatch = field.ok ? /^customfield_(\d+)$/.exec(field.value) : null;
    const pointsField = idMatch ? `cf[${idMatch[1]}]` : '"Story Points"';

    let jql = `project = ${jqlQuote(settings.projectKey)} AND statusCategory != Done AND ${pointsField} is EMPTY`;
    if (settings.needsPointingOnly) jql += ` AND labels = ${jqlQuote(label)}`;
    if (settings.boardId !== null) {
      // A board is just a saved filter plus layout. Applying it through its filter id keeps
      // one JQL path for every combination of settings, instead of a second agile-API
      // endpoint (/board/{id}/issue) with different paging, ordering and field rules.
      const filter = await boardFilterId(settings.boardId);
      if (!filter.ok) return filter;
      jql += ` AND filter = ${filter.value}`;
    }
    jql += " ORDER BY Rank ASC";

    return runSearch(jql, QUEUE_PAGE_SIZE);
  }

  // /rest/api/3/search is deprecated; /search/jql pages with nextPageToken. One page is
  // enough for a picker, so the token is ignored.
  async function runSearch(jql: string, maxResults: number): Promise<Result<QueueItem[]>> {
    const res = await request("POST", "/rest/api/3/search/jql", {
      jql,
      fields: ["summary", "issuetype", "status"],
      maxResults,
    });
    if (!res.ok) return res;

    const data = parseJson(res.text) as
      | {
          issues?: {
            key?: unknown;
            fields?: {
              summary?: unknown;
              issuetype?: { name?: unknown };
              status?: { name?: unknown };
            };
          }[];
        }
      | undefined;
    if (!data || !Array.isArray(data.issues)) {
      return fail("jira_error", "Jira returned search results in an unexpected shape.");
    }
    const items: QueueItem[] = [];
    for (const issue of data.issues) {
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
    return { ok: true, value: items };
  }

  async function searchTickets(
    projectKey: string | null,
    query: string,
  ): Promise<Result<QueueItem[]>> {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      return fail("query_too_short", `Type at least ${MIN_QUERY_LENGTH} characters to search.`);
    }
    // An exact key is looked up directly (in any project); anything else is a prefix text
    // search, scoped to the room's project when one is set.
    const match = ISSUE_KEY.test(q)
      ? `key = ${jqlQuote(q.toUpperCase())}`
      : `${projectKey === null ? "" : `project = ${jqlQuote(projectKey)} AND `}text ~ ${jqlQuote(`${q}*`)}`;
    return runSearch(`${match} AND statusCategory != Done ORDER BY updated DESC`, SEARCH_PAGE_SIZE);
  }

  async function removeLabel(key: string, label: string): Promise<Result<void>> {
    const res = await request(
      "PUT",
      `/rest/api/3/issue/${encodeURIComponent(key)}`,
      { update: { labels: [{ remove: label }] } },
      // Unlike setStoryPoints, a 400 here is not about the edit screen, so keep it generic.
      { badRequestReason: "jira_error" },
    );
    if (!res.ok) return res;
    if (res.status !== 204) {
      return fail(
        "jira_error",
        `Jira returned unexpected HTTP ${res.status} for the label update.`,
      );
    }
    return { ok: true, value: undefined };
  }

  return {
    storyPointsFieldId,
    getIssue,
    setStoryPoints,
    listProjects,
    listBoards,
    boardFilterId,
    searchQueue,
    removeLabel,
    searchTickets,
  };
}
