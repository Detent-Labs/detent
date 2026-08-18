## Why

A ponytail (over-engineering/correctness) audit of `src/http` and `src/auth`
found five related defects. All are mechanism-level. The audit confines all
five to those two directories.

The most serious is a live correctness hazard. 67 handler signatures across
10 files default their `db: SQL` parameter to the module-level `sql`
connection. No suite exercises the default, since `createServer` always
passes `db` explicitly. The default exists only to be silently wrong the day
a caller reaches it. Under multi-tenancy, that means routing one tenant's
request against another tenant's data.

Two of the 67 are not themselves per-request handlers, and both sit in
`server.ts`. `startHttpServer` is the production bootstrap entry point. It
runs once at process start (`server.ts:815`, `if (import.meta.main)
startHttpServer(...)`) with no `db` argument, relying on the same default.
`createServer`'s own `processDb: SQL = sql` parameter (`server.ts:477`) is
the second. `docs/current-state.md` documents it as precisely the handle
every request-handling closure `createServer` builds falls back to. It is
the seed a single-tenant deployment's requests all read. The "wrong tenant's
data" hazard above describes the other 65. An incoming request dispatches
each of those 65 directly.

`startHttpServer`'s and `createServer`'s own hazards are narrower. Nothing
today stops a future call site from starting the whole server, or building
its dispatcher, against the wrong database. Dropping both defaults closes
that gap too, at compile time instead of at a request-handling path. Task
1.8's `bun run typecheck` loop catches and fixes both bootstrap-shaped call
sites like any other site inside `src/http/`.

`src/auth/login.ts`'s `handleLogin` (the `POST /auth/login` handler)
carries the identical default. `server.ts`'s route table already supplies
`db` explicitly there too. It is one of the 67 sites, not an exception.

The identical `db: SQL = sql` default pattern also exists on roughly a dozen
exported functions across 14 files in `src/engine` (for example `store.ts`,
`transition.ts`). This change does not touch them. The audit that motivates
this change confines itself to `src/http` and `src/auth`, stated above. The
engine-layer defaults sit outside that scope. Fixing them is a separate,
larger change for later.

The other four defects are pure duplication. A two-line "resolve actor, then
check a role" preamble repeats roughly 35 times. Sixteen hand-written `404
not-found` response literals repeat the same shape. Two files of about 28
lines each hold one trivial handler with a single caller. Roughly 350 lines
of comments across four files narrate change history by name rather than
state present facts. That breaks this repository's own `CLAUDE.md`
convention.

## What Changes

- **BREAKING (compile-time only)**: Drop the `= sql` default from every
  handler's `db: SQL` parameter. This spans `src/http/{ui-strings-routes,
  studio-routes, metrics, server, admin-routes, reporting-routes, health,
  account-routes, routes}.ts` and `src/auth/login.ts`'s `handleLogin`.
  Within `server.ts`, two sites carry the default: `createServer`'s own
  `processDb: SQL = sql` parameter, and `startHttpServer`'s own `db: SQL =
  sql` parameter. That is 67 sites across 10 files.

  A call site that omits the argument now fails `tsc`. Today it would
  instead read the wrong tenant's data at runtime. No caller reachable
  through `createServer`'s own wiring omits the argument today, so no
  production runtime behavior changes.

  `test/auth-login.test.ts` does omit it. 28 of its `handleLogin(req,
  SECRET)` calls rely on the same default. That is a compile-time-only
  break; this change's task list fixes it alongside the production sites
  (see Impact).
- Add a `route(req, resolver, db, gate, fn)` composing wrapper (naming
  decided in design.md) to `src/http/routes.ts`. It folds `resolveActor`, a
  supplied gate callback, and the existing `guarded` wrapper into one call.
  It replaces the repeated two-line "resolve actor, then
  `requireRole`/`requireStudioRead`/`requireAuthoring`" preamble. That
  preamble appears at roughly 35 call sites across `admin-routes.ts`,
  `studio-routes.ts` and `reporting-routes.ts`.
- Six more sites migrate the same way. The module `admin-routes.ts` gates
  two of them through a local `requireDataListRead` composite. Its sibling
  `studio-routes.ts` gates the other four through a `requirePermission`
  check. That check reads its `processId` from the URL, not the body.
  design.md's Decisions section states the composed gate closures.
- Add one exported `notFound(message)` helper to `src/http/errors.ts`. It
  replaces 16 hand-written `{ status: 404, body: { error: { type:
  "not-found", message } } }` literals. Those span `studio-routes.ts`,
  `admin-routes.ts`, `server.ts` and `reporting-routes.ts`. Status and body
  shape stay byte-identical. Two modules wrap that exact literal in a local
  helper of their own today: `reporting-routes.ts`'s `notFound(processId)`
  and `admin-routes.ts`'s `notFoundList(listKey)`. This change deletes both.
  Each of their call sites calls the shared helper directly instead.
- Delete `src/http/ui-strings-routes.ts`. It is 28 lines for one 5-line
  handler that duplicates `handleAdminListUiStrings`'s response shape. Move
  `handleGetUiStrings` beside its admin sibling.
- Delete `src/http/health.ts`. It is 28 lines for two handlers, each with one
  call site. Inline `checkDbReady`, `handleLivez` and `handleReadyz` into
  `server.ts`'s existing special-cased branches for `GET /livez` and `GET
  /readyz`.
- Rewrite or delete comments in `server.ts`, `admin-routes.ts`,
  `src/auth/users.ts` and `src/auth/authorize.ts`. Target comments that
  narrate change history by name. One example: "before
  http-route-table a parallel OPTIONS if-chain restated every route".
  `CLAUDE.md` already states the rule this enforces. Comments state facts,
  not process history. No requirement or scenario changes; this item is
  prose-only.

None of the above changes a route's path, method, status code, body shape,
CORS behavior, or role requirement. Three probe routes keep their current
exemption. Those routes, `GET /livez`, `GET /readyz` and `GET /metrics`,
stay outside the dispatch table and outside CORS handling. This change does
not touch `server.ts`'s `BINARY_ROUTES` handling, the subject of a prior,
separate audit finding.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `http-route-handling-consolidation`: adds five requirements. Three are
  mechanism-level. First, a role-gated route handler composes through one
  shared wrapper. It no longer repeats `resolveActor` plus a role check
  inline. Second, a "not found" HTTP response comes from one shared helper.
  It no longer repeats a hand-written literal per call site.

  Third, a handler's `db: SQL` parameter carries no default value.

  The other two requirements are new because no existing requirement states
  where a handler's code must live. Fourth, `handleGetUiStrings` lives in
  `admin-routes.ts`, beside `handleAdminListUiStrings`. `ui-strings-routes.ts`
  stops existing as a separate module.

  Fifth, `checkDbReady`, `handleLivez` and `handleReadyz` live in
  `server.ts`. `health.ts` stops existing as a separate module. Neither of
  these last two requirements changes a route's behavior. Each states only
  where its handler's code lives.

  No requirement of `http-wrapper` or `authorization` changes. Every route
  keeps the status code, body shape, CORS behavior and required role those
  two capabilities already specify.

## Impact

- `src/http/routes.ts`, `src/http/admin-routes.ts`,
  `src/http/studio-routes.ts`, `src/http/reporting-routes.ts`,
  `src/http/errors.ts`, `src/http/server.ts`, `src/http/account-routes.ts`,
  `src/http/metrics.ts`. Signature and call-site changes only. No route
  table entry, status code, or body shape changes.
- `src/http/ui-strings-routes.ts`, `src/http/health.ts`: deleted. Their
  logic moves into `admin-routes.ts`/`routes.ts` and `server.ts`
  respectively.
- `src/auth/login.ts`: signature-only change, the same `= sql` default
  drop as the `src/http` sites above. `server.ts`'s route table already
  supplies `db` explicitly to `handleLogin`, so no runtime behavior
  changes.
- `src/auth/users.ts`, `src/auth/authorize.ts`: comment-only edits. See
  design.md's Non-Goals for why `users.ts`'s own `db: SQL = sql` defaults
  stay out of this change's signature work.
- `test/health.test.ts` imports `checkDbReady`, `handleLivez` and
  `handleReadyz` from `../src/http/health.js` today. That import line moves
  to wherever the three functions land. Test assertions stay unchanged,
  since behavior stays unchanged.
- `test/auth-login.test.ts` calls `handleLogin(req, SECRET)` with no `db`
  argument at 28 sites, relying on the default this change drops. Each of
  those 28 sites gains an explicit third argument, the file's own already-
  imported `sql` (from `../src/engine/store.js`). The file's five call sites
  that already pass `sql` and `address` explicitly (lines 431, 432, 436,
  442 and 446, the credential-stuffing scenario) need no change. This is
  the one test file this change edits;
  every other existing `test/http*.test.ts` and `test/auth*.test.ts` suite
  must keep passing unmodified.
- `docs/current-state.md`: names `ui-strings-routes.ts` and `health.ts` as
  existing, separate route modules in three places. This change deletes
  both files, so all three references go stale. Tasks.md section 5 fixes
  them.
