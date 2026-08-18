## Context

See proposal.md - Why for motivation. This design covers the five findings'
mechanics: a `route` combinator, a `notFound` helper, the dropped `db`
default, and two file deletions.

`src/http/routes.ts` already exports five shared helpers: `guarded`,
`resolveActor`, `readJson`, `parseVersion` and `errorContext`. Four sibling
modules import them today: `admin-routes.ts`, `studio-routes.ts`,
`reporting-routes.ts` and `account-routes.ts`. This change extends that
same pattern. It introduces no new one.

`resolveActor(req, resolver, db)` and `guarded(req, fn)` already exist. Both
keep their signatures. The two-line preamble this change collapses looks
like this at a typical call site today:

```ts
const actor = await resolveActor(req, resolver, db);
requireRole(actor, ADMIN_ROLE);
```

The handler's own `guarded(req, async () => { ... })` call follows.

## Goals / Non-Goals

**Goals:**
- Fold the repeated actor-resolve-then-gate preamble into one call. It
  appears at roughly 35 sites today gated by `requireRole`/
  `requireStudioRead`/`requireAuthoring`, plus six more gated by
  `requireDataListRead` or `requirePermission` (see Decisions).
- Delete the silent-wrong-tenant hazard the `db: SQL = sql` default
  creates. Every existing caller already passes `db`, so this changes no
  runtime behavior.
- Replace 16 hand-written 404 literals with one helper.
- Delete two single-purpose files. Each file's logic fits naturally beside
  an existing sibling.
- Cut comment lines that restate change history by name, per `CLAUDE.md`.

**Non-Goals:**
- Changing what role any route requires. Changing any status code, body
  shape, or CORS behavior. The `http-wrapper` and `authorization`
  capabilities stay as they are.
- Touching `server.ts`'s `BINARY_ROUTES` handling.
- Dropping the same `db: SQL = sql` default anywhere in `src/engine`.
  `store.ts`, `transition.ts` and a dozen sibling files carry the identical
  pattern. The Goals section above calls that pattern the most serious
  hazard. This change's audit stops at `src/http` and `src/auth`. The
  engine-layer instances stay out of scope. The next section's risk note
  explains why that scoping does not undercut the http-layer fix.
- Dropping the same `db: SQL = sql` default on `src/auth/users.ts`'s five
  exported functions: `createUser`, `setRoles`, `setPassword`,
  `setManagerByEmail`, `setDisplayNameByEmail`. That is 5 sites, one per
  function, none overloaded. This file sits inside
  the audited `src/auth` directory, but it differs from every site this
  change does fix. Its own caller, `src/auth/cli.ts`, calls all five
  functions today with no `db` argument. That caller genuinely relies on
  the default. It does not merely tolerate an unused one.

  Dropping the default here would need updating every `cli.ts` call site in
  the same change. It is not a signature-only tightening behind an
  already-explicit caller. That is a separate, larger change. This one
  confines its `db`-default work to sites where the existing caller already
  supplies `db` explicitly. That includes `createServer`'s route table and
  `handleLogin`'s own entry in it.
- A general-purpose middleware or plugin system for gates. `route`'s `gate`
  parameter is a plain `(actor: Actor) => void | Promise<void>` callback. It
  is not a registry and not a chain.
- This change does not migrate every `resolveActor` call site to the new
  combinator. A handler whose gate needs the request body keeps its own
  inline `resolveActor` call. `POST /processes` (`handlePublish`) is the
  only such handler today. Its `requirePermission` gate reads `processId`
  out of the parsed request body, not out of a URL parameter. The spec
  delta's third paragraph, under "A role-gated route handler composes
  through one wrapper," states that carve-out.

  Six other sites use a different gate shape instead. `admin-routes.ts`
  gates two handlers through its local `requireDataListRead` composite.
  `studio-routes.ts` gates four handlers through `requirePermission`. Each
  reads `processId` from the URL, not the body. One of those four stacks a
  second gate on top of `requireAuthoring`. None of the six needs the
  request body, so none qualifies for the `POST /processes` carve-out
  above. All six migrate to `route` too. The Decisions section below, "The
  six `requireDataListRead`/`requirePermission` sites," states how.
- `handleListInstances` (`GET /instances`) is not a second carve-out of this
  kind. Its conditional gate depends on a parsed query parameter, not the
  request body. It does migrate to `route`. The Decisions section below,
  "`handleListInstances`'s conditional gate," states how.

## Decisions

**`route`'s parameter order and shape.** `route(req, resolver, db, gate,
fn)` mirrors `resolveActor`'s own `(req, resolver, db)` prefix. A call site
reads left to right: resolve, then gate, then run. That order is the
call-site reading order, not the order of execution outside `guarded`.
`route`'s entire body is one call to the existing `guarded(req, callback)`.
`guarded` is the outermost call. Its existing `mapError` covers every step
inside `callback`:

```ts
function route(req, resolver, db, gate, fn) {
  return guarded(req, async () => {
    const actor = await resolveActor(req, resolver, db);
    await gate(actor);
    return fn(actor);
  });
}
```

`resolveActor` and `gate` both run inside that `callback`. A throw from
either reaches `mapError` the same way a throw from `fn` already does. Two
throws matter here: an unresolvable credential from `resolveActor`, and
`AuthorizationError` from `gate`.

Calling `guarded` only around `fn` would put `resolveActor` and `gate`
outside it instead. `server.ts`'s dispatch loop carries no outer try/catch
of its own. A throw from either call would then surface as an unhandled
rejection, not the 401/403 response the scenarios below need.

The `gate` callback itself takes the resolved `Actor`. It either returns (or
resolves) or throws `AuthorizationError`.

Alternative considered: a `gate: string | string[]` role-name shorthand
instead of a callback. Rejected. `requireStudioRead` and `requireAuthoring`
are two-role helpers with their own logic, not a single role string. A
role-name shorthand could not cover every site without a second escape
hatch beside it. A plain callback covers every existing gate shape in one
signature: `requireRole(actor, X)`, `requireStudioRead(actor)`,
`requireAuthoring(actor)`, and a `requirePermission`-style async check.

**Two local not-found wrappers get deleted, not one.** `reporting-routes.ts`
has `notFound(processId)`. Its name collides with the shared helper this
change adds. That name collision forces its own task, 3.5a.

`admin-routes.ts` carries the same shape under a different name,
`notFoundList(listKey)`, at five call sites. It returns the same 404 shape.
Its message reads `no data list: ` followed by the list key. Its name does
not collide with the imported `notFound`. Nothing about `tsc` forces its
removal on its own.

Task 3.5b deletes it anyway. That is the same task that adds `notFound`'s
other `admin-routes.ts` call sites. The added requirement's "no module
carries its own literal" scenario covers a wrapper too, not just an inline
literal. A wrapper is not a legal way to satisfy a requirement written
against the literal it wraps.

**Where `route` lives.** `src/http/routes.ts`, beside `guarded` and
`resolveActor`. It imports neither `admin-routes.ts` nor any sibling
module. This matches the existing shape: sibling modules import from
`routes.ts`, never the reverse.

**`notFound`'s shape.** `notFound(message: string): HttpResult` returns the
exact object literal it replaces. It takes no status-code parameter. Every
one of the 16 sites uses 404. A second not-found-shaped status would be a
new requirement, not this one.

**`handleListInstances`'s conditional gate.** Today this handler resolves
the actor and parses several URL query parameters. It calls
`requireRole(actor, ADMIN_ROLE)` only when the parsed `scope` equals
`"all"`. That gate depends on the query string, not on the resolved
`Actor` alone. It does not fit `route`'s `gate: (actor: Actor) => void |
Promise<void>` signature unchanged. It differs from the `POST /processes`
carve-out above too. That gate needs the request body, which `route` never
sees at all. This one needs a value `route` could see, just not through
the parameter `gate` receives.

`parseScope` throws `RequestShapeError` on an unknown `scope` value. Today
that throw happens inside `guarded`'s own callback. `handleListInstances`
calls `parseScope` right after `resolveActor`, both inside `guarded(req,
async () => {...})`. So the existing `mapError` maps it to `400`.

Calling `parseScope` at the handler's own top level, before `route` runs,
would move that throw outside `guarded` entirely. `route`'s whole body is
`guarded(req, callback)`. Nothing at or before the `route(...)` call site
sits inside that callback. `server.ts`'s dispatch loop carries no
surrounding try/catch of its own around `await route.handler(...)`.

So an uncaught throw there becomes an unhandled rejection, not the `400`
this handler returns today. That is the same hazard the Decision above
rejects for `resolveActor` and `gate`. It applies to `parseScope` without
exception.

The migration keeps `parseScope`'s call inside `guarded`'s protection. It
moves the call into the `gate` closure, which `route` always runs inside
`guarded`. `new URL(req.url)` itself never throws for a `Request` the
runtime already accepted. Constructing the `URL` before calling `route`
therefore adds no new unprotected throw; only `parseScope`'s own call
needed to move.

A `let` declared in the handler's own outer scope holds the parsed value.
The `fn` callback can then read it too. `route` always runs `gate` before
`fn`, inside the same `guarded` callback. The assignment is visible by the
time `fn` runs:

```ts
const url = new URL(req.url);
let scope: "mine" | "started" | "all";
return route(req, resolver, db, (actor) => {
  scope = parseScope(url);
  if (scope === "all") requireRole(actor, ADMIN_ROLE);
}, (actor) => {
  // scope is assigned by the time fn runs; gate always runs first.
  // ...other query parsing that does not depend on the actor...
  // build the filter, using actor and the parsed params
});
```

This keeps `route`'s three-step contract intact: resolve, then gate, then
run. It lets the gate parse a value itself, inside the protected callback.
It does not read a value some unprotected code computed before `route` was
even called. The closure is the same pattern any `gate` callback could use
to stash a value for `fn` to read. It is not a special case `route` itself
needs to know about.

**The six `requireDataListRead`/`requirePermission` sites.** Two more gate
shapes exist, beyond `requireRole`/`requireStudioRead`/`requireAuthoring`.
Six sites use them. Both shapes already fit `route`'s `gate: (actor: Actor)
=> void | Promise<void>` signature. Neither needs a change to `route`
itself.

`admin-routes.ts` declares `requireDataListRead(actor: Actor): void`. It
takes the resolved actor alone. No request and no body sit in its scope.
That is the same shape `requireStudioRead`/`requireAuthoring` already
have. `handleAdminListDataLists` and `handleAdminGetDataList` gate on it.
Passing the function itself as `gate` needs no wrapping closure:

```ts
return route(req, resolver, db, requireDataListRead, async (actor) => {
  // ...
});
```

The module `studio-routes.ts` gates four handlers on
`requirePermission(actor, action, processId, db)`. Each reads `processId`
from the URL path, never from the request body.

`handleGetMigrationPlan` and `handleGetOrphanKeys` check `"migrate"`
alone. `handlePutMigrationPlan` checks `"migrate"` too. It still reads the
request body afterward, for the plan spec. That read stays inside `fn`,
not inside the gate. `route`'s contract holds either way. Each of these
three single-check sites becomes a one-line closure:

```ts
return route(req, resolver, db, (actor) => requirePermission(actor, "migrate", processId as ProcessId, db), async (actor) => {
  // ...
});
```

`handlePublishDraft` checks `"publish"` instead, stacked on top of
`requireAuthoring`. Its two-check gate composes both calls in one
closure. It runs `requireAuthoring` first, matching the order the current
inline preamble already runs them in:

```ts
return route(req, resolver, db, async (actor) => {
  requireAuthoring(actor);
  await requirePermission(actor, "publish", processId as ProcessId, db);
}, async (actor) => {
  // ...
});
```

Task 3.6 requires that no module declare its own copy of the preamble, by
name or by shape. These six sites need no carve-out from that requirement
once they migrate. `requireDataListRead` stays defined in
`admin-routes.ts` afterward. It is a reusable gate function, passed to
`route`. That is the same role `requireStudioRead`/`requireAuthoring`
already play. It is not a hand-rolled preamble, and not a 404 wrapper.

**Folding `ui-strings-routes.ts` into `admin-routes.ts`, not `routes.ts`.**
`handleGetUiStrings`'s sibling, `handleAdminListUiStrings`, already lives in
`admin-routes.ts`. Keeping the two together, beside the table they both
read, avoids splitting one concept across two files.

**Folding `health.ts` into `server.ts`, not `routes.ts`.** `checkDbReady`,
`handleLivez` and `handleReadyz` each have exactly one caller today. Every
one of those callers sits inside `server.ts`'s own special-cased branches.
Those are the branches for `/livez` and `/readyz` that the dispatch table
excludes. `routes.ts` holds handlers the dispatch table routes to. These
three are the ones the table skips, so `server.ts` is the more honest home.

**Comment cleanup gets no spec delta.** Deleting or rewriting a comment
changes no observable behavior. It changes no requirement scenario. A delta
here would restate a convention `CLAUDE.md` already states. Or it would
invent a requirement with nothing to test. tasks.md still tracks the work.
This design and the proposal record why it needs no spec change.

**Order of tasks.md's implementation.** Drop the `db` default first. It is a
pure signature tightening. No other step depends on its shape. Add
`notFound` and `route` next.

The two file deletions call handlers that both helpers already touch.
Building the helpers first avoids editing the same lines twice. Delete
`ui-strings-routes.ts` and `health.ts` last, once their call sites already
route through the shared helpers.

## Risks / Trade-offs

[Dropping the `db` default breaks a caller outside `createServer`] → A
repository-wide grep finds one such caller. `test/auth-login.test.ts`
calls `handleLogin(req, SECRET)` with no `db` argument, at 28 sites. No
*production* caller reachable through `createServer`'s wiring omits it.
Task 1.7a adds the missing `sql` argument at those 28 test sites, in the
same change. The file's other five call sites (lines 431, 432, 436, 442
and 446) already pass `sql` and `address` explicitly and need no change.
Any other compile error surfaces at `tsc`, well before any runtime risk.

[The http-layer fix leaves the identical hazard live in `src/engine`] → The
two layers differ in who calls them. Every `src/http` handler this change
covers sits behind an incoming request, with one exception. `server.ts`'s
`startHttpServer` is the production bootstrap entry point. It runs once at
process start, not per request. A future route handler that omits `db`
fails at `tsc` instead of misrouting a request.

A future bootstrap call that omits it fails at `tsc` instead of silently
starting against the wrong database. `src/engine`'s own functions have no
request-reachable call site outside the http and runtime-API layers.
Tightening them is a separable change with its own call-site audit.

That "runtime-API layer" is not a hypothetical second path. It is
`src/runtime/api.ts`. It carries the identical `db: SQL = sql` default on 14
exported functions: `createProcessInstance`, `getInstanceView`,
`submitAndTransition`, `claimStep`, `releaseClaim`, `delegateClaim`,
`cancelInstance`, `listInstances`, `getInstanceRecord`, `postComment`,
`listComments`, `uploadAttachment`, `listAttachments` and `getAttachment`.

Root `CLAUDE.md` names this module the Runtime API Layer. It states the
module's purpose in one line: "an integration drives a process with no
browser at all." That is the seam. A caller reaches these 14 functions with
no `src/http` request in the path at all. It is a different caller shape
than an incoming HTTP request, not a less-exposed one. The stated primary
hazard, silent wrong-tenant data access under multi-tenancy, stays live on
this path after this change ships.

This change does not close that path. The reason matches `src/engine`'s:
fixing `src/runtime/api.ts` means auditing every call site of those 14
functions, inside and outside `src/http`. This audit confines itself to
`src/http` and `src/auth`, stated in proposal.md's Why. Widening it to
`src/runtime` is a separable change, with its own call-site audit. It matches
the `src/engine` case's shape above.

`src/runtime/api.ts` still earns its own paragraph here. It does not just
fold into the `src/engine` case. It is reachable exactly the way this
change's own primary hazard is reachable. A reader checking this design's
completeness needs that path named on its own line. Leaving it implicit
inside the phrase "runtime-API layer" is not enough.

[`route` hides one extra indirection] → A reader already checked two
things: `resolveActor`, then a role helper. That one call collapses both
steps. This spec delta states its three-step contract in full.

[A later change adds `ADMIN_ROLE` to `handleGetUiStrings` by accident] →
The added requirement states its exemption explicitly. Test coverage for
`GET /ui-strings` keeps asserting that response.

[A comment rewrite deletes a fact, not history] → tasks.md scopes cleanup
to comments naming an old code shape. A comment stating a current
invariant stays untouched. None of the invariant comments
`.claude/rules/process-contract.md` relies on sit in the four files this
change touches.

## Migration Plan

No data migration applies. No deployment sequencing applies beyond the
ordinary build and test gate: `tsc`, then `bun run build`, then the full
`bun test` with `DATABASE_URL` set.

The `db`-default drop is the one item worth a rollback note. It might
surface an omitted-argument call site this design did not find. The fix is
to add the missing argument at that call site, not to restore the default.

## Open Questions

None. The proposal and this design resolve the two open items the audit
findings left implicit. Comment cleanup needs no spec delta; see Decisions
above. Each deleted file's logic lands where the Decisions section above
states.
