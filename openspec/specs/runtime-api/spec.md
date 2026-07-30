<!-- antislop: allow-file passive-voice -->
# runtime-api

## Purpose

Defines the Runtime API Layer: the library boundary a UI (or, later, an HTTP
server) calls to run an instance without touching engine internals —
`createProcessInstance`, `getInstanceView`, `submitAndTransition`,
`claimStep`, `releaseClaim`. It is a library boundary, not a transport
(`src/runtime/api.ts`): plain async TS functions, resolving `ProcessBody`
internally so callers only ever touch `processId`/`instanceId`. Every
function takes an explicit `actor: Actor`, trusted as given — actor
resolution from an untrusted credential is the `actor-resolution`
capability's concern, not this one's. `submitAndTransition` enforces a
claimant-only check against `instance.assignment` (populated by the
`assignment-claim-enforcement` capability); `claimStep`/`releaseClaim`
delegate to that capability's engine implementation. List/history endpoints
are explicitly out of scope for this capability.

## Requirements

### Requirement: Create a process instance through the runtime API

`createProcessInstance(processId, actor, registry, opts?, db?)` SHALL create
a new instance of the newest published version of `processId` (or the
version given in `opts.version`), optionally seeded with `opts.data`, and
SHALL run it to rest (create-then-`resolveAutomatic`) before returning it.
`opts.data` SHALL be validated against the initial step's resolved view
before creation — field-set boundary, type, option membership (against
resolved `options`, covering both static and `dataSource`-bound fields, per
the `data-source-resolution` capability), constraints, and
`validation.rule`, the same rules `submitAndTransition` applies to a
submission — evaluated against a stub `Instance` (minted id, `transitionSeq:
0`, `currentStepId` the initial step, `status` derived the same way
`store.ts::createInstance` derives it) that is then passed as the
actually-created instance's id, so the instance created is exactly the one
that was validated. `createProcessInstance` SHALL take a required
`registry: DataSourceRegistry` parameter, threaded into the `resolveFields`
call that resolves the initial step's view for this validation.

The required check SHALL NOT run at creation, regardless of whether
`opts.data` is given: requiredness is a transition-time gate, enforced by
`submitAndTransition` whenever a step is left via a manual path, not an
existence-time gate on being created at or resting on one. An instance MAY
be created at a step whose view marks fields required and left with those
fields unfilled, to be supplied later via `submitAndTransition` — the
ordinary "create an empty instance, then fill in the initial step's form"
flow that `examples/expense-approval.json`'s "capture" step (itself the
initial step, with required fields) depends on.

#### Scenario: Creating an instance with no data seed
- **WHEN** `createProcessInstance` is called for a process with no `opts.data`,
  even when the initial step's view marks fields required
- **THEN** an instance is created pinned to the resolved version, run to
  rest, and returned — the required check does not block creation

#### Scenario: Creating an instance pins to an explicit version
- **WHEN** `createProcessInstance` is called with `opts.version` set to a
  published version older than the newest
- **THEN** the created instance is pinned to that explicit version, not the
  newest

#### Scenario: Creating an instance with a valid data seed
- **WHEN** `createProcessInstance` is called with `opts.data` satisfying every
  type/option/constraint/rule check on the initial step's view
- **THEN** the instance is created with that data present

#### Scenario: Creating an instance with an invalid data seed is rejected
- **WHEN** `createProcessInstance` is called with `opts.data` carrying a
  value that fails a type, option-membership, constraint, or
  `validation.rule` check on the initial step's view
- **THEN** it throws `SubmissionValidationError` carrying the corresponding
  issue for that field, and no instance is created

#### Scenario: A dataSource-bound field's seed data is validated against its resolved options
- **WHEN** `createProcessInstance` is called with `opts.data` carrying a
  value for a `dataSource`-bound field on the initial step that does not
  equal any of that data source's resolved options
- **THEN** it throws `SubmissionValidationError` with an `invalid-option`
  issue for that field, and no instance is created

### Requirement: Resolve a display-ready view of an instance

`getInstanceView(instanceId, actor, registry, db?)` SHALL return an
`InstanceView` describing the instance's current step, its resolved fields,
and its currently available manual paths, for an instance in any status.
This read uses the ordinary (unlocked) rehydrate path — a view is read-only,
so there is no concurrent writeback for it to race. `getInstanceView` SHALL
take a required `registry: DataSourceRegistry` parameter, threaded into the
`resolveFields` call that resolves the current step's view.

`getInstanceView` SHALL authorize `actor` against the loaded instance before
returning anything, per the `authorization` capability's relationship rule
(`ADMIN_ROLE`, or `startedBy`, or current claimant, or eligible candidate on
the current step), throwing `AuthorizationError` otherwise. `actor` is
therefore load-bearing twice — as the authorization subject and as the CEL
guard context `resolveFields`/`resolveAvailablePaths` evaluate against. For a
caller without `ADMIN_ROLE`, a failure to load the instance SHALL surface as
that same `AuthorizationError`, so an unrelated caller cannot distinguish a
nonexistent instance from one they may not read; a caller holding
`ADMIN_ROLE` SHALL see the ordinary not-found failure.

`fields` SHALL contain exactly the current step's `ViewField`s whose resolved
`visible` (literal `boolean`, used as-is, or CEL, evaluated with total
semantics, default `true`) is `true` against `buildGuardContext(body,
instance, actor)`, each carrying its resolved `required`, `readonly`, and
`options` (per the `data-source-resolution` capability: populated from
static `FieldDef.options` unchanged, or resolved at runtime for a
`dataSource`-bound field). A field resolving invisible SHALL be omitted
entirely, not included with a flag.

A `ViewField` whose `ref` resolves to a `FieldDef` of `type: "group"` (a
container, never a leaf value in `instance.data`) SHALL still appear in
`fields` when visible, so a caller can render its label/grouping, but its
`value` SHALL always be `undefined` and its resolved `required` and
`readonly` SHALL always be reported as `false` regardless of the view's own
declaration — it is never part of the visible-and-required set the required
check enforces, nor of the visible-and-editable set `submitAndTransition`
accepts.

`availablePaths` SHALL contain exactly the manual paths on the current step
whose guard currently holds against `buildGuardContext(body, instance, actor)` —
paths that don't match are omitted, not flagged. A guardless manual path is
always included (`evalGuard` treats no guard as satisfied). `availablePaths`
SHALL be empty when the instance is not `running`, when the current step has
no manual paths, or when every manual path's guard is false — `status` is
always present so a caller can distinguish these cases.

#### Scenario: An unrelated actor is refused before any field resolves
- **WHEN** an authenticated actor with no relationship to the instance and no
  `ADMIN_ROLE` calls `getInstanceView`
- **THEN** it throws `AuthorizationError`, and no data source is resolved and
  no field value is read out

#### Scenario: A related actor reads the view unchanged
- **WHEN** the caller is the instance's starter, its current claimant, an
  eligible candidate on the current step, or holds `ADMIN_ROLE`
- **THEN** the view resolves exactly as it did before this requirement
  changed — same `fields`, same `availablePaths`

#### Scenario: An invisible field is omitted
- **WHEN** a step's view marks a field's `visible` expression false against
  the instance's current data
- **THEN** that field is absent from `fields`

#### Scenario: A group-container field never reports as required
- **WHEN** a step's view references a `FieldDef` of `type: "group"` and marks
  it `required: true`
- **THEN** the resolved field's `required` is `false` and its `value` is
  `undefined`, regardless of the view's declaration

#### Scenario: A guarded manual path that fails its guard is omitted
- **WHEN** a manual path's guard evaluates false against the instance's
  current data
- **THEN** that path is absent from `availablePaths`

#### Scenario: A guardless manual path is always available
- **WHEN** a manual path on the current step carries no guard
- **THEN** it is present in `availablePaths` regardless of instance data

#### Scenario: View on a non-running instance still resolves
- **WHEN** `getInstanceView` is called for a `completed` or `cancelled`
  instance by an actor with a relationship to it
- **THEN** it returns the instance's `status` and its terminal step's
  resolved `fields`, with `availablePaths` empty

#### Scenario: View on a subprocess wait-state has no available paths
- **WHEN** `getInstanceView` is called for a `running` instance parked on a
  `subprocess` step
- **THEN** `status` is `"running"` and `availablePaths` is empty, since a
  subprocess step's paths are schema-enforced to be automatic, never manual

#### Scenario: A dataSource-bound field's view carries its resolved options
- **WHEN** `getInstanceView` is called for an instance parked on a step whose
  visible fields include one bound to a `dataSource`
- **THEN** that field's resolved `options` reflects the data source's
  resolved result, not an empty or undefined list

### Requirement: Submit data and trigger a manual transition atomically under a row lock

`submitAndTransition(instanceId, pathId, data, actor, registry, db?)` SHALL,
inside one transaction, read the instance row with a row lock (`SELECT ...
FOR UPDATE`), resolve and hash-verify its pinned `ProcessBody`, and — if the
current step has a declared (non-unset) `instance.assignment` — require
`actor.id === instance.assignment.claimedBy`, throwing `NotClaimedError`
when `claimedBy` is unset and `NotClaimantError` when it is set to a
different actor, before any submission validation runs.

A step with **no** declared `assignment` SHALL NOT thereby be open to every
authenticated actor: the caller must be the instance's starter
(`instance.startedBy === actor.id`) or carry `ADMIN_ROLE`, and SHALL be
rejected with `AuthorizationError` otherwise, before any submission
validation runs. This floor is deliberately weaker than the claimant rule —
starter or operator are the only relationships an assignment-less step
defines — and exists so that omitting one optional authoring key cannot make
a step writable by an actor with no relationship to the instance at all.

Once this check passes, it SHALL validate
`data` against the current step's resolved view (using the required
`registry: DataSourceRegistry` parameter to resolve `dataSource`-bound
fields' options, per the `data-source-resolution` capability) and against
`FieldValidation`, and — on success — commit the data write and the manual
transition on `pathId` atomically via `commitManualTransition`. The row lock
is held for exactly this one commit, not for any subsequent automatic-path
cascade.

The row lock exists because a wholesale `data` patch is not protected by the
`transitionSeq` optimistic-concurrency predicate: a concurrent `Action.output`
writeback (`outbox.ts`) patches a single field of `data` without advancing or
checking `transitionSeq`, so a wholesale patch computed from an unlocked read
taken before such a writeback lands, but committed after, would silently
discard it. `submitAndTransition` SHALL NOT use an unlocked read (such as
`store.ts::rehydrate` alone) for the read its commit is based on.

`submitAndTransition` SHALL take `instanceId`, never a caller-supplied
`Instance` snapshot, so the whole read-validate-commit sequence stays inside
one call and one transaction.

Every key in `data` SHALL lie within the current step's visible-and-editable
field set (`visible && !readonly`, excluding any `ViewField` resolving to a
group-container ref, resolved the same way `getInstanceView` resolves
`fields`, against the pre-submission committed data). A key outside that set
SHALL be rejected as `unknown-field` (not present in the resolved view) or
`readonly-field` (present but not editable) without touching the instance.

All located validation issues SHALL be collected into one thrown
`SubmissionValidationError` rather than failing on the first found. Only
once every submitted field passes SHALL the target path's guard be evaluated
against the merged (data applied, not yet committed) instance; a guard that
evaluates false SHALL throw the existing `GuardRefused`, leaving the instance
uncommitted.

After the commit's transaction completes, `submitAndTransition` SHALL run the
resulting instance through `resolveAutomatic` using the ordinary (unlocked)
`db`, matching the transactional granularity every other automatic-cascade
caller already uses. If this cascade raises the engine's existing
`AutomaticCascadeLoop`, the submitted data and the manual transition have
already committed — this is not a rejected submission, and the instance is
left `faulted`.

#### Scenario: A field outside the current view is rejected
- **WHEN** `data` includes a key for a field not visible on the instance's
  current step
- **THEN** it throws `SubmissionValidationError` with an `unknown-field`
  issue for that key, and the instance is uncommitted

#### Scenario: A field marked readonly on the current view is rejected
- **WHEN** `data` includes a key for a field the current step's view marks
  `readonly`
- **THEN** it throws `SubmissionValidationError` with a `readonly-field`
  issue for that key, and the instance is uncommitted

#### Scenario: A group-container field is never an accepted submission key
- **WHEN** `data` includes a key for a `FieldDef` of `type: "group"`, even
  one the current step's view marks visible
- **THEN** it throws `SubmissionValidationError` with an `unknown-field`
  issue for that key

#### Scenario: Multiple validation issues are all reported together
- **WHEN** a submission violates more than one validation rule at once (for
  example, one field fails a type check and another is missing a
  required value)
- **THEN** the thrown `SubmissionValidationError` carries an issue for each
  violation, not only the first

#### Scenario: A valid submission commits data and transition atomically, preserving unrelated fields
- **WHEN** `data` passes every validation rule and the target path's guard
  holds against the merged instance, and the instance's existing `data`
  carries fields not included in this submission
- **THEN** the submitted data is written, every other previously stored field
  remains present, and the manual transition on `pathId` commits in the same
  atomic operation, and the returned `Instance` reflects both

#### Scenario: A submission whose merged guard fails is rejected without commit
- **WHEN** `data` passes every validation rule but the target path's guard
  evaluates false against the merged instance
- **THEN** it throws the existing `GuardRefused` and neither the data nor the
  transition is committed

#### Scenario: Two concurrent submissions serialize rather than racing into a concurrency conflict
- **WHEN** two `submitAndTransition` calls target the same instance concurrently
- **THEN** the row lock serializes them — the second's read blocks until the
  first's transaction commits and then observes the already-committed state,
  so it either succeeds against that new state or fails with whatever
  ordinary error applies to it, not `ConcurrencyConflict`

#### Scenario: An unlocked engine-level commit racing submitAndTransition surfaces a concurrency conflict
- **WHEN** a direct, unlocked engine call (e.g. `executeManualTransition` or
  `fireTimer` holding a stale in-memory `Instance`) commits against the same
  instance concurrently with a `submitAndTransition` call, and
  `submitAndTransition`'s commit lands first
- **THEN** the unlocked call's own commit throws the engine's existing
  `ConcurrencyConflict` when it discovers `transitionSeq` moved out from
  under it

#### Scenario: A concurrent action writeback is not lost
- **WHEN** an `Action.output` writeback into a field outside a submission
  lands on the instance between `submitAndTransition`'s locked read and its
  commit
- **THEN** the writeback's value is present in the instance's `data` after
  the submission commits — the row lock serializes the writeback's own commit
  either fully before or fully after `submitAndTransition`'s transaction, so
  neither can read a state the other is mid-writing

#### Scenario: A cascade loop after a successful submission is not a rejected submission
- **WHEN** `submitAndTransition`'s commit succeeds and the subsequent
  automatic cascade re-enters a step already seen in the same advance
- **THEN** it throws the engine's existing `AutomaticCascadeLoop`, the
  submitted data and manual transition remain committed, and the instance's
  status is `faulted`

#### Scenario: A submission to an unclaimed assigned step is rejected before validation
- **WHEN** the current step has a declared `assignment` with `claimedBy`
  unset, and any actor calls `submitAndTransition`
- **THEN** it throws `NotClaimedError` before any field validation runs, and
  the instance is uncommitted

#### Scenario: A submission by a non-claimant to a claimed step is rejected
- **WHEN** the current step has a declared `assignment` with `claimedBy`
  set to a different actor's id, and the calling actor's id does not match
- **THEN** it throws `NotClaimantError` before any field validation runs,
  and the instance is uncommitted

#### Scenario: The claimant may submit
- **WHEN** the current step has a declared `assignment` with `claimedBy`
  set to the calling actor's id
- **THEN** the enforcement check passes and submission proceeds to field
  validation as normal

#### Scenario: The starter may submit a step with no declared assignment
- **WHEN** the current step has no `assignment` field and the calling actor
  started the instance
- **THEN** no claim check applies and submission proceeds to field
  validation as normal

#### Scenario: An operator may submit a step with no declared assignment
- **WHEN** the current step has no `assignment` field and the calling actor
  carries `ADMIN_ROLE` without having started the instance
- **THEN** submission proceeds to field validation as normal

#### Scenario: An unrelated actor may not submit a step with no declared assignment
- **WHEN** the current step has no `assignment` field and the calling actor
  neither started the instance nor carries `ADMIN_ROLE`
- **THEN** it throws `AuthorizationError` before any field validation runs,
  and the instance is uncommitted

### Requirement: Claim the current step of a running instance

`claimStep(instanceId, actor, db?)` SHALL row-lock the instance and, when
`status === "running"`, require the current step has a declared
`instance.assignment`, require the actor is an eligible candidate (`actor.id`
or any of `actor.roles` present in `assignment.candidates`), and require
`claimedBy` is currently unset. On success it SHALL set `claimedBy =
actor.id`, `claimedAt` to the current time, append an `assignment.claimed`
`InstanceEvent`, and return the updated `Instance`. It SHALL throw
`NotAssignedError` when the current step has no declared `assignment`,
`NotACandidateError` when the actor is not eligible, and `AlreadyClaimedError`
when `claimedBy` is already set. On a non-running instance it SHALL NOT
throw — it returns the instance unchanged, a silent no-op (see
`assignment-claim-release-consolidation`).

#### Scenario: An eligible candidate claims successfully
- **WHEN** `claimStep` is called by an eligible candidate on a running
  instance's unclaimed, assignment-bearing current step
- **THEN** it returns the updated `Instance` with `assignment.claimedBy`
  set to the actor's id

#### Scenario: A non-running instance is a no-op
- **WHEN** `claimStep` is called on an instance whose `status` is not
  `"running"`
- **THEN** it returns the instance unchanged, with no error thrown and no
  `assignment.claimed` event appended

#### Scenario: A step with no declared assignment cannot be claimed
- **WHEN** `claimStep` is called on a running instance whose current step has
  no declared `assignment`
- **THEN** it throws `NotAssignedError`

#### Scenario: A non-candidate is rejected
- **WHEN** `claimStep` is called by an actor who is not an eligible
  candidate
- **THEN** it throws `NotACandidateError` and the instance is unchanged

#### Scenario: An already-claimed step is rejected
- **WHEN** `claimStep` is called on a step whose `assignment.claimedBy` is
  already set
- **THEN** it throws `AlreadyClaimedError` and the existing claim is
  unchanged

### Requirement: Release a claim on the current step of a running instance

`releaseClaim(instanceId, actor, db?)` SHALL row-lock the instance and, when
`status === "running"`, require `assignment.claimedBy === actor.id`, and on
success clear `claimedBy` and `claimedAt`, append an `assignment.released`
`InstanceEvent`, and return the updated `Instance`. It SHALL throw
`NotClaimantError` when the calling actor does not hold the claim. On a
non-running instance it SHALL NOT throw — it returns the instance unchanged,
a silent no-op (see `assignment-claim-release-consolidation`).

#### Scenario: The claimant releases successfully
- **WHEN** `releaseClaim` is called by the actor currently holding the
  claim
- **THEN** it returns the updated `Instance` with `assignment.claimedBy`
  and `assignment.claimedAt` cleared

#### Scenario: A non-claimant is rejected
- **WHEN** `releaseClaim` is called by an actor who does not hold the
  current claim
- **THEN** it throws `NotClaimantError` and the existing claim is unchanged

### Requirement: Delegate the claim on the current step of a running instance

`delegateClaim(instanceId, actor, toActorId, db?)` SHALL row-lock the
instance and check that `assignment.claimedBy === actor.id`. On success
it SHALL set `claimedBy = toActorId`, refresh `claimedAt`, append an
`assignment.delegated` `InstanceEvent`, and return the updated
`Instance`. It SHALL throw `NotClaimantError` when the calling actor does
not hold the claim, the same error `releaseClaim` throws for the same
reason. No check validates `toActorId` against `assignment.candidates` or
an account directory.

#### Scenario: The claimant delegates successfully

- **WHEN** `delegateClaim` is called by the actor currently holding the
  claim, naming a target actor id
- **THEN** it returns the updated `Instance` with `assignment.claimedBy`
  set to the target actor's id and `assignment.claimedAt` refreshed

#### Scenario: A non-claimant cannot delegate

- **WHEN** `delegateClaim` is called by an actor who does not hold the
  current claim
- **THEN** it throws `NotClaimantError` and the existing claim is
  unchanged

#### Scenario: A delegate target need not be an eligible candidate

- **WHEN** `delegateClaim` names a target actor id absent from
  `assignment.candidates`
- **THEN** the call still succeeds, and that actor becomes the claimant

### Requirement: Submitted data is validated against field type, options, constraints, and rule

For every field key present in a submission, `submitAndTransition` (and
`createProcessInstance`'s `opts.data` seed) SHALL validate the submitted
value, against the merged (not-yet-committed) data, in this order:

1. A type match against the field's declared `FieldDef.type`, mirroring
   `check.ts::celType`'s existing mapping: `string`/`date`/`datetime`/
   `select`/`reference` require a JS `string`; `number` a JS `number`;
   `boolean` a JS `boolean`; `multiselect` an array of strings; `file` and a
   plugin (object) type are opaque and accepted as-is.
2. If the field's resolved `options` is non-empty — populated from static
   `FieldDef.options`, or from a `dataSource`-bound field's runtime-resolved
   options, per the `data-source-resolution` capability — the value (each
   item, for `multiselect`) must equal one resolved option's `value`.
3. Its declared constraints (`min`, `max`, `minLength`, `maxLength`,
   `pattern`).
4. If present, its `validation.rule` CEL expression, evaluated with total
   (`evalGuard`-style) semantics against `buildGuardContext(body,
   mergedInstance, actor)` — the identical context `check.ts` type-checks a
   catalog field's `rule` against (no `result`, no `child`). A rule
   referencing the field's own value does so via `data.<key>`, like any
   other guard.

Then, over the full merged data (not only the submitted keys, and excluding
any group-container field), `submitAndTransition` — but not
`createProcessInstance` — SHALL check that every field in the current step's
visible-and-required set has a defined value. Requiredness is a
transition-time gate: it is checked whenever a step is left via a manual
path, not whenever an instance is created at or rests on one. A declared
`FieldDef.default` does not satisfy this check: nothing in the engine
applies `default` anywhere today, and this change does not add that.

#### Scenario: A type mismatch is rejected
- **WHEN** a submitted value does not match its field's declared type
- **THEN** the result carries a `type-mismatch` issue for that field

#### Scenario: A value outside a field's declared options is rejected
- **WHEN** a submitted value for a field with declared static `options` does
  not equal any `option.value`
- **THEN** the result carries an `invalid-option` issue for that field

#### Scenario: A value outside a dataSource-bound field's resolved options is rejected
- **WHEN** a submitted value for a `dataSource`-bound field does not equal
  any of that data source's resolved options' `value`
- **THEN** the result carries an `invalid-option` issue for that field

#### Scenario: A multiselect value is checked item-by-item against options
- **WHEN** a `multiselect` field declares `options` (static or
  `dataSource`-bound) and a submitted array includes an item not among the
  resolved options
- **THEN** the result carries an `invalid-option` issue for that field

#### Scenario: A constraint violation is rejected
- **WHEN** a submitted value violates a declared constraint (`min`, `max`,
  `minLength`, `maxLength`, or `pattern`)
- **THEN** the result carries a `constraint` issue naming the violated
  constraint for that field

#### Scenario: A failing validation rule is rejected
- **WHEN** a field's `validation.rule` CEL expression evaluates false against
  the merged data
- **THEN** the result carries a `rule-failed` issue for that field

#### Scenario: A validation rule may reference the field's own submitted value
- **WHEN** a field's `validation.rule` references `data.<key>` for its own key
- **THEN** it is evaluated against the merged (not-yet-committed) data, so it
  sees the submitted value

#### Scenario: A missing required field is rejected on submission
- **WHEN** a `submitAndTransition` call's merged data has no defined value
  for a field in the current step's visible-and-required set, whether or not
  that field was included in the submission
- **THEN** the result carries a `required-missing` issue for that field

#### Scenario: A declared default does not satisfy a missing required field
- **WHEN** a visible-and-required field declares a `FieldDef.default` and has
  no defined value in the merged data at a `submitAndTransition` call
- **THEN** the result still carries a `required-missing` issue for that
  field, because nothing applies `default`

#### Scenario: createProcessInstance never enforces the required check
- **WHEN** `createProcessInstance` is called with `opts.data` omitting a
  field the initial step's view marks required
- **THEN** creation succeeds — the required check runs only on
  `submitAndTransition`, never on creation

### Requirement: A pattern constraint is tested only after the length constraints pass, against a cached expression

When validating a submitted value against `FieldValidation`, the engine SHALL
evaluate `pattern` only if that value's `minLength`/`maxLength` constraints
were satisfied. A value that already violates a length constraint is rejected
regardless, so running a pattern — which may backtrack catastrophically and
which JavaScript cannot time out — against an over-long, submitter-supplied
string is unnecessary work with an unbounded worst case. Today the length
violation is recorded and execution falls through to the pattern test.

The compiled `RegExp` for a pattern SHALL be cached per published body rather
than constructed per submission and per field. A published body is immutable,
which is what makes it a sound cache key.

A pattern reaching this point is known to compile, because the compile pass
rejects one that does not (`definition-contract`). Construction failure at
submission time is therefore no longer an expected condition.

#### Scenario: An over-long value is not pattern-tested

- **WHEN** a submitted string exceeds the field's `maxLength` and the field
  also declares a `pattern`
- **THEN** the length issue is reported and the pattern is not evaluated
  against that value

#### Scenario: A conforming-length value is pattern-tested as before

- **WHEN** a submitted string satisfies the field's length constraints
- **THEN** the pattern is evaluated and a mismatch is reported exactly as it
  is today

#### Scenario: Repeated submissions reuse one compiled expression

- **WHEN** many submissions validate the same field of the same published
  body
- **THEN** the pattern is compiled once for that body, not once per
  submission

### Requirement: An operation targeting a non-running instance is rejected at the boundary

`submitAndTransition`, `claimStep`, `releaseClaim`, and `delegateClaim`
SHALL throw `InstanceNotRunningError`, carrying the instance id and the observed status,
when the target instance's status is not `running`. The check SHALL happen
after the instance is loaded under its row lock and before any work is
committed, so the rejection is exact rather than optimistic.

The engine-level no-op SHALL remain: `commitManualTransition` and
`updateAssignment` keep returning the instance unchanged for a non-running
instance, because internal idempotent re-entry (a timer firing against an
instance a cascade already completed) must not throw. What changes is only
that a *caller-initiated* operation is told.

Reporting success for an operation that did nothing is the defect this closes.
Today a submission against a `cancelled`, `completed` or `faulted` instance
row-locks it, hash-checks its body, enforces the claim, validates the data,
calls the engine, receives the untouched instance, commits zero writes, and is
returned as a normal `200` — the submitted data silently discarded. The
permanent case is a `faulted` instance, where every later submission answers
success forever.

The concurrent case is the same defect with a race in front of it: of two
submissions to the same instance, the loser's data is discarded once the
winner's transition leaves the step, and the loser is currently told it
succeeded. After this change the loser receives `InstanceNotRunningError` if
the instance is no longer running — or one of the ordinary errors that already
apply (a claim error, a validation error, a guard refusal) if it is. There is
no outcome in which the loser's data is kept: the step it belonged to has been
left.

#### Scenario: A submission to a cancelled instance is rejected

- **WHEN** `submitAndTransition` targets an instance whose status is
  `cancelled`
- **THEN** it throws `InstanceNotRunningError` naming that status, and no
  data is written

#### Scenario: A submission to a faulted instance is rejected every time

- **WHEN** an instance was parked `faulted` by the automatic cascade's loop
  guard and a submission is retried against it
- **THEN** each attempt throws `InstanceNotRunningError` rather than
  answering success

#### Scenario: Claim and release are rejected the same way

- **WHEN** `claimStep` or `releaseClaim` targets a non-running instance
- **THEN** it throws `InstanceNotRunningError`, rather than returning the
  instance unchanged

#### Scenario: Delegate is rejected the same way claim and release are

- **WHEN** `delegateClaim` targets a non-running instance
- **THEN** it throws `InstanceNotRunningError`. No claimant guard, write,
  or event append occurs

#### Scenario: The engine-level no-op is unchanged

- **WHEN** an internal caller re-enters `commitManualTransition` or
  `updateAssignment` for a non-running instance
- **THEN** it returns the instance unchanged, as today — the rejection lives
  at the runtime-API boundary, not in the engine

#### Scenario: Of two concurrent submissions, the loser learns it lost

- **WHEN** two `submitAndTransition` calls target the same instance
  concurrently and the winner's transition leaves the instance non-running
- **THEN** exactly one fulfils and the other rejects with
  `InstanceNotRunningError`, rather than both fulfilling

### Requirement: Post a free-text comment on an instance through the runtime API

`postComment(instanceId, actor, text, db?)` SHALL apply the same
visibility rule `getInstanceView` applies. That rule admits
`system:admin`. It also admits the instance's `startedBy`. It also
admits the current step's `claimedBy`. It also admits an eligible
assignment candidate on the current step.

On success it SHALL insert an `instance_comments` row. That row carries
a fresh `comment_`-prefixed id, the instance id, the calling actor's id,
`text` unchanged, and the current timestamp. It SHALL return the created
row.

`text` SHALL be trusted as already validated non-empty and within bound
by the caller. This is the same division of labour `delegateClaim`
already applies to `toActorId`. `postComment` itself performs no
independent length or emptiness check.

An actor failing the visibility rule SHALL receive an
`AuthorizationError`. This is the same error `getInstanceView` raises
for an actor who may not read the instance.

#### Scenario: An eligible candidate posts a comment

- **WHEN** an actor who is an eligible candidate on the instance's
  current step calls `postComment`
- **THEN** a row is inserted into `instance_comments` and the created
  comment is returned

#### Scenario: An actor with no relation to the instance is refused

- **WHEN** an actor who is not the starter, the claimant, an eligible
  candidate, or `system:admin` calls `postComment`
- **THEN** it throws `AuthorizationError` and no row is inserted

### Requirement: List an instance's comments through the runtime API

`listComments(instanceId, actor, page, db?)` SHALL apply the same
visibility rule `postComment` applies. It SHALL return a page of the
instance's comments ordered `createdAt` ascending, then `id` ascending.
It SHALL reuse the same `limit`/`cursor` keyset-pagination shape
`listInstances` and `getInstanceRecord` already use.

#### Scenario: Listing returns comments oldest first

- **WHEN** an instance has three comments posted in sequence and an
  eligible actor calls `listComments`
- **THEN** they are returned in the order they were posted, not
  reverse-chronological

#### Scenario: A full page returns a cursor for the next page

- **WHEN** an instance has more comments than the requested `limit`
- **THEN** the returned page includes a `cursor` that fetches the next
  page

#### Scenario: An actor with no relation to the instance is refused

- **WHEN** an actor who is not the starter, the claimant, an eligible
  candidate, or `system:admin` calls `listComments`
- **THEN** it throws `AuthorizationError`
