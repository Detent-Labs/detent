## Context

See `proposal.md` - Why for the motivation. This section covers only the
current code the design builds on.

`ROADMAP.md`'s stage 39 entry names `createProcessInstance` as the
mechanism and says it "needs an optional `id`." That premise does not
survive: `createProcessInstance` requires an `Actor` and a
`DataSourceRegistry`, and `HandlerContext` carries neither. The section
below explains why, and what this design uses instead.

`src/engine/subprocess.ts::makeSpawnHandler` is the closest precedent. It
resolves a child body, evaluates `inputMapping` with `evalFieldMap`, and
creates the child with the low-level `store.ts::createInstance`. It then
drives the child to rest with `resolveAutomatic`.

That handler never calls the richer `runtime/api.ts::createProcessInstance`.
This function needs an `Actor` and a `DataSourceRegistry`. `HandlerContext`
carries neither, because this function validates participant-typed
submissions. A chain's seed data is engine-computed CEL output, not a
participant submission. The same rationale applies here.

The spawn handler closes over `db` and the definition store at
registry-build time. This happens in `src/engine/host.ts::tenantContexts`,
per tenant, only for the `core.*` pair. Those handlers cannot read a
handle off `HandlerContext`.

The `action-handlers` spec states the opposite rule for an ordinary
handler. It SHALL take that handle from its invocation context. It SHALL
NOT take one a caller bound when building the registry.

Both `http.request` and `notification.email` already follow that rule,
reading `ctx.db` per delivery. This new handler, `process.start`, is
author-visible, not `core.`-prefixed. So it follows the ordinary rule,
not the subprocess exception.

`HandlerContext` carries no `AssignmentRegistry` either.
`createDefaultAssignmentRegistry()` takes no arguments and closes over no
state. Every caller in the codebase already treats it as a cheap default
option. Calling it fresh inside the handler costs nothing and needs no
new plumbing.

This function, `describeConfigSchema` (`src/engine/config-descriptor.ts`),
returns `undefined` for the whole config type when any property is a
`z.record` or nested `z.object`. `SubprocessSpec.inputMapping` is
`z.record(fieldId, expression)`.

`httpConfigSchema`'s own `headers: z.record(...)` already falls back to
the raw JSON textarea for the whole `http.request` config. A
`process.start` config carrying `inputMapping` hits the same fallback.

This change needs no `studio-plugin-config-form` delta. The fallback path
already exists, and it already renders correctly for exactly this shape.

## Goals / Non-Goals

**Goals:**
- Reuse the codebase's existing mechanisms: deterministic ids,
  total-per-entry mapping, and drive-to-rest. Do not invent parallel
  versions for chaining.
- Keep the new handler stateless, registered in the same shared registry
  as `http.request` and `notification.email`. This needs no per-tenant
  wiring in `host.ts`.

**Non-Goals:**
- A pinned or contract-bound version reference for the chain target. A
  chain target declares no `ProcessContract`. Always resolving the newest
  published version keeps this change's surface small. A pinned-version
  option is future work if a concrete need appears.
- A reporting screen or API surface over `chainedFrom`. This field lands
  in the schema and stays queryable through the existing
  merged-record/JSON paths. A dedicated report stays out of scope, the
  way item 13 shipped after `columnMapping` shipped separately.
- Any change to `SubprocessSpec`, `ProcessContract`, or the subprocess
  spawn/return handlers themselves.

## Decisions

### The handler reads `ctx.db` per delivery; it does not close over a per-tenant handle

Alternative considered: register `process.start` the way `subprocess.ts`
registers its pair. That would close it over `db` and a `resolveLatest`
built at registry-construction time, wired through
`host.ts::tenantContexts`.

Rejected. The `action-handlers` spec is explicit about which shape an
author-facing handler takes.

`process.start` is author-facing by definition: an ordinary action type,
not `core.`-prefixed. The stateless shape also avoids widening
`tenantContexts`'s cache. It keeps `createDefaultRegistry()` as the
single place every stateless handler registers.

The handler builds its own `resolveLatest` per delivery, through
`createDefinitionStore(ctx.db).resolveLatest(processId)`. This allocates
a fresh, single-use cache Map per call, rather than reusing the
per-tenant cache `tenantContexts` keeps warm. Published versions stay
immutable, and the query is one indexed `SELECT ... ORDER BY version DESC
LIMIT 1`. The cost is one query per delivery, matching `http.request`'s
and `notification.email`'s own no-caching precedent. The outbox polls
every 500ms per tenant, not a hot path.

### The started instance id derives from `ctx.idempotencyKey`, not a new helper

This field, `HandlerContext.idempotencyKey`, is already a per-delivery,
redelivery-stable UUIDv5 (`src/engine/idempotency.ts::idempotencyKey`).
Building `` inst_${ctx.idempotencyKey} `` reproduces
`subprocessChildId`'s own `inst_${uuidv5(...)}` shape, with zero new
code.

Alternative considered: a new `chainInstanceId(sourceInstanceId,
transitionSeq, actionId)` helper, mirroring `subprocessChildId`'s
signature. Rejected as duplicate work. The outbox already derives that
exact key, `idempotencyKey(instanceId, transitionSeq, actionId)`, when it
enqueues the row. `HandlerContext` already carries the result.

### `chainedFrom` is a new field, not a reuse of `parent`

This field, `Instance.parent` (`{ instanceId, stepId }`), drives two
behaviors a chain must not trigger. One is `sweepCancelledChildren`-style
cancel cascade. The other is `planStepEntry`'s `if (target.terminal &&
instance.parent)` check, which enqueues a `core.returnSubprocess` action.

A chained instance reaching its own terminal step must not enqueue a
return action against a source instance. That source instance is not
parked and is not expecting one.

`chainedFrom` stays a plain optional instance id, read by nothing but a
future reporting query.

Adding it takes two steps. `Instance` (`definition.ts`) gains
`chainedFrom: instanceId.optional()`, next to `parent`.
`store.ts::createInstance`'s `opts` gains an optional `chainedFrom?:
string`, threaded into the seed object the same way `parent` and
`startedBy` already are.

### The publish-time check is a sibling to `validateCrossProcess`, not a change to it

This function, `src/engine/definitions.ts::validateCrossProcess`, runs at
a fixed place in `publishBody`: after the in-process
registry/assignment/data-source/CEL checks, before persistence. A
`process.start` check belongs at the same place, for the same reason. It
is a DB round-trip check that should not run before the cheaper
in-process ones.

It resolves differently, though. It needs no `contract`. Its
`inputMapping` targets check against `collectFieldsDeep(body.fields)`
instead of `contract.inputFields`.

The design adds a sibling function, for example `validateProcessChaining`,
called from the same site. This avoids branching `validateCrossProcess`
internally on action type versus subprocess step. Neither function's
logic then branches on a case it does not otherwise need to know.

### `mapping.entry-dropped` reuses as-is, recorded on the acting (source) instance

This event shape already carries `{ fieldId, direction, reason }` and
needs no new fields. `direction: "input"` already means "this mapping fed
a newly created instance's data." That is exactly what a chain-start's
dropped entry means too.

Recording it on the acting instance matches the subprocess precedent: it
records on the parent, whose context the mapping evaluated. This holds
even though the acting instance here is already `completed`.

Instance events form an append-only audit trail, regardless of instance
status. A suppressed `ActionOutcome` still records the same way, even on
a non-running instance.

The "Runtime record" section of `.claude/rules/process-contract.md`
describes `mapping.entry-dropped` as "a subprocess
`inputMapping`/`outputMapping` entry raised." That sentence becomes
incomplete once `process.start` reuses the same kind. `tasks.md` includes
updating it.

## Risks / Trade-offs

[Target versions could vanish before delivery] → Not expected: versions
stay immutable and undeleted while referenced. An operator would need to
delete every version of an unreferenced target process in a narrow
window after publish. The design treats a failed resolution as an
ordinary handler error. It throws, the outbox retries transiently, and
the row dead-letters on exhaustion. That matches any other unresolvable
external dependency, with no special-cased error class.

[A `process.start` config falls back to the raw JSON editor, unlike a
fully-supported schema] → This matches `http.request` today. It is not a
regression, and it needs no follow-up. The proposal's own "Impact"
section already excludes UI work.

[Building `createDefinitionStore(ctx.db)` fresh per delivery skips the
per-tenant cache `tenantContexts` keeps warm] → Accepted per the caching
discussion above. It costs one indexed query on a poll cadence measured
in hundreds of milliseconds, not a request path.

## Migration Plan

This change is additive only. It adds a new action type, a new optional
schema field, and a new publish-time check. That check fires only on
newly authored `process.start` actions. No existing published body,
running instance, or handler registration changes behavior.

No data migration applies, and no rollback beyond a normal revert applies
either. No existing row gains or loses a column value it did not already
have. That field, `chainedFrom`, stays absent on every pre-existing
instance, read the same way an absent `startedBy` already is.

## Open Questions

None. The proposal's capabilities list and the decisions above cover
every question stage 39's roadmap entry raised.
