## Context

See `proposal.md` for motivation, and the four spec deltas for the
requirements. This document records the technical choices and what they cost.

Four pieces already exist and this change composes them rather than adding
machinery.

`executeManualTransition` (`src/engine/transition.ts:565`) takes
`(instance, pathId, body, actor, db, dataPatch?, assignmentRegistry?, events?)`.
It commits the named manual transition and then runs the instance to rest. It
already refuses a path the current step does not declare. It refuses a path
whose trigger is not `manual`. It raises `GuardRefused` when the guard says no.
Its `events` argument lands in the commit's own transaction, so a
caller-supplied event cannot outlive a rolled-back commit.

`PermanentError` (`src/engine/outbox.ts:79`) dead-letters a delivery without
consuming retries. `http.request` and `notification.email` both already raise
it.

`process-start.ts` is the closest sibling. It shows the shape. A handler parses
the config and reads `ctx.db` per delivery. It loads the acting instance and
resolves bodies through `createDefinitionStore(ctx.db)`. It checks for its own
prior effect before repeating it.

`validateInstanceQueryReferences` (`src/engine/definitions.ts:261`) already
resolves references into another process against the versions holding live
instances, and reports a `PublishFinding` rather than rejecting.

## Goals / Non-Goals

**Goals:**

- One handler file, composing the four pieces above.
- A target instance moves at most once per outbox row, under at-least-once
  delivery.
- A refusal reaches the operator quickly, as a dead-letter naming what refused
  it, rather than after five deliveries.
- The studio's config form for the new type comes from the config schema, with
  no hand-written surface.

**Non-Goals:**

- No new transaction shape. The handler runs where every handler runs, after
  the acting instance's own commit, outside the outbox's marking transaction.
- No locking of the target instance across the acting instance's transition.
  That would need `blocking`, which stays reserved.
- No expression in the config. See the decision below.
- No second path-selection language. The config names a path id.

## Decisions

### The config names a path id, not a target step id

An author writes `pathId`, and the handler passes it straight to
`executeManualTransition`.

The alternative was a target step id, with the handler searching the target's
current step for a path leading there. That is closer to how an author thinks.
It also survives a rebuild of the paths, as long as the steps keep their ids.

Cost ruled it out. Two paths from one step to the same target step are legal in
this contract. A step-id config therefore needs an ambiguity rule that nothing
else in the engine has. A path id needs none. Paths have also been first-class
named objects since `require-path-key-label`: `key` and `label` are both
required and non-empty. An author picks a named thing, not an internal id.

The cost is that the reference is version-specific. A target version that
rebuilds its paths carries different ids. Publish reports that as a finding
naming the versions carrying the path. That is the same treatment
`instance.query` gives its own step references. The same reason applies: the
population keeps moving after the check.

### The config names a field id, not an expression

`instanceIdField` is a plain string naming a field id. The handler reads
`acting.data[instanceIdField]` and expects an instance id. (The config schema
itself does not use the branded `FieldId` Zod type; see below.)

An expression was the obvious first shape, mirroring `process.start`'s
`inputMapping`. It buys a computed target. Nothing asks for one.

The field id wins on three counts. It is the exact shape `instance.query`
already writes a picked option's value into. The two halves of the pattern
therefore fit without an adapter.

It keeps the whole config flat, so `config-descriptor.ts` builds the studio
form. This change adds no authoring surface. The `instance.query` type had to
leave that question open, because its own config nests a list of comparisons.
This config does not nest at all.

And a publish-time check can resolve a field id against the body's own catalog.
It cannot do that for an arbitrary expression's result.

Revisit when a case needs a target the acting instance does not hold in a
field.

**The schema uses plain strings, not this codebase's branded id types.**
`processId`, `instanceIdField` and `pathId` are each `z.string()`. None uses
the branded schema from `src/schema/definition.ts` that every other reference
in the body uses. Those three branded schemas carry a `.regex()`
(`/^proc_/`, `/^field_/`, `/^path_/`).

That file's own docstring lists a pattern-constrained string outside the
supported subset. The `describeString` helper returns `undefined` for any
property carrying a `pattern` keyword, format `"email"` excepted. Running `describeConfigSchema` against both forms confirms it. The
branded form returns `undefined` for the whole schema. The plain-string form
returns three clean descriptors.

A branded property does not degrade to one hand-typed field. It takes the
WHOLE config back to the raw JSON textarea, the authoring surface this
decision exists to avoid.

Dropping the regex at parse time costs nothing. The publish-time checks below
resolve referential validity: `instanceIdField` against the publishing
catalog, `pathId` and `processId` against the target. The handler's own six
refusals check the same thing on delivery. A malformed value fails there,
named precisely, never as an opaque Zod parse failure at config-schema time.

This is the first flat, all-id action config in the codebase. That is why the
interaction has not surfaced before. `process.start`'s config nests
`inputMapping`, and `instance.query`'s nests `where`/`attributes`. Both
already fall back to the raw JSON textarea for an unrelated reason, nesting,
so neither exposed the pattern-exclusion rule. `notification.email`'s flat
config carries no id at all. This config is the first that is both flat and
made only of ids.

**Cost accepted, not solved here:** `openspec/specs/studio-plugin-config-form/
spec.md` states a requirement. It reads: "The instance.query form picks
references rather than accepting free text." That requirement holds
`instance.query`'s own config to a picker. That picker replaces a raw string
field, for exactly this class of cross-process reference.

Three flat strings build three plain text inputs instead. An author types
`path_<uuid>` from another process's body by hand, with no picker and no
validation until publish. This change does not build that picker. See
Risks.

### The transition runs as the system actor

`executeManualTransition` gets `SYSTEM_ACTOR`, so the target path's guard
evaluates against `system`.

Passing the triggering participant was the alternative. It would let a guard in
the target process check who triggered it.

Two things sank it. The triggering participant holds no role inside the target
process. A guard reading `actor.roles` there compares an identity that means
nothing where the engine evaluates it. And `HandlerContext.actors` is optional
by design: a row enqueued before the engine recorded actor ids carries none. A
guard could read a participant on one delivery and `system` on another, decided
by the row's age. That quiet ambiguity ends as a parked instance nobody can
explain.

Attribution does not go missing. It goes into the event below, where a guard
cannot reach it and a reader can.

### One event carries attribution and idempotency together

`instance.transitioned-by-action`, appended on the TARGET instance, carries
`{ byInstanceId, actionId, idempotencyKey, pathId }`.

It rides `executeManualTransition`'s existing `events` argument, so it commits
in the target's own transition transaction. A rolled-back transition leaves no
event, and an event never exists without its transition.

The `idempotencyKey` is what makes this more than a log line. Outbox delivery is
at-least-once, and the handler's transition commits outside the transaction that
marks the row delivered. A crash in that window redelivers a row whose
transition already landed. Without the key that redelivery looks exactly like a
collision with another acting instance. In both cases the target no longer
stands on the path's source step. The engine would dead-letter a delivery that
in fact succeeded.

So the handler's first act is a lookup: does this target carry an
`instance.transitioned-by-action` event with this delivery's idempotency key? If
yes, return success and touch nothing. This check runs BEFORE the current-step
check, and the ordering is the whole point.

The alternative was a deterministic marker elsewhere, the way `process.start`
derives `inst_${ctx.idempotencyKey}` as the started instance's id. There is no
equivalent here, because the target instance already exists and its id is not
ours to choose. The event is the only per-target record this change writes, so
it is where the key goes.

The lookup is one query against `instance_events`, filtered to one
`instance_id`. `instance_events_instance_idx` covers the instance; the payload
key is not indexed. A per-instance event count is small, so a scan inside one
instance is the right amount of work.

The event's `instanceId` is the TARGET's, not the acting instance's. It rides
`executeManualTransition`'s `events` argument, which
`commitTransition`/`planStepEntry` attach to the entry the call itself
produces (`src/engine/transition.ts:244`). The event lands wherever that
call's own instance argument points. The handler passes the loaded target
there, never the acting instance.

The handler builds one `AssignmentRegistry`
(`createDefaultAssignmentRegistry()`) per delivery. It passes that one
registry into both the redelivery lookup's own load and
`executeManualTransition`. This is the same single-construction shape
`process-start.ts` uses and explains. The handler shares one registry across
a delivery's calls. It is not a fresh one per call, and that is deliberate.

<!-- antislop: allow sentence-length -->
`ponytail:` per-instance event scan, no payload index. Add a partial index on
the payload key if an instance ever accumulates enough events for this lookup
to matter in a query plan.

### Every refusal is permanent, none is transient

Seven conditions dead-letter without consuming retries:

- an empty `instanceIdField`
- a target instance that does not load
- a target whose `processId` differs from the config's
- a `pathId` whose trigger is not `manual`
- a target not standing on the path's source step
- a target whose status is not `running`
- a guard that refuses

The `pathId`-trigger check runs before the handler calls
`executeManualTransition`. `commitManualTransition` itself treats a
non-manual `pathId` as an ordinary thrown `Error`
(`src/engine/transition.ts:529`). The outbox classifies that failure as
transient. An author's typo could name an automatic path instead of a
manual one. Left uncaught, that typo would burn all five attempts before
dead-lettering. That is exactly the delay this decision exists to avoid.

The rule behind all seven is the same. A retry helps when the world might
change underneath it. None of these change.

A target does not walk back to a step it left. A cancelled instance does not
resume. A path's trigger does not change between two deliveries of the same
row. A CEL guard is pure and total. It answers identically against the same
data and the same system actor on every delivery. Retrying spends four more
deliveries to report the same refusal later.

That makes the collision case the specs describe a five-second failure, not a
several-minute one. It puts the reason in `last_error` on the first delivery.

**An eighth condition joins the seven: a lost OCC race on the target.**
Inside, `executeManualTransition` commits through `commitTransition`
(`src/engine/transition.ts:390-398`). That statement carries the predicate
`WHERE instance_id = ... AND transition_seq = prevSeq`. A concurrent writer
that already advanced the target's `transitionSeq` makes the statement match
zero rows. The call then throws `ConcurrencyConflict`, not one of the seven
named failures.

The outbox's `FOR UPDATE SKIP LOCKED` claim exists precisely so that
different workers can deliver different rows at once. Two acting instances
targeting one instance can both load it while it still stands on the path's
source step. Both then pass the handler's own current-step check, and race
inside the same `commitTransition` call. The loser gets
`ConcurrencyConflict`.

Left uncaught, that is not an `instanceof PermanentError`, so the outbox
classifies it transient. That is the same delay this whole section exists to
avoid. Here it would fall on the one condition where two deliveries raced
each other, rather than one delivery repeating.

The handler SHALL therefore catch `ConcurrencyConflict` from
`executeManualTransition`, alongside `GuardRefused`. It rethrows the race as
a `PermanentError` naming the collision. A lost OCC race on this specific
call means what the current-step check already means.

Someone else's commit moved the target first. No database hiccup is at work
here. No retry would outlast one. So this joins the seven, not the two
conditions below.

The two conditions that stay transient are the ordinary ones: a database
failure, and the outbox's own lease deadline.

The handler's own `status !== "running"` check is load-bearing, not redundant
with `commitManualTransition`'s behavior. That function treats a non-running
instance as a silent no-op, not a throw. The comment at
`src/engine/transition.ts:518` calls this "Deliberately a no-op, not a
throw." Its other callers include internal idempotent re-entry, where a
no-op is correct. This handler needs the opposite answer: a non-running
target is a refusal to report, not progress to claim. The handler's own
check runs first and turns that silent no-op into a named `PermanentError`
before `executeManualTransition` ever sees the instance.

### Publish reports the path reference and rejects the field reference

The two checks split because the facts behind them behave differently.

`instanceIdField` resolves against the catalog of the publishing body. That
fact is in hand at publish time and does not move afterwards. A typo would
otherwise dead-letter every delivery, one instance at a time, with nothing said
at authoring time. So it throws.

`pathId` resolves into another process, against the versions holding live
instances. That population keeps moving: `createProcessInstance` accepts an
explicit version and migration moves instances between versions. A rejection
would rest on a fact that expires. So it reports a finding, exactly as
`instance.query`'s step references do.

`processId` throws when it names no published process, matching what
`process.start` and `instance.query` both already do.

### PublishFinding widens by two small steps

`referenceKind` admits `"path"`, and `dataSourceId` becomes optional.

An action site names no data source. Calling the action's location a data
source id would be a lie in a record an operator reads. One consumer renders
that field today, `ProcessHeaderBar.tsx:305`, and it falls back to the finding's
`loc`.

The alternative was a separate finding type for action sites. That doubles the
channel `definition-store` deliberately keeps general, and it doubles the
rendering, for two optional characters of difference.

`packages/web/src/areas/studio/api/types.ts:45` hand-mirrors the engine's
`PublishFinding` rather than importing it. This widening does not travel
there automatically. There, `dataSourceId` is `string` and required, and
`referenceKind` is `"step" | "field"`. Both stay narrower than the engine
type becomes. That file needs the same two edits `definitions.ts` gets, before
`ProcessHeaderBar.tsx`'s fallback has a type it can compile against. See
tasks.md.

### The target process needs the same publish-time read grant instance.query already carries

`instance.transition` mutates a live instance of another process. That is a
stronger reach than `instance.query`, which only reads one. The function
`validateInstanceQueryReadGrant` (`src/engine/definitions.ts:352`) already
gates that weaker case. The publishing author must hold `read` on the target
process before an `"instance.query"` data source's `processId` publishes
clean. That gate reads `publishBody`'s existing optional `actor` argument.

Shipping the stronger action with no equivalent gate would be backwards. An
author of process A could hold no relationship at all to process B, not even
`read`. That author could still publish an action that forces any live B
instance off its current step. Merely reading B's instances would still need
a grant. This change extends the existing check rather than adding a second one
beside it.

The function `validateInstanceQueryReadGrant` becomes
`validateCrossProcessReadGrant`. It collects target `processId`s from two
sources instead of one. The first is every `"instance.query"` data source's
`config.processId`, as today. The second is every `instance.transition`
action's `config.processId`, found by the `collect(body)` walk
`validateInstanceTransitionReferences` uses. Both sets check against the same
`read` permission.

That permission is the floor `instance.query` already established for looking
at another process's instances. It is not a perfect fit for driving one.
`Permission` (`src/auth/authorize.ts`) declares no kind that names "mutate
another process's instance" more precisely. Shipping zero check is worse than
reusing the nearest kind that exists. A dedicated permission is an Open
Question below, not solved here.

The rename costs nothing at the call sites. The function stays unexported.
`publishBody` calls it once, by name, at the placement it calls the narrower
version today.

#### Scenario coverage this decision adds

- Publishing rejects an author who holds no `read` grant on the target
  process and carries an `instance.transition` action naming it. It rejects
  an equivalent `"instance.query"` source the same way today.
- An author holding `read` on the target, or the reserved operator role,
  publishes normally.
- A publish supplying no actor skips the check for `instance.transition`,
  exactly as it already does for `"instance.query"`. Both HTTP publish routes
  supply an actor, so no route-reachable publish escapes it.

## Risks / Trade-offs

**The built config form makes an author type a foreign path id by hand** →
`config-descriptor.ts` (`src/engine/config-descriptor.ts`) renders `pathId`
and `instanceIdField` as plain text inputs. It offers no picker into the
target process. `instance.query`'s purpose-built form
(`studio-plugin-config-form`) does, for its own references. A typo
dead-letters at delivery rather than failing at authoring time. The
cross-process check below may catch it as a finding first.

Accepted for this change: build the flat form now. Add a purpose-built
picker as its own later `studio-plugin-config-form` change, if this
friction turns out to matter in practice. That is the same way
`instance.query`'s picker followed its own config schema rather than
shipping with it.

**A published body's path reference goes stale after the target republishes** →
Publish reports it as a finding at authoring time. A stale reference
dead-letters with the path id in `last_error` rather than failing silently. The
acting instance keeps its own progress either way.

**The acting instance advances even when the target does not move** → Every
action already lives under this post-commit contract. It is not new here. The
onboarding continues and the laptop stays on the shelf. The operator sees a
dead-lettered row naming the target and the path. Coupling the two would need
`blocking`, which v1 reserves and does not build.

**Two acting instances race for one target** → The second dead-letters, naming
the step the target stands on. The entry in `docs/decisions.md` already
recorded this as the intended resolution. It called that a better failure than
a silent duplicate. The failure stays post-commit, so the second participant's
own onboarding has already advanced.

**The redelivery lookup gives a false negative** → The event and the transition
share one transaction. An event is missing only when the transition is missing
too. A false negative would need a visible transition whose own event is
missing. The transaction rules that out.

**An author points the action at a path whose guard reads `actor`** → The guard
sees `system`. A guard written for a human refuses. Publish cannot catch this,
because the guard is in another process's body and CEL is total. The
dead-letter names the path, which is the recovery path.

**The `data` value under `instanceIdField` is not an instance id** → The
handler loads nothing. It may instead load an instance of another process.
Either way it dead-letters, naming both process ids. The type check is a
runtime one, because a field's declared type is `string`. The contract has no
instance-reference field type. Adding one is a definition-contract change
nothing has asked for.

**This action is a fourth actor-free execution path** →
`docs/decisions.md` already names three actor-free paths. Its
process-scoped-permissions entry names a timer, an outbox delivery, and an
automatic transition. The relevant paragraph begins "One property rests on
the choice above." All three resolve a step's data with no actor in hand.
Authorization settles at publish rather than at runtime, for each.

`instance.transition` adds a fourth. It drives a target instance's
transition as `SYSTEM_ACTOR`, with no participant in the frame at all. This
is consistent with the other three, not a new pattern, and it costs nothing
today. It does mean something for later work.

If per-instance visibility ever lands, each actor-free path needs an answer
for whose view it resolves against. That includes this one, exactly as the
decisions entry already anticipates. This design needs no change now. It is
one more path a future answer must cover, not a door this change closes.

## Migration Plan

Additive throughout. No stored instance, published definition or
`definitionHash` changes.

The new event kind is additive to a discriminated union. Readers dispatch on
the kind, so a stored event of an older kind parses unchanged.

`PublishFinding.dataSourceId` becoming optional is the one shape change a
consumer sees. There is one consumer, and it gains a fallback.

Rollback is removal of the handler registration. A published body carrying the
action would then fail its own next publish on an unknown type. Its already
published versions would dead-letter the action's deliveries. That is the same
exposure every registered action type carries.

## Open Questions

- Whether an operator wants an admin-side retry that re-checks a dead-lettered
  `instance.transition` after the target moves back. The outbox screen's
  existing retry already re-runs the delivery, so that may already be the whole
  answer. Deferring this changes no spec and no task here.
- Whether cross-process mutation deserves its own `Permission` kind, distinct
  from the `read` grant this change reuses for `instance.transition`'s target.
  A `read` grant is a floor, not a precise fit. Nothing today distinguishes
  "may look at process B's instances" from "may drive one." Revisit if a
  second
  actor-visible action ever mutates another process, or if an operator asks to
  grant the two separately.
