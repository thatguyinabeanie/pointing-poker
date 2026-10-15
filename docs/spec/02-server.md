# Pointing Poker: Server Specification

Audience: a separate Claude Opus session implementing `server/` and `shared/` with no other context. Where this document and the scaffold at `~/source/pointing-poker` disagree, this document wins (conflicts are listed in section 13).

## 1. Scope and non-goals

The server is one Fastify 5 process that hosts one shared room for one team. It serves the Vite SPA, exposes two JSON routes, and runs a single WebSocket endpoint that drives an in-memory game state machine and talks to Jira over REST.

Non-goals, all decided: no database or persistence (a restart loses the game, which is acceptable); no authentication of our own (identity comes only from the auth proxy's headers, never from a message body); no rooms, room codes, moderator roles or observer mode; no multi-replica support (replicas stays at 1); no backpressure handling or metrics, and no general rate limiting (the only limits are the queue refresh and ticket search limits in section 14); no refresh of `ticket.currentPoints` after a successful save; no tests (the user relies on CI and has asked for none in this work, so do not create `*.test.ts` files or add Vitest scripts, even though the plan lists them). Never read or print `.env`.

## 2. File map

Reference implementations already exist and have been reviewed: copy `game.ts`, `jira.ts` and `sanitize.ts` verbatim into `server/game.ts`, `server/jira.ts` and `server/sanitize.ts`. Copies live at `docs/spec/reference/server/{game,jira,sanitize}.ts`. Run `npm run format` afterward (Biome normalizes the single quotes in `game.ts` to double quotes). Do not redesign them.

**`shared/deck.ts`** and **`shared/protocol.ts`**: section 3, verbatim. Types only in protocol.

**`shared/constants.ts`**: `export const NEEDS_POINTING_LABEL = 'needs-pointing'`. A separate file because protocol.ts is types-only and erased at runtime. Server code reads the label from `env().JIRA_NEEDS_POINTING_LABEL` (default this constant); the client may import the constant for display.

**`server/game.ts`** (pure, imports only `shared/`; no I/O, no logging). Exports:
`interface Player { userId: number; username: string; connections: number; vote: Card | null }`, `interface GameState { phase: Phase; ticket: Ticket | null; players: Map<number, Player>; round: number; jiraSave: JiraSave; queueSettings: QueueSettings; queue: QueueState; projects: JiraProject[]; boards: JiraBoard[] }`, `type Result = { ok: true; state: GameState } | { ok: false; reason: string }`, and these functions:
- `createInitialState(opts: { defaultProjectKey?: string | null } = {}): GameState` (phase idle, round 0, no ticket, jiraSave idle; settings `{ projectKey: defaultProjectKey ?? null, boardId: null, needsPointingOnly: true, clearLabelOnSave: true }`; queue empty and not loading; projects and boards empty).
- `join(state, identity: { userId: number; username: string }): Result`. Always ok. Creates the player or bumps `connections` and refreshes `username`.
- `leave(state, userId: number): Result`. Always ok. Decrements `connections` (floor 0), keeps the vote, unknown user returns the state unchanged.
- `vote(state, userId: number, card: string): Result`. The card is a plain `string` and the function validates it. Reasons, checked in this order: `not_voting` (phase is not voting), `invalid_card` (not in `DECK`), `unknown_player`. Voting the same card again clears it.
- `reveal(state): Result`. Reason `not_voting`. Partial votes are allowed.
- `reset(state, opts: { clearTicket?: boolean } = {}): Result`. Always ok. Prunes zero-connection players, clears votes, bumps `round`, resets `jiraSave` to idle. Without `clearTicket` it goes to `voting` on the same ticket (also from idle, ticket-less); with it, to `idle` with no ticket.
- `loadTicket(state, ticket: Ticket): Result`. Always ok. Same fresh-round behavior, phase `voting`.
- `markSave(state, save: JiraSave): Result`. Any non-idle save requires phase `revealed` (reason `not_revealed`) and a ticket (reason `no_ticket`). Idle always succeeds.
- `canSave(state, points: number): boolean`. True only when revealed, a ticket exists, and `isNumericCard(String(points))`.
- `summarize(players: Iterable<Player>): NonNullable<Snapshot['stats']>` (average rounded to one decimal; `consensus` is min equals max over numeric votes).
- Queue mutators, section 14: `setQueueSettings`, `setQueueLoading`, `setQueue`, `setProjects`, `setBoards`. All return `Result` and are always ok.
- `viewFor(state, viewerId: number): Snapshot`. Per-recipient: before reveal other players' `vote` is null and only `hasVoted` shows; the viewer sees their own card; players sorted by `username.localeCompare`; `stats` is null until revealed.
All mutators return new state objects; never mutate a state in place. The complete set of game reason strings is `not_voting`, `invalid_card`, `unknown_player`, `not_revealed`, `no_ticket`.

**`server/jira.ts`** (framework-free; uses global `fetch`). Exports: `type JiraErrorReason = 'not_configured' | 'bad_credentials' | 'forbidden' | 'not_found' | 'field_not_editable' | 'rate_limited' | 'unreachable' | 'no_points_field' | 'query_too_short' | 'jira_error'`, `type JiraFailure = { ok: false; reason: JiraErrorReason; message: string }`, `type Result<T> = { ok: true; value: T } | JiraFailure`, `interface JiraClient { storyPointsFieldId(): Promise<Result<string>>; getIssue(key: string): Promise<Result<Ticket>>; setStoryPoints(key: string, points: number): Promise<Result<void>>; listProjects(): Promise<Result<JiraProject[]>>; listBoards(projectKey: string): Promise<Result<JiraBoard[]>>; boardFilterId(boardId: number): Promise<Result<number>>; searchQueue(settings: QueueSettings, label: string): Promise<Result<QueueItem[]>>; removeLabel(key: string, label: string): Promise<Result<void>>; searchTickets(projectKey: string | null, query: string): Promise<Result<QueueItem[]>> }`, `interface JiraClientOptions { baseUrl: string; email: string; token: string; fieldOverride?: string; fetch?: typeof fetch; timeoutMs?: number; logger?: { debug(obj: object, msg: string): void } }`, `notConfigured(): JiraFailure`, `createJiraClient(opts: JiraClientOptions): JiraClient`. Behaviors to preserve: Basic auth header is built once and only ever sent as a header; every call uses `AbortSignal.timeout(10_000)` by default; network and timeout errors become `unreachable` with only the error name in the message; status mapping is 401 `bad_credentials`, 403 `forbidden`, 404 `not_found`, 429 `rate_limited`, 400 on PUT `field_not_editable` (message includes Jira's own text), 400 on GET and any other non-2xx `jira_error`; the Story Points field id comes from `fieldOverride`, else discovery via `GET /rest/api/3/field` (custom field named "Story Points", then "Story point estimate"), cached as a shared promise and evicted on failure; `getIssue` still succeeds without the field (`currentPoints` null) if discovery fails, and returns the rendered description and comments as described under "Ticket detail" below; `setStoryPoints` hard-requires the field and expects HTTP 204. The queue methods are specified in section 14. The token never appears in any message, so `failure.message` is safe to show to users and to log.

**`server/sanitize.ts`** (pure; imports only `sanitize-html`). Exports `sanitizeJiraHtml(html: string, baseUrl: string): string` and `capSanitizedHtml(html: string, baseUrl: string, maxChars: number): string`. Details under "Ticket detail" below. Only `jira.ts` imports it.

**`server/env.ts`**: `export function env(): Env` and `export type Env = z.infer<typeof schema>`. Section 4.

**`server/log.ts`**: `export function userLog(log: FastifyBaseLogger, userId: number): FastifyBaseLogger` returns `log.child({ userId })`. Keeps ws.ts and heartbeat.ts from caring about bindings. Game and jira never import it.

**`server/lib/proxy-identity.ts`**: already in the repo. Exports `interface ProxyIdentity { userId: number; username: string }` and `getProxyIdentity(headers: Headers, requestUrl: string, config: ProxyIdentityConfig): ProxyIdentity | null`. The module is pure; `server/identity.ts` builds the config with `identityConfigFromEnv()`, which reads the header names from `IDENTITY_USER_ID_HEADER` and `IDENTITY_USERNAME_HEADER`, the optional query-param names from `IDENTITY_USER_ID_QUERY` and `IDENTITY_USERNAME_QUERY`, and the dev fallback from `DEV_USER_ID` and `DEV_USERNAME`. Do not edit it.

**`server/identity.ts`**: `export interface Identity { userId: number; username: string }`, `export function toHeaders(req: { headers: IncomingHttpHeaders }): Headers`, `export function resolveIdentity(req: { headers: IncomingHttpHeaders; url: string }): Identity | null`, `export function identityMode(): 'proxy' | 'dev'`. Section 5.

**`server/routes/health.ts`**: `export async function healthRoutes(app: FastifyInstance): Promise<void>`.

**`server/routes/spa.ts`**: `export async function registerSpa(app: FastifyInstance, opts: { dev: boolean }): Promise<void>`. Already correct in the scaffold.

**`server/ws.ts`**: `export async function wsRoutes(app: FastifyInstance, opts: { jira: JiraClient }): Promise<void>`, plus `export function isOriginAllowed(origin: string | undefined, host: string | undefined, allowed: string[]): boolean`.

**`server/heartbeat.ts`**: `export function trackSocket(socket: WebSocket): void` and `export async function heartbeat(app: FastifyInstance, opts: { intervalMs: number }): Promise<void>`.

**`server/app.ts`**: `export interface BuildAppOptions { jira?: JiraClient; heartbeatMs?: number; serveClient?: boolean }` and `export async function buildApp(opts?: BuildAppOptions): Promise<FastifyInstance>`. The scaffold today has `buildApp({ serveClient = true }: BuildAppOptions = {})`, with `serveClient` as its only option; `jira` and `heartbeatMs` arrive in step 3.

**`server/index.ts`**: entry point, no exports.

## 3. Shared contract (verbatim reference versions)

`shared/deck.ts`:

```ts
export const DECK = ['0', '1', '2', '3', '5', '8', '13', '21', '?', '☕'] as const;

// Only these cards count toward average/min/max and can be saved to Jira.
export function isNumericCard(card: string): boolean {
  return (DECK as readonly string[]).includes(card) && /^\d+$/.test(card);
}
```

`shared/protocol.ts` (the scaffold copy adds comments and double quotes; keep those, the types must be identical to this):

```ts
import type { DECK } from './deck.ts';

export type Card = (typeof DECK)[number];
export type Phase = 'idle' | 'voting' | 'revealed';
export interface TicketComment { id: string; author: string; createdAt: string; bodyHtml: string }
export interface Ticket {
  key: string;
  summary: string;
  issueType: string;
  status: string;
  url: string;
  currentPoints: number | null;
  descriptionHtml: string | null;
  comments: TicketComment[];
  assignee: string | null;
  priority: string | null;
  labels: string[];
}
export type JiraSave =
  | { status: 'idle' }
  | { status: 'saving'; points: number; by: string }
  | { status: 'saved'; points: number; by: string }
  | { status: 'error'; points: number; message: string };
export interface PlayerView {
  userId: number;
  username: string;
  connected: boolean;
  hasVoted: boolean;
  vote: Card | null;
}
// Shared room state: one team per deployment.
export interface QueueSettings { projectKey: string | null; boardId: number | null; needsPointingOnly: boolean; clearLabelOnSave: boolean }
export interface QueueItem { key: string; summary: string; issueType: string; status: string; url: string }
export interface JiraProject { key: string; name: string }
export interface JiraBoard { id: number; name: string; type: string }
export interface QueueState { items: QueueItem[]; loading: boolean; error: string | null; fetchedAt: string | null }
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
  | { type: 'vote'; card: Card }
  | { type: 'reveal' }
  | { type: 'reset'; clearTicket?: boolean }
  | { type: 'loadTicket'; key: string }
  | { type: 'saveEstimate'; points: number }
  | { type: 'setQueueSettings'; settings: Partial<QueueSettings> }
  | { type: 'refreshQueue' }
  | { type: 'refreshProjects' }
  | { type: 'searchTickets'; query: string };
export type ServerMessage =
  | { type: 'hello'; me: { userId: number; username: string }; deck: Card[] }
  | { type: 'state'; snapshot: Snapshot }
  | { type: 'error'; id: number; reason: string; message: string }
  // Only to the requesting socket; search is per user, not room state.
  | { type: 'searchResults'; query: string; items: QueueItem[]; error: string | null };
```

### Ticket detail (description and comments)

A loaded `Ticket` carries the rendered description, the comments, and a few header fields so the room can read the ticket without leaving the app. `QueueItem` is unchanged: list rows stay light, and `searchQueue` and `searchTickets` keep requesting only `summary,issuetype,status`.

`getIssue(key)` requests `GET /rest/api/3/issue/{key}?fields=summary,issuetype,status,assignee,priority,labels,description,comment[,{storyPointsField}]&expand=renderedFields`. The v3 API returns Atlassian Document Format JSON in `fields`, so the HTML comes from `renderedFields`:
- `descriptionHtml`: `renderedFields.description` when it is a non-blank string, run through `sanitizeJiraHtml`, else `null`.
- `comments`: pair `fields.comment.comments[]` (for `id`, `author.displayName`, `created`) with `renderedFields.comment.comments[]` (for `renderedBody`), matching by `id` and falling back to position. `author` falls back to `Unknown`, `createdAt` is Jira's `created` string unchanged, `bodyHtml` is the sanitized `renderedBody` (empty string if missing). Keep the most recent 50 and preserve Jira's order, oldest first.
- `assignee` is `assignee.displayName` or `null`; `priority` is `priority.name` or `null`; `labels` is the string array, empty when absent.
- Caps: the description is limited to 200,000 characters after sanitizing, and each comment body is limited to 20,000 characters after sanitizing. Both use the same truncation. `capSanitizedHtml` cuts the sanitized string, runs the cut back through `sanitizeJiraHtml` (a raw slice can end inside a tag or attribute, and the second pass drops the partial tag and closes open ones), then appends `<p><em>Truncated</em></p>`. The loaded ticket is included in every state snapshot broadcast to every socket, so payload size matters: a very large ticket is re-sent on every broadcast, and the caps bound this but do not remove it.
- If `renderedFields` is missing or malformed, the load still succeeds with `descriptionHtml: null` and `comments: []`.
- Debug log (through the optional `logger` client option, which `buildApp` sets to `app.log`): `{ key, descriptionChars, commentCount }`. Never log description or comment content.

`sanitizeJiraHtml` uses the `sanitize-html` package. Sanitizing happens on the server for three reasons: one place does it, so every viewer gets the same clean HTML; the browser bundle needs no DOM-based sanitizer; and the HTML is Jira-authored content (anyone who can comment on a ticket wrote it) that is shown to everyone in the room. The client renders `descriptionHtml` and `bodyHtml` as HTML without further processing, so nothing unsanitized may ever reach those fields.
- Allowed tags: `p br div span ul ol li strong b em i u s del code pre blockquote h1-h6 hr a table thead tbody tr th td sup sub`. Allowed attributes: `a[href,title,rel,target]` and `td`/`th` `[colspan,rowspan]`. Every other attribute (`class`, `style`, `id`, `data-*`, event handlers) is dropped. Disallowed tags are unwrapped, except `script`, `style`, `iframe`, `textarea`, `noscript` and `option`, which are removed with their content.
- Links: relative `href` values resolve against the Jira base URL. Only `http`, `https` and `mailto` survive; a `javascript:` or other scheme leaves an anchor with no `href`. Every anchor gets `rel="noopener noreferrer"` and `target="_blank"`.
- Images: Jira attachment images need Jira auth and will not load inside the app, so each `img` becomes `<a href="{absolute src}">[image: {alt, else filename}]</a>` with the same link attributes. An image with an unusable `src` becomes plain text `[image: ...]`.

## 4. Runtime constraints

Node 26 runs `server/*.ts` directly by stripping types, with no build step. Therefore: every relative import names the real file with a `.ts` extension (`import { join } from './game.ts'`); only erasable syntax is allowed (`erasableSyntaxOnly`: no `enum`, no constructor parameter properties, no `namespace`, no `import x = require`); with `verbatimModuleSyntax`, anything that is only a type must use `import type` or an inline `type` modifier, otherwise Node fails at runtime on a missing export. Runtime dependencies added for ticket detail: `sanitize-html` (with `@types/sanitize-html` as a dev dependency); import it as a default import, `import sanitizeHtml from 'sanitize-html'`. The socket type comes from `import type { WebSocket } from 'ws'` (types via `@types/ws`; `ws` is not a direct dependency, so never import it as a value). Type checking is `npm run tsc:check` (`tsconfig.server.json`, module nodenext). The Dockerfile sets `NODE_ENV=production`; nothing in the server may assume it is set locally.

`env()` must be called lazily, inside functions, never at module scope. It parses `process.env` with zod 4 on first call and memoizes. Before parsing, drop every entry whose value is the empty string (container platforms often pass blanks) so optional fields stay undefined. Fields:

| Variable | Zod | Default |
|---|---|---|
| `NODE_ENV` | `z.string()` | `'development'` |
| `PORT` | `z.coerce.number().int().min(1).max(65535)` | `3838` |
| `LOG_LEVEL` | `z.enum(['fatal','error','warn','info','debug','trace','silent'])` | `'info'` |
| `JIRA_BASE_URL` | `z.url().optional()` | none (no default in the repo) |
| `JIRA_API_TOKEN_USERNAME` | `z.string().min(1).optional()` | none |
| `JIRA_API_TOKEN_PASSWORD` | `z.string().min(1).optional()` | none |
| `JIRA_STORY_POINTS_FIELD` | `z.string().regex(/^customfield_\d+$/).optional()` | none |
| `JIRA_DEFAULT_PROJECT` | `z.string().regex(/^[A-Z][A-Z0-9_]*$/i).optional()` | none |
| `JIRA_DEFAULT_BOARD` | `z.string().trim().min(1).optional()` | none |
| `JIRA_NEEDS_POINTING_LABEL` | `z.string().min(1)` | `'needs-pointing'` |
| `ALLOWED_ORIGINS` | `z.string().optional()`, then split on commas, trimmed, empties dropped | none |
| `ALLOW_DEV_USER` | `z.string().optional()` | none |
| `IDENTITY_USER_ID_HEADER` | `z.string().optional()` | none |
| `IDENTITY_USERNAME_HEADER` | `z.string().optional()` | none |
| `IDENTITY_USER_ID_QUERY` | `z.string().optional()` | none |
| `IDENTITY_USERNAME_QUERY` | `z.string().optional()` | none |
| `DEV_USER_ID` | `z.string().optional()` | none |
| `DEV_USERNAME` | `z.string().optional()` | none |

A parse failure throws an error naming the offending variable names only, never their values. Jira counts as configured only when base URL, username and password are all present. `buildApp` builds the client with `createJiraClient({ baseUrl, email: username, token: password, fieldOverride: JIRA_STORY_POINTS_FIELD })` when configured, otherwise a stub whose methods all resolve to `notConfigured()`. If some but not all three are set, log one `warn` listing the missing variable names. `opts.jira` overrides all of this. `proxy-identity.ts` reads the `IDENTITY_*` and `DEV_*` variables and `NODE_ENV` straight from `process.env`; that is fine, it is the shared helper. With the identity header names unset (production default), no request carries an identity, `/ws` closes with 4401 and `/api/me` returns 401.

## 5. Identity

`toHeaders(req)` builds a WHATWG `Headers` from Node's `IncomingHttpHeaders`: skip undefined values, `append` each element of array values, and skip any entry that makes `Headers` throw. The helper depends on `Headers` for case-insensitive lookup.

`resolveIdentity(req)` returns `{ userId, username }` or null. Order, first match wins:
1. The auth proxy's headers, named by `IDENTITY_USER_ID_HEADER` and `IDENTITY_USERNAME_HEADER` (set on the deployment to whatever the proxy injects; there are no defaults in the repo).
2. Optional query params, named by `IDENTITY_USER_ID_QUERY` and `IDENTITY_USERNAME_QUERY`, for older proxy versions that pass identity in the URL.
3. `?devUser=<name>`, honored only when `env().NODE_ENV !== 'production'` and `env().ALLOW_DEV_USER === '1'`.
4. `DEV_USER_ID` and `DEV_USERNAME` (inside the helper, itself gated on `NODE_ENV !== 'production'`).

The helper bundles steps 1, 2 and 4, so step 3 has to be inserted around it. Implementation: compute `headers = toHeaders(req)` and `url = new URL(req.url, 'http://localhost')`. If the configured user-id header is present in `headers`, or the configured user-id query param is present in `url.searchParams`, return `getProxyIdentity(headers, req.url, identityConfigFromEnv())` and stop (a present but malformed proxy value fails closed to null, and `devUser` is ignored). Otherwise, if dev-user is allowed and `devUser` is present, validate it against `/^[\w.-]{1,32}$/` (invalid means return null) and return `{ userId: devUserId(name), username: name }`. Otherwise return `getProxyIdentity(headers, req.url, identityConfigFromEnv())`, which applies step 4.

`devUserId(name)` is a stable hash: 32-bit FNV-1a (`h = 2166136261`; for each code point `h ^= cp; h = Math.imul(h, 16777619) >>> 0`) and the result is `h + 1_000_000`. Real platform user ids are far below that range in practice, so collisions are unlikely; this is dev only.

`identityMode()` returns `'dev'` when `NODE_ENV !== 'production'` and (`ALLOW_DEV_USER === '1'` or `DEV_USER_ID` is set), else `'proxy'`. `index.ts` logs exactly `identity mode: proxy` or `identity mode: dev` at info level right after `listen` succeeds, via `app.log.info(\`identity mode: ${identityMode()}\`)`. Also log whether Jira is configured and whether `ALLOWED_ORIGINS` is set (booleans only).

## 6. HTTP routes and app wiring

`GET /api/status` returns `200 {"ok":true}`; no identity needed (the platform's health check, set by its health-check path setting). `GET /api/me` returns `200 {"userId":number,"username":string}` or `401 {"error":"unauthenticated"}` when `resolveIdentity(request)` is null. Both set `Cache-Control: no-store`.

`registerSpa` first, in dev, adds a root `onRequest` hook that calls `reply.hijack()` for requests with `request.ws` and a `Sec-WebSocket-Protocol` of `vite-hmr` or `vite-ping`, so Fastify does not answer Vite's HMR upgrade (`04-infra.md` section 9, V3). It then calls `app.register(fastifyVite, { root, dev, spa: true })` on the root instance (not an encapsulated plugin), then `app.get('/', (_req, reply) => reply.html())`, then `await app.vite.ready()`. `root` is the repo root (`resolve(import.meta.dirname, '../..')`). `dev` is `env().NODE_ENV !== 'production'`. Nothing else is served by us in production; `@fastify/vite` serves `dist/client` assets.

`buildApp` order matters: (1) `Fastify({ logger: { level: env().LOG_LEVEL, redact } })` (section 9); (2) register `@fastify/websocket` with options below; (3) `healthRoutes`; (4) `wsRoutes` with `{ jira }`; (5) `heartbeat` with `{ intervalMs: opts.heartbeatMs ?? 25_000 }`; (6) only if `opts.serveClient ?? true`, `registerSpa(app, { dev })`. Registration order is necessary but not enough: the WebSocket plugin is registered before `@fastify/vite`, and the dev hook in `registerSpa` (step 6) is what stops Fastify from answering Vite's HMR upgrade. `serveClient: false` means no Vite instance and no `dist/` lookup.

`@fastify/websocket` options: `options: { maxPayload: 4096 }`; `errorHandler(error, socket, request) { request.log.error({ err: error }, 'ws error'); socket.terminate(); }`; and a custom `preClose` (section 8). The plugin's `errorHandler` is not called for errors thrown inside your own `message` handlers, so ws.ts must catch those itself.

## 7. WebSocket endpoint `/ws`

State lives in closures inside `wsRoutes`, not module scope: `let state = createInitialState({ defaultProjectKey: env().JIRA_DEFAULT_PROJECT })`, `let loadSeq = 0`, `let errorId = 0`, the queue variables from section 14 (`queueSeq`, `boardsSeq`, `lastQueueRefreshAt`, `bootstrapped`), a per-socket `searchSeq`, and `const registry = new Map<number, Set<WebSocket>>()`. Register `app.get('/ws', { websocket: true }, (socket, request) => { ... })`. The handler is synchronous (no `async`, no `await` before handlers attach), because the plugin drops messages that arrive before listeners exist. Steps in order:

1. `trackSocket(socket)` (heartbeat). Create `const log = userLog(request.log, ...)` once identity is known.
2. Origin check: `isOriginAllowed(request.headers.origin, request.headers.host, env().ALLOWED_ORIGINS ?? [])`. If false, log warn (origin and host only) and `socket.close(1008, 'bad origin')`, then return. Rule: with a non-empty `allowed` list, `new URL(origin).host` must equal one list entry (normalize entries that are full origins with `new URL(entry).host`); with an empty list, `new URL(origin).host` must equal the `Host` header. An unparseable Origin fails. A missing Origin is allowed: browsers always send it on WebSocket upgrades, so a missing one means a non-browser client (wscat), which cross-site pages cannot impersonate.
3. Identity: `const identity = resolveIdentity(request)`. If null, `socket.close(4401, 'unauthenticated')` and return.
4. Registry: add `socket` to `registry.get(identity.userId)`, creating the set if needed.
5. Attach `socket.on('message', (raw, isBinary) => ...)` and `socket.on('close', ...)` now, synchronously.
6. `applyState(game.join(state, identity))`, then `send(socket, { type: 'hello', me: identity, deck: [...DECK] })`, then `broadcast()`. Hello goes first so the client knows `me` before its first snapshot.

Helpers: `send(socket, msg: ServerMessage)` writes `JSON.stringify(msg)` only when `socket.readyState === socket.OPEN`, inside try/catch. `broadcast()` iterates the registry and builds `viewFor(state, userId)` once per user, then sends `{ type: 'state', snapshot }` to every socket of that user. `sendError(socket, reason, message)` sends `{ type: 'error', id: ++errorId, reason, message }` to that socket only (the counter is process-wide, so ids strictly increase). `applyState(result)` returns true and assigns `state` when ok, else false (callers turn the reason into an error).

Message handling (all of it inside a try/catch that logs and sends `internal_error`, because `errorHandler` will not see it):
- If `isBinary`, reply `bad_json`. Parse `raw.toString()` with `JSON.parse`; on throw reply `bad_json` ("Messages must be JSON.").
- Validate with this schema; on failure reply `unknown_type` if the parsed value is an object with a string `type` outside the ten names, else `invalid_message`:

```ts
const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('vote'), card: z.string().max(8) }),
  z.object({ type: z.literal('reveal') }),
  z.object({ type: z.literal('reset'), clearTicket: z.boolean().optional() }),
  z.object({ type: z.literal('loadTicket'), key: z.string().trim().min(1).max(64) }),
  z.object({ type: z.literal('saveEstimate'), points: z.number().int().nonnegative() }),
  z.object({
    type: z.literal('setQueueSettings'),
    settings: z.object({
      projectKey: z.string().trim().regex(/^[A-Z][A-Z0-9_]*$/i).max(32).nullable().optional(),
      boardId: z.number().int().positive().nullable().optional(),
      needsPointingOnly: z.boolean().optional(),
      clearLabelOnSave: z.boolean().optional(),
    }),
  }),
  z.object({ type: z.literal('refreshQueue') }),
  z.object({ type: z.literal('refreshProjects') }),
  z.object({ type: z.literal('searchTickets'), query: z.string().max(200) }),
]);
```

`card` is deliberately `z.string()`: `game.vote` is the single place that validates deck membership. Unknown extra keys are stripped by zod's default object behavior.

Dispatch (the identity is the socket's bound `identity`, never anything in the body):

| Command | Game call | Success | Failure reasons (message to user) |
|---|---|---|---|
| `vote` | `game.vote(state, userId, card)` | broadcast | `not_voting` ("Voting is not open."), `invalid_card` ("That card is not in the deck."), `unknown_player` ("Refresh the page to rejoin.", also log warn) |
| `reveal` | `game.reveal(state)` | broadcast | `not_voting` ("There is nothing to reveal.") |
| `reset` | `game.reset(state, { clearTicket })` | broadcast | none (always ok) |
| `loadTicket` | async flow below | broadcast | `bad_key` plus Jira reasons |
| `saveEstimate` | async flow below | broadcast twice, then queue refresh (section 14) | `not_revealed`, `no_ticket`, `invalid_points`, `save_in_progress`, Jira failures reach users through `jiraSave.error`, not an error message; a label removal failure goes to the saver as `error` |
| `setQueueSettings` | `game.setQueueSettings`, then async flow in section 14 | broadcast (loading), then broadcast (result) | none; fetch failures land in `queue.error` |
| `refreshQueue` | async flow in section 14 | broadcast twice | none; ignored silently inside the 5 second window |
| `refreshProjects` | async flow in section 14 | broadcast | none; failures go to the requester as `error` |
| `searchTickets` | async flow in section 14, no game call | `searchResults` to the requester only, no broadcast | `query_too_short` and Jira failures arrive inside `searchResults.error`, not as an `error` message |

Async commands are invoked as `void handle().catch((err) => { log.error({ err }, 'command failed'); sendError(socket, 'internal_error', 'Something went wrong.'); })`.

**loadTicket flow.** Normalize: trim; if it matches `/^\d+$/` and `state.queueSettings.projectKey` is set, prefix that key and a dash (with no project key, a bare number fails the next check); require `/^[A-Z]+-\d+$/i` else `bad_key` ("Enter a Jira key like PP-123, or just the number."); uppercase. Then `const seq = ++loadSeq`; `const res = await jira.getIssue(key)`. If `seq !== loadSeq`, a newer load started, so drop this result silently (debug log). On failure, `sendError(socket, res.reason, userMessage)` to the requester only and leave state untouched. On success, `applyState(game.loadTicket(state, res.value))` and `broadcast()`. User messages by Jira reason: `not_found` becomes `${key} was not found, or the service account cannot see it.`; `bad_credentials` becomes "Jira rejected the service credentials. Ask an admin to check JIRA_API_TOKEN."; `unreachable` becomes "Could not reach Jira. You can still start an unticketed round with Reset."; `not_configured`, `forbidden`, `rate_limited`, `no_points_field`, `field_not_editable`, `jira_error` pass `res.message` through unchanged. Log failures at warn with `{ reason, key }`.

**saveEstimate flow.** Check in order: `!game.canSave(state, points)` yields `not_revealed` if the phase is not revealed, else `no_ticket` if there is no ticket, else `invalid_points` ("Pick a numeric card value."); then `state.jiraSave.status === 'saving'` yields `save_in_progress` ("A save is already running."). The `save_in_progress` guard is an addition to the plan to stop double clicks. Capture `round = state.round`, `key = state.ticket.key`, `by = identity.username`. `applyState(game.markSave(state, { status: 'saving', points, by }))`, `broadcast()`. Then `const res = await jira.setStoryPoints(key, points)` inside try/catch (a throw becomes a `jira_error` failure with a generic message). Staleness guard: if `state.round !== round`, a reset or new ticket happened mid-flight; do not touch state or broadcast, and log at info that the save finished for a stale round (`key`, `points`, `ok`). Otherwise `markSave` with `{ status: 'saved', points, by }` or `{ status: 'error', points, message: res.message }`, then `broadcast()`.

**Close handler.** Remove the socket from its registry set (delete the key when the set empties), `applyState(game.leave(state, identity.userId))`, `broadcast()`. Log at info: `ws closed` with `userId` and `code`.

## 8. Heartbeat and shutdown

`trackSocket(socket)` adds the socket to a module-level `WeakSet<WebSocket>` named `alive` and registers `socket.on('pong', () => alive.add(socket))`. This is the `ws` README `isAlive` pattern without patching the type. `heartbeat(app, { intervalMs })` starts `setInterval` (call `.unref()`): for each `client` of `app.websocketServer.clients` with `readyState === OPEN`, if `!alive.has(client)` call `client.terminate()` and count it; else `alive.delete(client)` and `client.ping()` inside try/catch. Log one info line with the terminated count only when it is above zero. Clear the interval in `app.addHook('onClose', ...)`. The interval is 25s because the ALB idle timeout is 60s; one missed pong window (up to 50s) is therefore tolerated before termination.

Graceful close: the plugin's default `preClose` calls `client.close()` with no status code, which does not meet the requirement of 1001. Pass a custom `preClose` option that closes over `app`: `async () => { for (const c of app.websocketServer.clients) c.close(1001, 'server shutting down'); await new Promise<void>((resolve) => app.websocketServer.close(() => resolve())); }`. A custom `preClose` replaces the default entirely, which is why it also closes the `ws` server. If the implementer finds the promise can hang on a peer that never completes the close handshake, add a `setTimeout(() => c.terminate(), 1000)` per client; the 5s hard exit below is the final backstop.

`index.ts`: first `process.loadEnvFile()` in a try/catch that rethrows anything except `ENOENT` (as in the scaffold; `04-infra.md` section 3 depends on it), then `const app = await buildApp()`; `await app.listen({ host: '0.0.0.0', port: env().PORT })` (0.0.0.0 because the auth proxy reaches the container over the network); then log `identity mode`. For `SIGTERM` and `SIGINT`: ignore repeat signals; log `shutting down`; start a hard-exit timer `setTimeout(() => process.exit(1), 5000).unref()`; `app.close().then(() => process.exit(0), (err) => { app.log.error({ err }, 'close failed'); process.exit(1); })`.

## 9. Logging

Use pino through `app.log` and `request.log` only; no `console`. Fastify's default request serializer does not log headers, but set `redact: { paths: ['req.headers.authorization', 'req.headers.cookie', '*.authorization', '*.token', '*.password'], censor: '[redacted]' }` as defense in depth. Never log the Jira Basic header, token, username or password, any `process.env` dump, raw message bodies, or card values before reveal. Log user identity as `userId` only (no username, to stay clear of PII rules); the username appears solely in the `hello` message and snapshots.

Info: server listening, `identity mode: ...`, Jira configured flag, ws connect (userId) and close (userId, code), loadTicket success and save outcome (ticket key, points, ok), stale-round save completion, heartbeat terminations, shutdown start. Warn: origin rejection (origin and host), Jira failures (`reason`, ticket key, message), partial Jira env. Error: caught handler exceptions, ws errors, forced close failures. Debug: each command type received with userId and phase, dropped stale loadTicket results, per-broadcast recipient count.

## 10. Error and edge-case table

| Situation | Behavior |
|---|---|
| Unknown `type` | `error` reason `unknown_type`; socket stays open |
| Malformed JSON or binary frame | `error` reason `bad_json` |
| Valid type, bad fields (wrong types, missing key) | `error` reason `invalid_message` |
| Payload over 4096 bytes | `ws` closes the socket itself with 1009; client reconnects; no error message |
| Vote while idle or revealed | `error` `not_voting`; state unchanged |
| Vote with a card not in the deck | `error` `invalid_card` |
| Jira down or timeout on load | `error` `unreachable` to requester only; state unchanged; Reset still starts a ticket-less round |
| Jira returns the issue without `renderedFields` (or in an unexpected rendered shape) | Load succeeds; `descriptionHtml` null, `comments` empty; no error message |
| Description over 200,000 characters after sanitizing | Cut, re-sanitized and ended with `<p><em>Truncated</em></p>` |
| A comment body over 20,000 characters after sanitizing | Same cut, re-sanitize, and `<p><em>Truncated</em></p>` marker, applied to that comment only |
| More than 50 comments | Only the most recent 50 are kept, oldest first |
| Jira 401 or 403 on load | `error` `bad_credentials` or `forbidden` with the messages in section 7 |
| Jira 400 on save | `jiraSave` becomes `error` with Jira's message (reason `field_not_editable` in the failure); everyone sees it |
| Save while a save is running | `error` `save_in_progress` |
| Two tabs, same user | Same userId, two sockets in one registry set, `connections` is 2; both get identical snapshots; one voter in the list; closing one tab keeps the player connected |
| Reconnect mid-round | New socket joins the same userId; vote retained because `leave` keeps it and prune only runs at the next `reset` or `loadTicket` |
| Missing identity | Close 4401 |
| Bad Origin | Close 1008 |
| Server restart | State lost (round 0, idle); clients reconnect with backoff and receive a fresh snapshot; acceptable |
| Slow Jira result after reset or new load | Dropped by `round` (saves) or `loadSeq` (loads) |
| Queue fetch fails (Jira down, bad JQL, board gone) | `queue.error` set and broadcast, previous items kept, `loading` false; no `error` message |
| Project projects or boards list fails | `error` to the requester for `refreshProjects`; on automatic fetches only a warn log, lists stay as they were |
| `refreshQueue` twice within 5 seconds | Second one ignored silently |
| Older queue fetch finishes after a newer one | Dropped by `queueSeq` |
| Label removal fails after a save | Save stays `saved`; `error` to the saver only with Jira's message; queue still refreshed |
| `setQueueSettings` with no effective change | No refetch, no loading flash |
| `setQueueSettings` with a malformed project key | `invalid_message` |
| `searchTickets` shorter than 2 characters after trim | `searchResults` with `items: []` and `error` text (reason `query_too_short`, message "Type at least 2 characters to search.") |
| Older search finishes after a newer one on the same socket | Dropped by that socket's `searchSeq`; only the latest query's results are delivered |
| Search sent while another is in flight on the same socket | The older one's result is dropped (the request itself may still complete at Jira); only one result per burst arrives |
| Exception in a message handler | Logged, `error` reason `internal_error` to that socket, socket stays open |

## 11. Sequence diagrams

Connect:

```
Browser        ws.ts handler                 game.ts          registry
  |--upgrade-->|  origin ok? identity ok?       |                |
  |            |--add socket-------------------------------->|
  |            |--join(state,identity)-------->|                |
  |<--hello----|  (me, deck)                    |                |
  |<--state----|  viewFor(state,userId) to each socket of every user
```

Vote and broadcast:

```
Alice             ws.ts                     game.ts
  |--vote 5----->|--vote(state,aliceId,'5')-->|
  |              |<--ok(newState)-------------|
  |              |  state = newState
  |<--state------|  Alice's view: her vote visible
  |              |--state--> Bob: hasVoted true, vote null
```

Reveal:

```
Anyone          ws.ts                    game.ts
  |--reveal---->|--reveal(state)--------->|  phase voting -> revealed
  |<--state-----|  every viewer: all votes visible, stats filled
```

Load ticket:

```
Alice          ws.ts                         Jira
  |--loadTicket "123"-->| normalize -> PP-123; seq=++loadSeq
  |                     |--getIssue--------->|
  |                     |<--Ticket or failure-|
  |                     | seq != loadSeq? drop
  |<--error (failure)---| requester only          (or)
  |<--state (all)-------| game.loadTicket, round+1, phase voting
```

Save estimate:

```
Alice          ws.ts                          Jira
  |--saveEstimate 5-->| canSave? not saving? round=R
  |<--state (all)-----| markSave saving
  |                   |--setStoryPoints------>|
  |                   |<--204 or failure------|
  |                   | state.round != R? drop, log
  |<--state (all)-----| markSave saved, or error(message)
```

Pick from queue:

```
Alice          ws.ts                                   Jira
  |--setQueueSettings {needsPointingOnly:false}-->| game.setQueueSettings (loading)
  |<--state (all, queue.loading)--| 
  |                    |--searchQueue (seq=++queueSeq)-->|
  |                    |<--items or failure--------------|
  |                    | seq != queueSeq? drop
  |<--state (all)------| game.setQueue(items) or queue.error
  |--loadTicket "PP-7"-->| (item key from the queue; same flow as Load ticket)
  |<--state (all)------| round+1, phase voting
```

Save then relabel:

```
Alice          ws.ts                          Jira
  |--saveEstimate 5-->| ... markSave saving, setStoryPoints, markSave saved (as above)
  |                   | clearLabelOnSave? and round unchanged or ticket key known
  |                   |--removeLabel(key, label)-->|
  |                   |<--204 or failure-----------|
  |<--error (saver only, failure case; save stays saved)
  |                   |--searchQueue (seq=++queueSeq)-->|  ticket now has points, so it is gone
  |<--state (all)-----| game.setQueue(items)
```

Search tickets:

```
Alice          ws.ts                                   Jira
  |--searchTickets "dashboard"-->| mySeq=++searchSeq (this socket)
  |                    |--searchTickets(projectKey, q)-->|
  |                    |<--items or failure--------------|
  |                    | mySeq != searchSeq? drop
  |<--searchResults (Alice only)
```

## 12. Acceptance checklist

- [ ] `npm run tsc:check`, `npm run lint` and `npm run build` pass; `node server/index.ts` starts under Node 26 with no build step.
- [ ] `curl -i localhost:3838/api/status` returns 200 and `{"ok":true}`.
- [ ] `curl -i localhost:3838/api/me` returns 401 with no identity (and no `DEV_*` set).
- [ ] With `IDENTITY_USER_ID_HEADER=X-User-Id` and `IDENTITY_USERNAME_HEADER=X-Username` set (any names work for the check), `curl -H 'X-User-Id: 1' -H 'X-Username: dev' localhost:3838/api/me` returns `{"userId":1,"username":"dev"}`; a header value of `abc` for the id returns 401.
- [ ] With `NODE_ENV=production` and `ALLOW_DEV_USER=1`, `/api/me?devUser=alice` is 401; with `NODE_ENV` unset and `ALLOW_DEV_USER=1`, it returns a stable id at or above 1000000; the proxy identity headers still win over `devUser`.
- [ ] Startup log shows `identity mode: proxy` (production) or `identity mode: dev` (local with dev flags).
- [ ] Manual wscat-style check with two identities (`-H 'X-User-Id: 1' -H 'X-Username: alice'` and a second with id 2 and bob): each gets `hello` then `state`; alice votes and bob's `state` shows `hasVoted` true and `vote` null; after `reveal` both see all votes and `stats`.
- [ ] A connection with no identity closes with 4401; a connection with `Origin: https://evil.example` closes with 1008.
- [ ] Sending `{"type":"nope"}`, `not json`, and `{"type":"vote","card":"4"}` in the voting phase each produce an `error` message with incrementing `id` and the socket stays open.
- [ ] A loaded ticket works against real Jira (set `JIRA_BASE_URL` and the two credential variables); with them unset, `loadTicket` returns `not_configured` and `reset` still starts a round.
- [ ] Load a ticket whose description contains a list, a link, a code block and an attachment image: the list, link and code render, the image shows as a `[image: ...]` link, and no inline styles, classes or ids survive in `descriptionHtml`.
- [ ] Load a ticket with 3 or more comments: they appear oldest first, each with author and date. A ticket with no description has `descriptionHtml` null.
- [ ] A comment containing `<script>`, an `onclick` attribute and a `javascript:` link comes through with none of the three; at debug level the log shows only `descriptionChars` and `commentCount`.
- [ ] Save on a throwaway ticket changes Story Points; a ticket whose edit screen lacks the field yields `jiraSave.status === 'error'` with Jira's message.
- [ ] A socket idle for 90s locally with the 25s ping stays open (wscat prints pings with `-P`, or watch for no `close`); a client that stops answering pings is terminated within two intervals.
- [ ] `kill -TERM` closes open sockets with 1001 and the process exits within 5s.
- [ ] Two connected users receive the same `queue.items`, `queueSettings`, `projects` and `boards` in their snapshots; changing a setting on one updates the other.
- [ ] Toggling `needsPointingOnly` off with `setQueueSettings` shows `queue.loading` true, then a different (larger) `queue.items`; toggling it back on restores the labeled-only list.
- [ ] Switching `projectKey` resets `boardId` to null and replaces `boards` with the new project's boards.
- [ ] Saving an estimate removes that ticket from `queue.items` (it has points now); with `clearLabelOnSave` the `needs-pointing` label is gone in Jira, and a label removal failure leaves the save `saved` and sends `error` to the saver only.
- [ ] Two `refreshQueue` messages within 5 seconds cause one Jira search; a Jira outage shows in `queue.error` while earlier items remain.
- [ ] `searchTickets` with "dashboard" returns matching open tickets in `searchResults` to the sender only; `PP-101` returns that ticket directly; "a" returns `query_too_short`; a second query sent immediately after the first delivers only the second's results.
- [ ] No log line at any level contains the Jira token, the Authorization header, or a card value before reveal.

## 13. Conflicts between the scaffold and the plan or reference

1. `server/lib/proxy-identity.ts` and `shared/protocol.ts` match the reference except formatting and comments. `shared/deck.ts` does not: the scaffold's `isNumericCard` is `card !== '' && Number.isFinite(Number(card))`, which accepts values like `4` or `1.5` that are not in the deck. Replace it with the reference body in section 3.
2. `server/app.ts` and `server/index.ts` read `process.env.LOG_LEVEL`, `NODE_ENV` and `PORT` directly. The plan requires lazy `env()`; switch to it.
3. `server/app.ts` registers `@fastify/websocket` with only `maxPayload`, passes no `jira` to `wsRoutes`, has no heartbeat, and has no log redaction. Add them as in section 6. `server/ws.ts` is still an echo stub.
4. `server/index.ts` has no hard-exit timer and no 1001 close; `routes/health.ts` has no `/api/me`.
5. `server/env.ts`, `identity.ts`, `log.ts`, `game.ts`, `jira.ts` and `heartbeat.ts` do not exist yet.
6. `package.json` has no `test` script or Vitest and the plan's `*.test.ts` files are listed; this spec follows the user and creates none. Its `dev` script uses `--watch-path=server --watch-path=shared` instead of the plan's bare `--watch`; keep the scaffold version, since it avoids restarting on client edits.

## 14. Ticket queue

Instead of typing a key, the team picks from a shared queue of unpointed tickets. Settings are shared room state (one team per deployment). The manual `loadTicket {key}` path stays as a fallback and is unchanged.

**Contract.** Types, snapshot fields and commands are in section 3. `Snapshot` gains `queueSettings`, `queue`, `projects`, `boards`; every viewer receives them unchanged. `ClientCommand` gains `setQueueSettings`, `refreshQueue`, `refreshProjects`, `searchTickets`. `ServerMessage` gains `searchResults`. `NEEDS_POINTING_LABEL` is in `shared/constants.ts`.

**Why the labeled-only filter defaults on.** A ticket needs pointing if it is labeled or unpointed, and the team's main project has thousands of open unpointed tickets, so the wider queue is not usable by default. The convention is the label `needs-pointing`; no such label exists in Jira yet, so the filtered list starts empty until someone applies it.

**Game mutators (pure, in `game.ts`).**
- `setQueueSettings(state, partial)`: merges the partial. Changing `projectKey` resets `boardId` to null and clears `boards` (the project change wins even if the same message named a board). Any effective change sets `queue.loading` true. A message that changes nothing returns the same state object, which the server uses to skip the refetch.
- `setQueueLoading(state)`: sets `queue.loading` true.
- `setQueue(state, { items } | { error }, fetchedAt)`: success replaces items, clears the error and sets `fetchedAt` (an ISO string passed in, because game.ts does no I/O). Failure keeps the previous items and `fetchedAt`, sets `error`, and clears `loading`.
- `setProjects(state, list)` and `setBoards(state, list)`.

**Jira client methods (`jira.ts`).** All return the same `Result` type and error mapping; the token never appears in a message.
- `listProjects()`: `GET /rest/api/3/project/search?orderBy=key&maxResults=100&startAt=N`, paginated until `isLast`, capped at 500, mapped to `{ key, name }`, cached 10 minutes in the client instance.
- `listBoards(projectKey)`: `GET /rest/agile/1.0/board?projectKeyOrId={key}&maxResults=50&startAt=N`, paginated until `isLast`, mapped to `{ id, name, type }`, cached 10 minutes per project.
- `boardFilterId(boardId)`: `GET /rest/agile/1.0/board/{id}/configuration`, returns `filter.id` as a number, cached per board.
- `searchQueue(settings, label)`: returns `not_configured` when `projectKey` is null. JQL is `project = "KEY" AND statusCategory != Done`, plus ` AND labels = "label"` when `needsPointingOnly` (labeled tickets, pointed or not, so they can be re-pointed) or ` AND (labels = "label" OR <points> is EMPTY)` when it is off (a ticket needs pointing if it is labeled or unpointed), plus ` AND filter = <filterId>` when `boardId` is set, plus ` ORDER BY Rank ASC`. `<points>` is `cf[NNNNN]` when the Story Points field id is known (override or discovery), else `"Story Points"`. Values are escaped for JQL strings. The board is applied through its filter id so every combination of settings uses one JQL path and one search endpoint, instead of a second agile endpoint with different paging and ordering. Call `POST /rest/api/3/search/jql` with `{ jql, fields: ["summary","issuetype","status"], maxResults: 50 }`; the old `GET /rest/api/3/search` is deprecated. One page is enough, so `nextPageToken` is ignored. Items map to `QueueItem` with url `{base}/browse/{key}`.
- `removeLabel(key, label)`: `PUT /rest/api/3/issue/{key}` with `{ update: { labels: [{ remove: label }] } }`, expects 204. A 400 maps to `jira_error` with Jira's message (not `field_not_editable`, which is specific to the points field).
- `searchTickets(projectKey, query)`: trims the query; under 2 characters returns `query_too_short`. A query matching `/^[A-Z][A-Z0-9]+-\d+$/i` searches `key = "KEY"` (uppercased, any project). Anything else searches `[project = "KEY" AND ]text ~ "<escaped>*"`, with the project clause only when `projectKey` is set. Always `AND statusCategory != Done ORDER BY updated DESC`, `maxResults` 10, same endpoint and fields as above. Double quotes and backslashes in the query are escaped.

**Server state in `wsRoutes` closures.** `queueSeq` and `boardsSeq` (numbers), `lastQueueRefreshAt` (epoch ms, 0 initially), `bootstrapped` (boolean). Each socket also has its own `searchSeq`. Env: `JIRA_DEFAULT_PROJECT` (no default; set per deployment) seeds `queueSettings.projectKey`; `JIRA_DEFAULT_BOARD` (optional, a board name or a numeric id) is resolved to a board id at bootstrap and ignored with one warn when `JIRA_DEFAULT_PROJECT` is unset; `JIRA_NEEDS_POINTING_LABEL` (default `needs-pointing`) is the label passed to `searchQueue` and `removeLabel`.

**Flows.** Each fetch helper returns without error when Jira is not configured: the failure goes into `queue.error` (`not_configured` message) and the lists stay empty.
1. Bootstrap: on the first socket connection (after the hello and first broadcast), if `!bootstrapped`, set it true and run, each followed by `broadcast()`: `listProjects` then `setProjects`; `listBoards(defaultProject)` then `setBoards`; the queue fetch. The projects fetch runs concurrently with the rest. When `JIRA_DEFAULT_BOARD` is set, the queue fetch waits for the boards fetch: if the value is all digits it is matched by board id, otherwise by board name (case-insensitive, trimmed). Exactly one match sets `boardId` through `setQueueSettings`; no match, an ambiguous name (more than one board), or a failed boards fetch logs one warn (no secrets) and leaves `boardId` null, so the first queue fetch never uses an unresolved board. A user change to the project or board during the fetch wins. Without the variable, the three run concurrently as before. Failures in the two lists are logged at warn and leave the lists empty; the queue failure goes to `queue.error`.
2. Queue fetch helper: `const seq = ++queueSeq`; `setQueueLoading`, broadcast; `searchQueue(state.queueSettings, label)`; if `seq !== queueSeq` drop silently (debug log); otherwise `setQueue` with items or `{ error: res.message }` and `new Date().toISOString()`, then broadcast. A throw becomes an error string "Could not load the queue."
3. Boards fetch helper: `const seq = ++boardsSeq`; `listBoards(projectKey)`; drop if stale or if `state.queueSettings.projectKey` changed; otherwise `setBoards`, broadcast. A null project key clears nothing and fetches nothing.
4. `setQueueSettings`: `const next = game.setQueueSettings(state, settings)`; if the returned state is the same object, do nothing. Otherwise apply, broadcast (loading true), then if the project changed run the boards fetch helper and the queue fetch helper concurrently, else only the queue fetch helper. Ids that the Jira lookup cannot resolve (for example a deleted board) arrive as `queue.error`.
5. `refreshQueue`: if `Date.now() - lastQueueRefreshAt < 5000`, ignore silently. Otherwise set `lastQueueRefreshAt` and run the queue fetch helper. Setting changes and post-save refreshes are not rate limited by this rule and do not update `lastQueueRefreshAt`.
6. `refreshProjects`: call `listProjects` and (when a project is set) `listBoards` again, apply with `setProjects` and `setBoards`, broadcast. The contract has no cache-bypass argument, so within the 10 minute cache window this returns the cached lists; note that in a code comment. Failures go to the requester as `error` with the Jira reason.
7. After a successful `saveEstimate` (the `saved` transition, not the stale-round path): if `state.queueSettings.clearLabelOnSave`, `await jira.removeLabel(key, label)`. On failure log warn (`reason`, `key`) and `sendError(socket, res.reason, res.message)` to the saver only; the save is not undone. Then run the queue fetch helper regardless, so the ticket (which now has points) leaves the list. If the save finished for a stale round, the key is still known from the captured `key`, so the label removal and refresh still run; only the `markSave` and broadcast are skipped.
8. `searchTickets`: `const mySeq = ++socketSearchSeq` (per socket). Call `jira.searchTickets(state.queueSettings.projectKey, query)`. If `mySeq !== socketSearchSeq` after the await, drop. Otherwise `send(socket, { type: 'searchResults', query, items, error })` to that socket only. Failures set `items: []` and `error` to the Jira message; `query_too_short` uses "Type at least 2 characters to search." There is no game call and no broadcast. Because every new query bumps the counter, there is effectively one deliverable search per socket at a time.

**Logging.** Info: queue refreshed (item count, never summaries). Warn: label removal failure, list fetch failure. Debug: dropped stale queue or search results, ignored refreshQueue. Never log the free-text query (it may contain customer terms); log its length only.
