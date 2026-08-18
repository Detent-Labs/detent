## Context

An over-engineering audit found five findings. One, dropping
`patternCache`, dropped out of scope during review; see the Decisions
section below. This change groups the remaining four because findings 2
and 3 touch the same paginated-read code path from two angles. Findings 1
and 5, numbered per the original five-finding audit, ride along in the
same files. See proposal.md for the per-finding rationale. This document
covers the shared helper shapes for findings 2 and 3, and the migration
shape for finding 5's compose change.

## Goals / Non-Goals

**Goals:**
- Remove duplicated pagination code from `src/runtime/api.ts`. Keep every
  function's external signature, return shape, and SQL semantics the same.
- Remove `resolveDataSourceOptions`'s memoization layer. Keep data source
  resolution results the same. `patternCache` is out of scope; see
  Decisions below.
- Simplify `checkAndRecordAttempt`'s eviction. Keep the evicted entry the
  same.
- Collapse the webhook-sink compose service into the `app` container. Keep
  what the sink answers, and how a contributor reaches it locally, the
  same.

**Non-Goals:**
- Changing the pagination API. That covers cursor encoding and page size
  defaults. It also covers sort order. `listInstances`, `getInstanceRecord`,
  `listComments`, and `listAttachments` keep exposing the same shape to
  their HTTP callers.
- Touching `src/http/routes.ts` or any other consumer of these four
  functions. Their call signatures do not change.
- Changing the rate-limit thresholds, window, or capacity values in
  `src/auth/login.ts`. Only the eviction mechanism changes.
- Adding host networking, port publishing, or any new dev-facing settings
  for the webhook sink beyond what already exists.

## Decisions

### `checkAndRecordAttempt`'s eviction (finding 1)

Replace the 12-line minimum-`windowStart` scan with a single **guarded**
removal: `if (map.size >= capacity) map.delete(map.keys().next().value)`.
That swap alone is wrong, in two independent ways. It drops the guard
below. It also needs one more change to the write path, described after
that.

**Why the naive rewrite is wrong.** `checkAndRecordAttempt` sets
`windowStart` in two places, not one. A brand-new key gets it from the
`map.set(key, { count: 1, windowStart: t })` call at the bottom of the
function. An existing key whose window has expired reaches that same
line too. `entry` is truthy, so the window check fails. Execution then
runs `map.set(key, ...)` with `key` already in the map.

`Map.prototype.set` on an already-present key updates its value in place.
It does not move the key to the end of iteration order. A re-armed entry
therefore keeps its old map position, while its `windowStart` becomes the
newest of any entry in the map. Insertion order and `windowStart` order
drift apart the first time this happens.

Concrete scenario. The code inserts key `A` first, at `windowStart = t0`.
It inserts key `B` second, at `windowStart = t1`, later than `t0`. Key
`A`'s window then expires.

A later request for key `A` arrives. The code re-arms it through the
shared `map.set` call. That call sets `A.windowStart` to `t2`, the newest
value in the map. Key `A` still stays first in iteration order, since it
was already a key.

Key `B` is still live, with `windowStart = t1`, earlier than `t2`. Key
`B` is now the true oldest window. It sits second in iteration order,
though, behind the freshly re-armed key `A`. An eviction triggered by
some third key `C` reaching capacity now runs
`map.delete(map.keys().next().value)`. That call removes key `A`, the
newest window, instead of key `B`, the true oldest. It contradicts
`local-user-accounts`'s "removes the entry with the earliest window start."

**The fix.** Make the re-arm path remove the key before it re-sets it:

```
if (!entry) map.set(key, { count: 1, windowStart: t });
else { map.delete(key); map.set(key, { count: 1, windowStart: t }); }
```

Or, equivalently, remove the key unconditionally before the shared
`map.set` call. Removing an absent key is a no-op. Removing first forces
the re-insert to land at the end of iteration order, the same place a
brand-new key lands.

With that in place, every write that sets a `windowStart` also places its
key at the current end of iteration order. That restores "first key in
iteration order" as an invariant equal to "earliest `windowStart`". The
increment path (`entry.count += 1`) still never touches `windowStart`.
It still never re-inserts, so it cannot break the invariant. Only then
does the guarded `if (map.size >= capacity) map.delete(map.keys().next().value)`
compute the same eviction the 13-line scan did.

No spec delta accompanies this change. `local-user-accounts`'s existing
requirement text says `checkAndRecordAttempt` evicts "the entry with the
earliest window start." That stays true after the fix above. The
requirement describes eviction order, not the scan mechanism, so the
spec's wording stays accurate. It stays accurate only with the
remove-before-re-set change included, not with the naive one-line swap
alone.

**Test.** No existing test exercises a re-arm-then-evict-elsewhere
ordering. The scenario needs four steps, in order. First, insert entry
`A`. Second, insert entry `B` after `A`. Third, let `A`'s window expire,
then re-arm it.

Fourth, bring a third key, `C`, to capacity, forcing an eviction.

See tasks.md's 1.3, which now adds this case, rather than only
re-running the existing suite unmodified.

**Alternative considered**: keep the scan, but shorten it. Rejected. Once
the write path keeps insertion order in sync with `windowStart` order, the
`Map` behavior is not a shortcut around the requirement. It already
satisfies the requirement for free. Keeping any scan at all would keep
dead code on purpose.

**The capacity guard.** The naive swap loses a second thing besides
ordering. It drops the while loop's own repeat condition, `while
(map.size >= capacity)`. That condition is what makes eviction
conditional: it fires only when capacity still holds after the sweep
runs. A literal `map.delete(map.keys().next().value)` with no guard
evicts unconditionally. That holds whether or not the sweep already freed
enough room.

<!-- antislop: allow passive-voice -->
`local-user-accounts`'s own scenario title requires exactly the guarded
behavior. Quoted verbatim: "Expired entries are reclaimed before capacity
is judged." When the sweep frees enough capacity, the new email
or address stays "tracked normally," with no further eviction. An
unconditional removal evicts a live, unexpired entry in that case, which
the scenario forbids.

The fix keeps a single guarded removal in place of the while loop:
`if (map.size >= capacity) map.delete(map.keys().next().value);`. With
the re-arm fix above in place, insertion order already matches
`windowStart` order. So at most one eviction is ever needed to bring the
map back under capacity once the new key lands. A `while` is no longer
necessary, but the `if` guard stays required. See tasks.md's 1.1.

### Paged-read helper and `keysetPage` (findings 2 and 3)

Two separate helpers solve two different kinds of duplication.

A **paged-read helper** (finding 2) removes the SQL-shaped duplication
between `listComments` and `listAttachments`. Both functions decode the
same cursor shape. Both overfetch with the same `LIMIT limit + 1`. Both
select the same `created_at::text AS created_at_cursor` column.
`listComments` carries the inline comment explaining that fix.
`listAttachments`'s doc comment references it rather than repeating it. Both
assume the same row shape.

The helper takes the table name, the column list, the `instanceId`
filter, the page `limit`, and the incoming cursor. It decodes the
cursor and runs the `LIMIT limit + 1` query. It returns the raw
overfetched rows. It does not take a
row-to-item mapper and does not produce `items`. That mapping stays
with the caller, the same split `keysetPage` uses below. That is
everything both call sites need before their SQL predicates diverge.

A **`keysetPage(rows, limit, cursorOf)` helper** (finding 3) removes a
duplicated tail. That tail is `hasMore`, `pageRows.slice(0, limit)`, the
last-row pick, and the `encodeCursor` call. All four functions duplicate
that tail today.

`keysetPage` takes the raw overfetched `rows`, up to `limit + 1` long. It
also takes `limit`, and `cursorOf: (row) => string[]`. `cursorOf` maps
one raw row to the tuple `encodeCursor` expects. `src/pagination.ts`'s
`encodeCursor(parts: string[])` accepts nothing looser. `keysetPage` returns
`{ pageRows, hasMore, cursor }`. It does not take a row-to-item mapper,
and it does not produce `items`.

Row-to-item mapping stays entirely with the caller. Each call site
applies it to `pageRows`, either before or after the `keysetPage` call.
The four mappings are not uniform enough to force through one shape.
`listInstances`'s mapping, `toSummaryItem`, is `async`. It runs as a
`Promise.all` over `pageRows`, and it filters out `undefined` results, via
`resolved.filter((item): item is InstanceSummaryItem => item !==
undefined)` today.

A helper parameter typed `toItem: (row) => Item` cannot express that
async, filtering map. It would need to become async itself. That would
force every sync caller through an `await` call. Or it would need a
second, optional parameter, just for `listInstances`'s case.

That repeats a shape the Alternative considered below already rejects,
for a differently-shaped helper. It is as many optional parameters as
the duplication it removes. Keeping the mapping outside `keysetPage`
avoids that shape. Every call site maps `pageRows` however it needs to:
sync, async, or filtering. It then calls `keysetPage` for the
hasMore/slice/cursor tail alone.

The function `listInstances` needs this helper too. So does
`getInstanceRecord`. Neither shares finding 2's SQL shape. Their tables
differ. Their filter predicates differ too. The function
`getInstanceRecord`'s cursor is also a 3-tuple, over a `UNION ALL` of two
tables.

`listComments` and `listAttachments` end up calling both helpers. They use
the paged-read helper for the query. They use `keysetPage` for the tail.

Only `listInstances` and `getInstanceRecord` skip the paged-read helper.
Their queries differ enough that forcing them through it would not
simplify anything. One has a different filter set and a join. The other
has a 3-column cursor.

Both still call `keysetPage` for their tail, the same as `listComments`
and `listAttachments` do. All four functions call `keysetPage`. Only two
of the four also call the paged-read helper.

**Alternative considered**: one combined `pagedQuery` helper covering both
concerns for all four functions. Rejected. `getInstanceRecord`'s row source
merges `history_entries` and `instance_events` with `UNION ALL`, mapped
through a `kind`-discriminated union. `listInstances`'s filter predicate
(assignment, status, degraded-instance exclusion) has no analog in the
other three. A single shape over all four would need as many optional
parameters as the duplication it removes. That is the shape this audit
flags as bloat in the first place.

**Out of scope: `listOutbox` and `listPendingTimers`.**
`src/engine/admin-queries.ts`'s `listOutbox` and `listPendingTimers`
duplicate the same `hasMore`/`pageRows.slice(0, limit)`/last-row/
`encodeCursor` tail that `keysetPage` targets. Both call the same shared
`encodeCursor`/`decodeCursor` pair from `src/pagination.ts`. That file's
own docstring already names both files as consumers. This change leaves
both functions untouched.

They live in `src/engine/`, not `src/runtime/api.ts`. This change's
Goals section scopes the pagination cleanup to that one file. Folding
them in would widen the change to a second module for a pattern this
design already extracts once. A follow-up change can apply `keysetPage`
there without redoing this one's review.

### Dropping `resolveDataSourceOptions`'s memoization; keeping `patternCache` (finding 4)

The original audit flagged two caches. Only one is in scope. This change
removes `resolveDataSourceOptions`'s `Map` cache outright, with no
replacement cache shape. It leaves `patternCache` alone; that cache stays
exactly as it is today. This decision fixes something an earlier draft of
this design got wrong, caught in review.

**Why `patternCache` stays.** `runtime-api` carries an existing,
unmodified requirement, quoted here verbatim. The quotes below keep the
spec's own passive wording unchanged on purpose; rewriting a quotation
would misquote it.

<!-- antislop: allow passive-voice -->
> A pattern constraint is tested only after the length constraints pass,
> against a cached expression.

The requirement's own text mandates the caching directly:

<!-- antislop: allow passive-voice -->
> The compiled `RegExp` for a pattern SHALL be cached per published body
> rather than constructed per submission and per field.

It carries its own scenario too:

> Repeated submissions reuse one compiled expression.

Removing `patternCache` would violate that requirement outright, not
merely go undescribed by it. An earlier draft claimed "no requirement
describes this caching behavior." That claim was factually wrong.

This change also carries no `runtime-api` capability delta to justify
loosening the requirement. A live, unmodified requirement sits out of
scope for a no-behavior-change cleanup. Loosening it would need its own
proposal. That proposal would weigh the ReDoS-mitigation rationale the
requirement's own text gives, for caching a compiled pattern per
immutable body.

That same earlier draft rested on a second, independently wrong claim
too. It claimed a `ProcessBody` is "long-dead" between submissions, so
`patternCache`'s `WeakMap` "only stops a long-dead `ProcessBody` from
garbage collection." `src/runtime/api.ts`'s `getStore`, wrapping
`src/engine/definitions.ts`'s `createDefinitionStore`, caches
`ProcessBody` objects, keyed by `processId:version`, for the life of the
running process, not per request. The same `ProcessBody` object serves every submission against
that published version.

`patternCache`'s `WeakMap` therefore amortizes a real, repeated cost.
Without it, every submission against a long-lived, frequently-submitted
version would recompile the same `RegExp` again. That is exactly the
per-submission cost the requirement above rules out.

**Why `resolveDataSourceOptions`'s cache still goes.** No requirement
anywhere in `runtime-api`, or elsewhere, governs this one's caching. Only
the resolved values carry a specification, never a caching behavior for
them. Its `Map` cache is also short-lived in a way `patternCache` is not.
The function `resolveFields` builds it fresh on every call and discards
it at the end. Its lifetime is exactly one step's one field-resolution
pass.

It only pays off when two or more fields on the same step share a
`dataSource` and need identical held values. That is a real but narrow
case, and `resolveFields` already runs once per view render, not in a
hot loop. This design judges the gain not worth the 18 lines.

No spec delta accompanies this removal. No requirement describes
`resolveDataSourceOptions`'s caching; only the resolved values carry a
specification, and those stay the same.

**This removal changes tests, not only source.**
`test/data-source-resolution.test.ts` carries two DB-backed tests that pin
the cache this section removes.

The first test sits at lines 110-121. Its name says what it checks: "two
fields sharing one data source resolve it exactly once per resolveFields
call." The file's own comment at lines 27-28 names the same behavior: "for
the resolve-once memoization check." It asserts `handler.resolve` runs
exactly once. `field_country` and `field_tags` both bind to
`ds_countries`, both with empty held values, in one `getInstanceView`
call.

The second test sits at lines 187-198. Its name says what it checks:
"two fields sharing one data source resolve once when their held values
match." It makes the identical `expect(calls() - before).toBe(1)`
assertion. Its `field_country` value is `"us"` and its `field_tags`
value is `["us"]`: held values that match, so today's cache resolves
them through one call. It depends on the same per-call cache.

Both assertions pin the exact cache this section removes. Dropping the
cache makes the handler resolve twice in each case. So both tests go red
the moment this change lands, unmodified. The values a field's options
resolve to stay the same either way; only the call count each test pins
moves. See tasks.md's 4.3 and 4.4, which change both tests' assertions
(to `2` calls) and the shared comments.

An earlier pass of task 4.2 wrongly claimed the test would "pass
unmodified."

**Alternative considered**: drop `patternCache` too. The theory: the same
reasoning applies to both. A cache whose lifetime does not outlive the
call that builds it saves nothing. Rejected.

The premise is false for `patternCache`. Its lifetime, the life of a
cached `ProcessBody`, not one call, is exactly what `getStore` gives it.
A live spec requirement names that lifetime as the point of the cache.
The two caches only look alike at a glance. They differ in both lifetime
and in whether a requirement governs them.

### Webhook sink moves into the `app` container (finding 5)

`scripts/dev-webhook-sink.ts` already runs standalone. The
`webhook-sink` service's `command: bun run scripts/dev-webhook-sink.ts`
proves that. Running it inside `app` needs only one change. Start that
same command inside the container the `app` service already builds. That
replaces building a second image to run it in.

The concrete mechanism changes what the `app` service's `command:` line
runs. It moves from the plain string `sleep infinity`. The new value is
the exec-form array
`["sh", "-c", "bun run scripts/dev-webhook-sink.ts & sleep infinity"]`.

The `sh -c` wrapper matters. Without it, Compose's plain-string
`command:` form word-splits the string. It execs the result directly
against the base image, with no shell involved. A bare
`bun run scripts/dev-webhook-sink.ts & sleep infinity` string would pass
`&` to `bun` as a literal argument. It would not read as a shell
background operator. `bun` would then run in the foreground, and
`sleep infinity` would never start.

Routing the same two commands through `sh -c` gives `&` its shell
meaning. The sink starts in the background, then `sleep infinity` runs
and keeps the container alive. The `app` service ends up running two
things inside one container and one image: the sink, and its own idle
wait.

The `app` service declares no `working_dir` today; Docker's unset default
resolves to `/`. This change removes the `webhook-sink` service, which
today declares `working_dir: /workspace` explicitly. That declaration is
why its relative `bun run scripts/dev-webhook-sink.ts` command finds the
file. Moving that same command into `app`'s wrapper, without also moving
the `working_dir` declaration, would resolve the relative path against
`/`.

The repository is not mounted at `/`. The compose file's bind mount puts
it at `/workspace` only, so `bun` would fail immediately, unable to find
the file. That failure hides behind the wrapper's own backgrounding (`&`)
and `sleep infinity`. The container keeps reporting healthy, since the
healthcheck only runs `bun --version`, while the sink never listens. Every
`http.request` action in both examples then dead-letters on connection
refusal. The fix adds `working_dir: /workspace` to the `app` service
alongside the `command:` change, matching what `webhook-sink` already
declares.

**Rejected mechanism: `postCreateCommand`.** An earlier draft of this
design offered starting the sink from `devcontainer.json`'s
`postCreateCommand`. It described that hook as "an entrypoint step that
already runs once per container start." That description is wrong.
`postCreateCommand` runs exactly once, when the container is first
created, not on every start.

`devcontainer.json` today declares only `postCreateCommand`
(`"bun install"`). It declares no `postStartCommand`. `postStartCommand`
is the hook that runs once per container start, including a
`docker start` after a stop, with no rebuild.

Had an implementer followed the rejected alternative, the sink would
answer after the first `up`. It would then stay dead after any later
stop/start cycle that skips container creation. That would silently
break `examples/expense-approval.json`'s walkthrough, and
`examples/purchase-requisition.json`'s, until a full rebuild. The
`command:` wrapper above carries no such gap. It re-runs every time the
container starts, by definition. So the sink restarts with it every
time.

`HTTP_ACTION_ALLOWED_HOSTS` changes from `webhook-sink:8080` (a
compose-network service name) to `localhost:8080`, the port
`scripts/dev-webhook-sink.ts`'s `PORT` constant binds. That constant stays
unchanged by this task. The sink now listens inside the same container as
the engine's dev server and test suite. It answers on `localhost` instead
of the compose network, at the same port number as before.
`app`'s `depends_on` list drops its `webhook-sink` entry. A container
cannot depend on itself.

`examples/expense-approval.json`'s two `http.request` targets
(`webhook-sink:8080/...`) point at the matching `localhost:8080/...` target
after this change, in the same implementation pass; see tasks.md. Left
stale, the example would fail its own `book`/`escalated_review` scenarios
the moment the old hostname stops resolving.

`examples/purchase-requisition.json` names `webhook-sink:8080` too, on
its `issue_po` step's `onEntry` and `onCancel` `http.request` actions. An
earlier pass of this proposal's Impact list missed it. So did tasks.md's
task 6, which named only `expense-approval.json`. It gets the same
`localhost:8080` target, in the same commit as `expense-approval.json`'s.
Left stale, its target would resolve to nothing once the compose service is
gone.

This change needs no new `HTTP_ACTION_ALLOWED_HOSTS` entry for
`purchase-requisition.json`. It names the same host
`expense-approval.json` already uses. Only the JSON's own URL strings
need to change.

**Alternative considered**: keep `webhook-sink` as a service, but drop its
own `build:` block and point `image:` at the tag `docker compose build app`
already produces. Rejected. Compose has no build-output sharing between
services without a named image. Pinning one adds a build-order dependency
and a stale-image hazard. Removing that hazard is the point of this
finding, not relocating it.

## Risks / Trade-offs

A contributor's local `docker-compose.override.yml` may have published a
port for the old `webhook-sink` service. That override now targets a
service that no longer exists. `docker compose up` reports a failure
naming the unknown service. Mitigation: call this out as **BREAKING** in
proposal.md and in tasks.md's implementation notes. It ships in the same
PR description a contributor reads before pulling.

Running the sink inside `app` puts a script crash or port conflict in the
same container as the dev server. It also shares that container with the
test runs. Today the sink runs in an isolated one.

The sink is a 35-line echo server with no external dependencies and no
state. Its failure mode, an `http.request` action timing out, is already
visible today whenever the separate service was unhealthy. No new failure
class appears. The sink no longer needs its own healthcheck contending
with `app`'s.

Dropping `resolveDataSourceOptions`'s cache can double the number of
`handler.resolve` calls a data source's plugin handler sees. That happens
when two fields on one step share a data source with matching held
values. The function `resolveFields` used to memoize that call per pass.
Now each field triggers its own call instead. The resolved *values* stay
identical, so a pure, read-only handler sees no difference.

A plugin data source backed by real external I/O is different. Examples:
a rate-limited API or a metered, paid API. Any handler whose own SLA
assumes one call per field-resolution pass also qualifies. That handler
now sees twice the call volume for the shared-data-source case.

Mitigation: none built into this change. A data source handler with a
real external-I/O cost should memoize on its own side. It can do so the
same way `patternCache` memoizes for the pattern-constraint path. See the
"Why `resolveDataSourceOptions`'s cache still goes" section above. It
explains why this change accepts that trade-off instead of keeping the
per-call cache.

`keysetPage`'s generic `cursorOf` signature could tempt a future author to
force a fifth pagination call site through it. That risk is real even
where the fit is as poor as `listInstances`'s and `getInstanceRecord`'s
SQL. Mitigation: the design above scopes the helper to the
hasMore/slice/encode tail only. Any future SQL divergence should stay
inline, the way `listInstances`'s filter predicate does today.

## Migration Plan

<!-- antislop: allow synonym-rotation -->
This list uses "update" for editing a file. It uses "change" elsewhere for
the OpenSpec change itself (see Context). Those are two different
concepts sharing a word family, not a rotation to fix.

1. Land the `src/auth/login.ts` and `src/runtime/api.ts` refactors first
   (findings 1-4). Findings 1-3 carry no observable behavior difference.
   Finding 4 is the one exception, per the Risks section above. It can
   double a plugin data-source handler's call volume for the
   shared-data-source case. None of the four carries a compose dependency,
   so all four can merge and verify independently of finding 5.
2. Update `.devcontainer/docker-compose.yml`: remove the `webhook-sink`
   service, add `working_dir: /workspace` to the `app` service (it
   declares none today). Update `app`'s `command:` to start the sink
   script, remove `webhook-sink` from `app`'s `depends_on`, and update
   `HTTP_ACTION_ALLOWED_HOSTS`.
3. Update `examples/expense-approval.json`'s two `http.request` targets and
   `examples/purchase-requisition.json`'s two `http.request` targets to the
   new `localhost` host, in the same commit as step 2. Neither example
   should have a moment where its targets point at a host nothing serves.
4. A contributor with a `docker-compose.override.yml` publishing a port
   for the old `webhook-sink` service updates it to target `app` instead.
   See the Risks section above.
5. Rebuild the devcontainer (`devcontainer up --build` or equivalent).
   Walk both `examples/expense-approval.json` and
   `examples/purchase-requisition.json` end to end, confirming the sink
   answers from inside `app` for every relocated `http.request` target.

Rollback is a plain revert of the compose and example changes. Findings 1-3
(per this document's Decisions numbering, `patternCache` excluded) carry no
rollback concern, since they change no observable behavior. Finding 4 is the
one exception. Reverting it restores the per-call cache and the lower call volume a
shared data source saw before this change. That is itself an observable
behavior change, not a no-op. See the Risks section above.

## Open Questions

None. An earlier draft left the auto-start mechanism open. One choice started
the sink unconditionally on every `app` container start. The other started it
only when a contributor ran a dedicated script by hand.

The Decisions section above settles it. The sink starts unconditionally. It
uses the `command:` wrapper in the "Webhook sink moves into the `app`
container" section. tasks.md's task 5.3 builds that wrapper.
