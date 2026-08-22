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

`createProcessInstance(processId, actor, registry, opts?, db?)` SHALL
create a new instance of the newest published version of `processId`.
It SHALL instead use the version given in `opts.version`, when one is
given. It MAY seed the instance with `opts.data`. It SHALL run the
instance to rest (create-then-`resolveAutomatic`) before returning it.

Before it evaluates any default, `createProcessInstance` SHALL mint
the instance id. It SHALL establish a stub `Instance`, the same one
described below. That stub sets `currentStepId` to the initial step,
`transitionSeq` to `0`, and `status` derived the way
`store.ts::createInstance` derives it.

`createProcessInstance` SHALL initialize a working data object as a
copy of `opts.data`, or an empty object when no `opts.data` is given.
It SHALL then walk leaf fields one at a time, in catalog order. It
SHALL seed each field's slot in that working object from the field
catalog's `default` values. A `Literal` default SHALL write its value
directly into that field's slot. It SHALL do this only when the slot
is still absent. That happens when `opts.data` never set it, or when
an earlier field's default has not already filled it.

An `Expression` default SHALL evaluate through
`src/cel/eval.ts::buildGuardContext(body, stub, actor)`, the same
builder every other guard evaluation reuses. The stub's `.data` SHALL
be set to the working object as filled so far.

That evaluation SHALL run through `src/cel/eval.ts::evalFieldMap`, a
single-entry map holding just that field. `evalFieldMap` SHALL pass
the evaluated value through `coerceJson` before it fills that field's
slot. That is the same coercion `evalMapTotal` already runs, inside
`evalFieldMap`, before a CEL result lands in `data`. `evalTransforms`
(migrations) and `evalOutput` (`Action.output`) both run it too.
`cel-js` models a CEL `int` as a JS `bigint`. Skipping this step would
leave a bigint in a `number` field's slot for even a plain
integer-literal default. That fails `typeMatches` on the next check
this requirement runs.

That call SHALL supply `instance: { id, status, transitionSeq,
currentStepId }`, matching `INSTANCE_SCHEMA` exactly. That is the same
scope `src/cel/check.ts` already type-checks a `default` Expression
against, at publish time. It SHALL also re-key `data` from field id to
field `key`, the same remap every other guard context gets.

CEL stays total here, the same as everywhere else it evaluates a
guard. An Expression default that raises, or whose evaluated value
`coerceJson` cannot make JSON-safe, SHALL leave its field's slot
unfilled. It SHALL NOT fail the creation. A `group` field's own
`default` SHALL NOT be read: a group carries no slot of its own in the
flat data payload. `createProcessInstance` SHALL still walk its
children.

This seeding step SHALL run only inside `createProcessInstance`
itself. It SHALL NOT run for an instance
`src/engine/seeded-create.ts::createSeededInstance` creates: a
subprocess spawn's child instance, or a `process.start` chain's
started instance. Neither of those two calls
`createProcessInstance`. Each already seeds its new instance from its
own author-declared `inputMapping`. This requirement's default-seeding
does not extend there for this change.

The working object SHALL then carry every value `opts.data` set and
every default that filled a slot `opts.data` left open. An explicitly
submitted value SHALL win over a default on the same field, every
time. The seeding step above never overwrites a slot `opts.data`
already filled. That object becomes what this requirement's existing
rules call `opts.data` below, and what carries forward into
`submitted`.

`createProcessInstance` SHALL validate `opts.data` against the initial
step's resolved view before creation. That check covers the field-set
boundary, type, option membership, constraints, and
`validation.rule`. Option membership checks against resolved `options`,
covering both static and `dataSource`-bound fields, per the
`data-source-resolution` capability. These are the same rules
`submitAndTransition` applies to a submission.

The check runs against the same stub `Instance` the defaulting step
above already built and fed `data` into, not a second one. That stub
carries a minted id, a `transitionSeq` of `0`, and `currentStepId` set
to the initial step. Its `status` derives the same way
`store.ts::createInstance` derives it. `createProcessInstance` then
passes that same minted id to the actually-created instance. The
instance created is exactly the one that was validated.

This validation SHALL cover a merged-in default the same way it covers
a submitted value, with two exemptions, one per case below. This
validation otherwise enforces a field-set boundary. That boundary
rejects a key absent from the initial step's resolved view as
`unknown-field`. It rejects a key resolved readonly as
`readonly-field`.

`createProcessInstance` SHALL record the set of field ids the
defaulting step above filled. It SHALL keep that set distinct from the
ids `opts.data` supplied directly. It SHALL thread that set into this
validation.

For a member of that set absent from the initial step's resolved
view — `resolveFields` returns no `ResolvedViewField` for it —
validation SHALL skip the `unknown-field` rejection that field would
otherwise draw. It SHALL check the value against the field's own
declared `type`, its own static `options`, its own `validation`
constraints, and its own effective `validation.rule`. It SHALL NOT
check the value against the initial step's resolved view: a field
outside that view has no `ResolvedViewField` entry to check against,
and no step context to resolve a `dataSource`-bound field's options
against. When that field is `dataSource`-bound, its
option-membership check SHALL be skipped instead, the same treatment a
field carrying an empty options list already gets. A default that
fails one of the remaining checks SHALL throw
`SubmissionValidationError`, the same as a bad `opts.data` value does.

For a member of that set that DOES resolve a `ResolvedViewField`, and
that view resolves it readonly — through a step-level `readonly`
override, or through `FieldDef.technical: true` — validation SHALL
skip the `readonly-field` rejection that field would otherwise draw.
It SHALL otherwise check the value the same way it checks an editable
field on that step: against the field's own declared `type`, the
view-resolved `options`, and the step's own effective validation (the
sibling requirement's ordered checks 1-4 below, including
`validation.rule`). A default that fails one of those checks SHALL
throw `SubmissionValidationError`, the same as a bad `opts.data` value
does.

Neither exemption SHALL extend to a value `opts.data` supplies
directly. An explicitly submitted value for a field outside the
initial step's view SHALL still throw `unknown-field`. An explicitly
submitted value for a field the view resolves readonly SHALL still
throw `readonly-field`. Both exactly as they do today.

`createProcessInstance` SHALL take a required `registry:
DataSourceRegistry` argument. It SHALL thread that registry into the
`resolveFields` call that resolves the initial step's view for this
validation.

The required check SHALL NOT run at creation, whether or not the
caller passes `opts.data`. Requiredness is a transition-time gate. It
is not an existence-time gate on being created at or resting on a
step. The transition function `submitAndTransition` enforces it,
whenever a step is left via a manual path.

An instance MAY be created at a step whose view marks fields required,
left with those fields unfilled. Those fields can be supplied later,
via `submitAndTransition`. That is the ordinary "create an empty
instance, then fill in the initial step's form" flow.
`examples/expense-approval.json`'s "capture" step depends on it: that
step is itself the initial step, and it declares required fields.

`opts.data` SHALL NOT carry a key naming a `FieldDef` declaring
`technical: true`. The initial step's resolved view always reports such
a field `readonly: true`. The field-set boundary therefore rejects the
key as `readonly-field`, the way it rejects a submission.

#### Scenario: Creating an instance with no data seed
- **WHEN** `createProcessInstance` is called for a process with no `opts.data`,
  even when the initial step's view marks fields required
- **THEN** an instance is created pinned to the resolved version, run to
  rest, and returned. The required check does not block creation

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
  value for a `dataSource`-bound field on the initial step
- **AND** that value does not equal any of the data source's resolved
  options
- **THEN** it throws `SubmissionValidationError` with an `invalid-option`
  issue for that field, and no instance is created

#### Scenario: A seeded technical field is rejected
- **WHEN** `createProcessInstance` is called with `opts.data` carrying a
  key for a `FieldDef` declaring `technical: true`
- **AND** the step whose view resolves it marks it visible
- **THEN** it throws `SubmissionValidationError` with a `readonly-field`
  issue for that key, and no instance is created

#### Scenario: A literal default seeds a field with no submitted value
- **WHEN** `createProcessInstance` is called with `opts.data` that carries
  no value for a field whose catalog entry declares a `Literal` default
- **THEN** the created instance's data carries that literal value for the
  field

#### Scenario: An explicitly submitted value wins over a default
- **WHEN** `createProcessInstance` is called with `opts.data` carrying a
  value for a field that also declares a default
- **THEN** the created instance's data carries the submitted value, not
  the default

#### Scenario: A CEL default evaluates against the seed in progress
- **WHEN** a field's `Expression` default reads `data.subtotal`, and an
  earlier field in catalog order defaults `subtotal` to a literal value
- **THEN** the later field's default evaluates using that earlier
  field's resolved value
- **AND** `data` is re-keyed from field id to field `key` the same way
  any guard context is

#### Scenario: A CEL default evaluates against an earlier submitted value
- **WHEN** a field's `Expression` default reads `data.subtotal`, and
  `opts.data` carries an explicitly submitted value for an earlier
  field in catalog order, `subtotal`
- **THEN** the later field's default evaluates using that submitted
  value
- **AND** this is the same visibility an earlier field's resolved
  default would get

#### Scenario: An earlier field's default cannot read a later field's value
- **WHEN** an earlier-in-catalog-order field's `Expression` default
  reads `data.<key>` of a later field
- **THEN** it raises for the missing key, and that earlier field's
  slot stays unfilled
- **AND** creation still succeeds

#### Scenario: A default reads the instance's own state
- **WHEN** a field's `Expression` default reads `instance.status` or
  `instance.currentStepId`
- **THEN** the default evaluates against the stub `Instance`'s derived
  `status` and its `currentStepId` set to the initial step
- **AND** it does not raise for a missing key

#### Scenario: A raising expression default leaves its field unset
- **WHEN** a field's `Expression` default raises during evaluation, and
  `opts.data` carries no value for that field
- **THEN** the created instance's data carries no value for that field,
  and creation still succeeds

#### Scenario: An expression default evaluating to a CEL int seeds a JSON-safe number
- **WHEN** a `number` field's `Expression` default evaluates to a CEL
  `int`
- **AND** the expression is the bare integer literal `"5"`, or the
  arithmetic expression `"data.qty * data.price"` over two int fields
- **AND** `opts.data` carries no value for that field
- **THEN** the created instance's data carries a JSON-safe `number` for
  that field, not a bigint
- **AND** creation does not throw

#### Scenario: A group field's own default is never read
- **WHEN** a `group` field's catalog entry declares a `default`, and its
  children each declare their own default too
- **THEN** the created instance's data carries no slot for the group
  itself
- **AND** each child's default seeds that child's own slot

#### Scenario: A default that fails validation blocks creation
- **WHEN** a field's `Literal` default does not match the field's
  declared type, and `opts.data` carries no value for that field
- **THEN** it throws `SubmissionValidationError` for that field, the
  same as an invalid submitted value would, and no instance is created

#### Scenario: A default seeds a field the initial step's view does not reference
- **WHEN** a field's default fills a field id absent from the initial
  step's resolved view
- **AND** `booking_status` in `examples/expense-approval.json` is one
  such field, referenced only by the `book` step, never by the initial
  `capture` step
- **THEN** creation succeeds, and that field's slot carries the
  defaulted value
- **AND** the engine validates that value against the field's own
  declared type, options, constraints, and `validation.rule`, rather
  than rejecting it as `unknown-field`

#### Scenario: An off-view default failing its own validation.rule is rejected
- **WHEN** a field's default fills a field id absent from the initial
  step's resolved view
- **AND** the field's own effective `validation.rule` evaluates false
  against that value
- **THEN** it throws `SubmissionValidationError` with a `rule-failed`
  issue for that field, and no instance is created

#### Scenario: An off-view dataSource-bound default skips option-membership validation
- **WHEN** a `dataSource`-bound field's default fills a field id absent
  from the initial step's resolved view
- **THEN** creation succeeds regardless of the default's value, since
  there is no step context to resolve the data source's options
  against
- **AND** the engine still checks that value against the field's own
  declared type and its own `validation` constraints

#### Scenario: A default on an on-view readonly field is judged by the step's own override
- **WHEN** a field's default fills a field id the initial step's
  resolved view marks readonly through a step-level `readonly`
  override
- **AND** the initial step's view field also overrides that field's
  `validation`
- **THEN** creation succeeds, and the engine validates the defaulted
  value against the step's own overridden validation, not the
  catalog's

#### Scenario: A default on a technical field still seeds, without a readonly-field rejection
- **WHEN** a `FieldDef` declaring `technical: true` also declares a
  `Literal` default, and `opts.data` carries no value for that field
- **THEN** creation succeeds, and the created instance's data carries
  that literal value for the field
- **AND** creation raises no `readonly-field` issue for it

### Requirement: Resolve a display-ready view of an instance

`getInstanceView(instanceId, actor, registry, db?)` SHALL return an
`InstanceView` describing the instance's current step, its resolved
fields, and its currently available manual paths, for an instance in
any status. This read uses the ordinary (unlocked) rehydrate path. A
view is read-only, so there is no concurrent writeback for it to race.
`getInstanceView` SHALL take a required `registry: DataSourceRegistry`
parameter, threaded into the `resolveFields` call that resolves the
current step's view.

`getInstanceView` SHALL authorize `actor` against the loaded instance
before returning anything, per the `authorization` capability's
relationship rule (`ADMIN_ROLE`, or `startedBy`, or current claimant,
or eligible candidate on the current step), throwing
`AuthorizationError` otherwise. `actor` is therefore load-bearing
twice: as the authorization subject, and as the CEL guard context
`resolveFields`/`resolveAvailablePaths` evaluate against. For a caller
without `ADMIN_ROLE`, a failure to load the instance SHALL surface as
that same `AuthorizationError`, so an unrelated caller cannot
distinguish a nonexistent instance from one they may not read. A
caller holding `ADMIN_ROLE` SHALL see the ordinary not-found failure.

`fields` SHALL contain exactly the current step's `ViewField`s whose
resolved `visible` (literal `boolean`, used as-is, or CEL, evaluated
with total semantics, default `true`) is `true` against
`buildGuardContext(body, instance, actor)`. Each entry carries its
resolved `required`, `readonly`, `span`, and `options` (per the
`data-source-resolution` capability: populated from static
`FieldDef.options` unchanged, or resolved at runtime for a
`dataSource`-bound field). A field resolving invisible SHALL be
omitted entirely, not included with a flag. `span` SHALL be the
matching `ViewField.span`, or `1` when the view declares none.

`InstanceView` SHALL also carry `columns`: the current step's
`view.columns`, or `1` when the view declares none. `columns` reports
regardless of `status`, the same way `step` itself does, since it
describes the step's declared layout rather than instance state.

A `ViewField` whose `ref` resolves to a `FieldDef` of `type: "group"`
(a container, never a leaf value in `instance.data`) SHALL still
appear in `fields` when visible, so a caller can render its
label/grouping, but its `value` SHALL always be `undefined` and its
resolved `required` and `readonly` SHALL always be reported as `false`
regardless of the view's own declaration. It is never part of the
visible-and-required set the required check enforces, nor of the
visible-and-editable set `submitAndTransition` accepts.

A `ViewField` may resolve to a `FieldDef` declaring `technical: true`.
Such a `ViewField` SHALL always resolve `required` as `false` and
`readonly` as `true`, regardless of the view entry's declaration. The
definition contract already forbids a technical field's view entry from
declaring either key. This rule therefore only restates what the
resolved body already means.

Where a body declares `technical: true` on a `type: "group"` field, the
group rule wins: both flags resolve `false`. The compile pass rejects
that pair, so only an uncompiled body reaches it. Type alone keeps a
group ref out of the editable set, whatever `readonly` resolves to.

Such a `ViewField` is never part of the visible-and-required set. It is
also never part of the visible-and-editable set `submitAndTransition`
accepts.

`availablePaths` SHALL contain exactly the manual paths on the current
step whose guard currently holds against `buildGuardContext(body,
instance, actor)`. Paths that don't match are omitted, not flagged. A
guardless manual path is always included (`evalGuard` treats no guard
as satisfied). `availablePaths` SHALL be empty when the instance is
not `running`, when the current step has no manual paths, or when
every manual path's guard is false. `status` is always present, so a
caller can distinguish these cases.

#### Scenario: An unrelated actor is refused before any field resolves

- **WHEN** an authenticated actor with no relationship to the instance
  and no `ADMIN_ROLE` calls `getInstanceView`
- **THEN** it throws `AuthorizationError`, and no data source is
  resolved and no field value is read out

#### Scenario: A related actor reads the view unchanged

- **WHEN** the caller is the instance's starter, its current claimant,
  an eligible candidate on the current step, or holds `ADMIN_ROLE`
- **THEN** the view resolves exactly as it did before this requirement
  changed: same `fields`, same `availablePaths`

#### Scenario: An invisible field is omitted

- **WHEN** a step's view marks a field's `visible` expression false
  against the instance's current data
- **THEN** that field is absent from `fields`

#### Scenario: A group-container field never reports as required

- **WHEN** a step's view references a `FieldDef` of `type: "group"`
  and marks it `required: true`
- **THEN** the resolved field's `required` is `false` and its `value`
  is `undefined`, regardless of the view's declaration

#### Scenario: A technical field never reports as editable

- **WHEN** `getInstanceView` resolves a step's view entry naming a
  `FieldDef` declaring `technical: true`
- **THEN** the resolved field's `required` is `false` and its
  `readonly` is `true`

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

- **WHEN** `getInstanceView` is called for a `running` instance parked on
  a `subprocess` step
- **THEN** `status` is `"running"` and `availablePaths` is empty, since a
  subprocess step's paths are schema-enforced to be automatic, never
  manual

#### Scenario: A dataSource-bound field's view carries its resolved options

- **WHEN** `getInstanceView` is called for an instance parked on a step
  whose visible fields include one bound to a `dataSource`
- **THEN** that field's resolved `options` reflects the data source's
  resolved result, not an empty or undefined list

#### Scenario: A field's span defaults to 1

- **WHEN** a step's view references a field whose `ViewField` declares
  no `span`
- **THEN** the resolved field's `span` is `1`

#### Scenario: A view's columns default to 1

- **WHEN** a step's view declares no `columns`
- **THEN** `InstanceView.columns` is `1`

#### Scenario: A declared span and column count both resolve

- **WHEN** a step's view declares `columns: 2` and a field's
  `ViewField` declares `span: 2`
- **THEN** `InstanceView.columns` is `2` and that field's resolved
  `span` is `2`

### Requirement: The instance view carries the current step's assignment state

`getInstanceView` SHALL include the instance's `assignment` in the returned
`InstanceView`. The field SHALL carry the persisted `AssignmentState`
unchanged, in the same shape `InstanceSummary` already uses. It SHALL be
absent when the instance holds no assignment, which happens when the current
step declares none.

The value reports the instance. `getInstanceView` SHALL NOT empty or rewrite
it for a non-running instance, unlike `availablePaths`. A caller reading a
completed instance can therefore still see who held the final claim.

This adds no authorization work. `getInstanceView` already reads
`instance.assignment` to authorize the caller. That test accepts four
relationships to the instance: `ADMIN_ROLE`, `startedBy`, current claimant,
or eligible candidate on the current step. Every caller that reaches the
return already passed it.

#### Scenario: A view on an assignment-bearing step carries the assignment
- **WHEN** an authorized actor calls `getInstanceView` for an instance whose
  current step declares an `assignment`
- **THEN** the returned view carries `assignment` with that step's resolved
  `candidates`, and with `claimedBy` and `claimedAt` when an actor holds the
  claim

#### Scenario: A view on a step with no assignment omits the field
- **WHEN** an authorized actor calls `getInstanceView` for an instance whose
  current step declares no `assignment`
- **THEN** the returned view carries no `assignment`

#### Scenario: A completed instance still reports its assignment
- **WHEN** an authorized actor calls `getInstanceView` for a completed
  instance that still carries a claim
- **THEN** the returned view carries that `assignment`, and `availablePaths`
  stays empty

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
`submitAndTransition` SHALL reject a key naming a `technical` field the
current step's view resolves visible as `readonly-field`, since that
resolution always reports it `readonly: true`. A technical field the
current step's view does not resolve at all falls under the
`unknown-field` rule above, unchanged.

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

#### Scenario: A technical field is never an accepted submission key
- **WHEN** `data` includes a key for a `FieldDef` declaring
  `technical: true`, even on a step whose view marks it visible
- **THEN** it throws `SubmissionValidationError` with a `readonly-field`
  issue for that key, and the instance is uncommitted

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
reason. No check validates `toActorId` against `assignment.candidates`.

`delegateClaim` SHALL check `toActorId` against the local account
directory, but only when the calling actor's own id resolves there. A target
the directory does not hold SHALL raise `UnknownDelegateError`, naming the
target, and the claim SHALL stay where it is. A deployment on an external
identity provider holds no directory entry for its own actors, so the check
finds no delegator there and runs no target check either. The condition keeps
this rule from rejecting every delegation in such a deployment.

The target check SHALL run under the same row lock as the claimant check, and
only after it. A caller who does not hold the claim SHALL therefore meet
`NotClaimantError`, whatever target it names, as the paragraph above already
requires. Ordering it the other way would also make this route answer whether
an arbitrary `user_id` exists, one try at a time, for any actor holding a
claim on any instance.

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

#### Scenario: A target outside the directory is rejected

- **WHEN** the calling actor's id resolves in the local account directory,
  and `delegateClaim` names a target id that does not
- **THEN** it throws `UnknownDelegateError`, the claim stays with the calling
  actor, and no `assignment.delegated` event is appended

#### Scenario: A non-claimant learns nothing about the target

- **WHEN** an actor who does not hold the current claim calls
  `delegateClaim` with a target id absent from the directory
- **THEN** it throws `NotClaimantError`, the same error it throws for a
  target the directory does hold

#### Scenario: A deployment with no local accounts delegates as before

- **WHEN** the calling actor's id does not resolve in the local account
  directory, and `delegateClaim` names any target id
- **THEN** the call succeeds, exactly as it does today

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
3. Its effective constraints (`min`, `max`, `minLength`, `maxLength`,
   `pattern`).
4. If present, its effective `rule` CEL expression, evaluated with total
   (`evalGuard`-style) semantics against `buildGuardContext(body,
   mergedInstance, actor)` — the identical context `check.ts` type-checks a
   catalog field's `rule` against (no `result`, no `child`). A rule
   referencing the field's own value does so via `data.<key>`, like any
   other guard.

The effective validation for a field in a step is the catalog field's
`validation` when the step's matching `view.fields[]` entry declares no
`validation`. When it declares one, per the `definition-contract` capability,
the effective validation overlays the catalog's keys with the step's under
`merge` (the default). Under `replace` it takes the step's alone. The step's
entry is the one whose `ref` names the field. Nothing else about the order or
the reported issues changes. An effective constraint is checked and reported
the way a catalog constraint always was.

Then, over the full merged data (not only the submitted keys, and excluding
any group-container field), `submitAndTransition` — but not
`createProcessInstance` — SHALL check that every field in the current step's
visible-and-required set has a defined value. Requiredness is a
transition-time gate: it is checked whenever a step is left via a manual
path, not whenever an instance is created at or rests on one. A declared
`FieldDef.default` does not satisfy this check. `createProcessInstance`
applies `default` once, at creation (see the sibling requirement above).
`submitAndTransition` never re-applies or re-checks it at a later
transition.

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
- **WHEN** a submitted value violates an effective constraint (`min`, `max`,
  `minLength`, `maxLength`, or `pattern`)
- **THEN** the result carries a `constraint` issue naming the violated
  constraint for that field

#### Scenario: A step's narrowed bound rejects a value the catalog allows
- **WHEN** a catalog field declares `max: 10000`, the current step's view
  field overrides it with `max: 1000`, and a submission carries 5000
- **THEN** the result carries a `constraint` issue naming `max` for that
  field

#### Scenario: A step's widened bound accepts a value the catalog rejects
- **WHEN** a catalog field declares `max: 10000`, the current step's view
  field overrides it with `max: 20000`, and a submission carries 15000
- **THEN** the value passes the constraint check

#### Scenario: The same value is judged by the step it is submitted to
- **WHEN** two steps override one field's `max` differently and the same
  value is submitted to each
- **THEN** each submission is judged against the override of the step it was
  submitted to. Neither step's override affects the other

#### Scenario: A merge override leaves the catalog's other constraints in force
- **WHEN** a catalog field declares `min: 0` and `max: 10000`, the current
  step overrides `max` alone under the default mode. A submission carries
  a value below 0
- **THEN** the result carries a `constraint` issue naming `min`

#### Scenario: A replace override discards the catalog's other constraints
- **WHEN** a catalog field declares `min: 0` and `max: 10000`, the current
  step declares `validation: { max: 1000 }` with `validationMode: "replace"`,
  and a submission carries a value below 0
- **THEN** the value passes the constraint check, because `min` does not
  apply in that step

#### Scenario: A failing validation rule is rejected
- **WHEN** a field's effective `rule` CEL expression evaluates false against
  the merged data
- **THEN** the result carries a `rule-failed` issue for that field

#### Scenario: A step's rule supersedes the catalog's
- **WHEN** a catalog field declares a `rule` and the current step's view field
  declares a different `rule`
- **THEN** the step's rule is the only one evaluated for that field in that
  step

#### Scenario: A replace override drops the catalog rule entirely
- **WHEN** a catalog field declares a `rule`, and the current step declares
  `validation` without `rule` under `validationMode: "replace"`
- **THEN** no rule is evaluated for that field in that step

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
  field. `submitAndTransition` never applies `default`; only
  `createProcessInstance` does, once, at creation

#### Scenario: createProcessInstance never enforces the required check
- **WHEN** `createProcessInstance` is called with `opts.data` omitting a
  field the initial step's view marks required
- **THEN** creation succeeds. The required check runs only on
  `submitAndTransition`, never on creation

### Requirement: The initial step's overrides govern a seeded creation

`createProcessInstance`'s `opts.data` seed SHALL be judged against the
effective validation of the initial step, the step the seed is resolved
against. The terms are the same terms a submission faces against the step it
is submitted to. A `replace` override on the initial step therefore governs
creation as fully as it governs a submission.

#### Scenario: A seed is judged against the initial step's override

- **WHEN** the initial step's view field overrides a catalog `max`, and
  `opts.data` carries a value the override rejects but the catalog allows
- **THEN** `createProcessInstance` fails with a `constraint` issue naming
  that field

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

### Requirement: Upload an attachment to an instance through the runtime API

`uploadAttachment(instanceId, actor, { filename, contentType, data, sizeBytes }, db?)` SHALL apply the same
visibility rule `postComment` applies (`loadInstanceForActor`). That rule
admits `system:admin`. It also admits the instance's `startedBy`. It also
admits the current step's `claimedBy`. It also admits an eligible
assignment candidate on the current step.

On success it SHALL insert an `instance_attachments` row. That row
carries a fresh `attachment_`-prefixed id, the instance id, the calling
actor's id, `filename`, `contentType`, `sizeBytes`, and `data` unchanged.
It SHALL return the created row's metadata, without `data`.

`data` and `sizeBytes` SHALL be trusted as already decoded and checked by
the caller.

`uploadAttachment` performs no independent decoding and no independent
size check.

An actor failing the visibility rule SHALL receive an
`AuthorizationError`. This is the same error `postComment` raises for an
actor who may not read the instance.

#### Scenario: An eligible candidate uploads an attachment

- **WHEN** an eligible candidate on the instance's current step calls
  `uploadAttachment` with decoded data under the size cap
- **THEN** a row is inserted into `instance_attachments` and the created
  attachment's metadata is returned, without `data`

#### Scenario: An actor with no relation to the instance is refused

- **WHEN** an actor who is not the starter, the claimant, an eligible
  candidate, or `system:admin` calls `uploadAttachment`
- **THEN** it throws `AuthorizationError` and no row is inserted

### Requirement: List an instance's attachments through the runtime API

`listAttachments(instanceId, actor, page, db?)` SHALL apply the same
visibility rule `uploadAttachment` applies. It SHALL return a page of the
instance's attachments ordered `createdAt` ascending, then `id`
ascending. It SHALL reuse the same `limit`/`cursor` keyset-pagination
shape `listComments` already uses. It SHALL NOT include `data` in any
returned item.

#### Scenario: Listing returns attachment metadata only

- **WHEN** an eligible actor calls `listAttachments` on an instance with
  one uploaded attachment
- **THEN** the returned item includes `filename`, `contentType`,
  `sizeBytes`, and `createdAt`. It does not include `data`

#### Scenario: A full page returns a cursor for the next page

- **WHEN** an instance has more attachments than the requested `limit`
- **THEN** the returned page includes a `cursor` that fetches the next
  page

#### Scenario: An actor with no relation to the instance is refused

- **WHEN** an actor who is not the starter, the claimant, an eligible
  candidate, or `system:admin` calls `listAttachments`
- **THEN** it throws `AuthorizationError`

### Requirement: Read one attachment's bytes through the runtime API

`getAttachment(instanceId, attachmentId, actor, db?)` SHALL apply the
same visibility rule `uploadAttachment` applies. On success it SHALL
return the attachment's `filename`, `contentType`, and `data`.

The lookup SHALL match both `attachmentId` and `instanceId`. An
`attachmentId` belonging to a different instance counts as not found,
the same as one that does not exist at all. `getAttachment` SHALL raise
`NotFoundError` in that case, never that other instance's data.

#### Scenario: An eligible actor downloads an attachment

- **WHEN** an eligible candidate on the instance's current step calls
  `getAttachment` for one of that instance's attachments
- **THEN** the attachment's `filename`, `contentType`, and `data` are
  returned

#### Scenario: An actor with no relation to the instance is refused

- **WHEN** an actor who is not the starter, the claimant, an eligible
  candidate, or `system:admin` calls `getAttachment`
- **THEN** it throws `AuthorizationError`

#### Scenario: An attachment belonging to a different instance is not found

- **WHEN** an eligible candidate on instance A calls `getAttachment` with
  instance A's id and an `attachmentId` that belongs to instance B
- **THEN** it throws `NotFoundError`, and no data from instance B's
  attachment is returned

#### Scenario: An unknown attachment id is not found

- **WHEN** an eligible candidate calls `getAttachment` with an
  `attachmentId` that does not exist
- **THEN** it throws `NotFoundError`

### Requirement: The engine writes mapped column attributes into data

The Runtime API Layer SHALL apply a field's `columnMapping` on
`submitAndTransition` and on `createProcessInstance`. It SHALL apply it only to
a field the request writes. A field the request leaves alone keeps whatever
`data` already holds for its targets.

For each such field the engine SHALL:

1. Find the resolved option whose `value` equals the submitted value. It uses
   the option list it already resolved for submission validation, so the read
   costs nothing extra.
2. Read each `columnMapping` key from that option's `attributes`.
3. Check the value against the target field's declared type, by the same rule a
   participant's own submission faces.
4. Write a matching value into `data`, and drop a mismatching one.

The write SHALL land before the transition commits. A guard on the same hop
therefore reads the written value. That is what makes `data.price > 10` legal
on the path out of the step that carries the picker.

A mapped target SHALL take the mapped value even when the request also carries
a value for that target. The list owns a mapped field, and one deterministic
rule beats a merge order nobody can predict.

The engine SHALL write a mapped target whatever its view says, and
whatever its catalog entry says. A readonly target still takes the
value. So does one the view never shows. So does one declaring
`technical: true`. An author writes the mapping; a participant does
not. The view's rules for what a participant may edit therefore do not
govern it, and neither does `technical`.

A `technical` target changes one thing. The engine rejects a request
that also carries a value for that target as `readonly-field`, before
the mapping runs. The mapped-value-wins rule above therefore never
engages for it. The mapped value still lands from the picker's own
write.

The engine SHALL walk the step's view order, which is the order
`ResolvedViewField[]` already carries. It SHALL NOT walk the request's own key
order, which whoever posted it controls. A request writing two pickers
therefore resolves the same way twice.

At creation the write-back SHALL run before the initial step's assignment
resolves. A strategy on that step therefore reads the final data, mapped values
included.

#### Scenario: Picking a row writes the mapped fields
- **WHEN** a participant submits a `select` field whose picked option carries
  `attributes.price` and whose `columnMapping` sends `price` to a number field
- **THEN** that number field holds the attribute's value after the commit

#### Scenario: A guard on the same hop reads the written value
- **WHEN** the path out of that step carries a guard reading the mapped field
- **THEN** the guard evaluates against the written value, not the previous one

#### Scenario: The mapped value beats a submitted one
- **WHEN** one request carries both the picker and a value for a mapped target
- **THEN** the mapped target holds the attribute's value

#### Scenario: A readonly target still takes the value
- **WHEN** the step's view marks the mapped target readonly
- **THEN** the target takes the mapped value, and no `readonly-field` issue is
  raised for it

#### Scenario: An unmapped column writes nothing
- **WHEN** a `columnMapping` key names a column the bound list does not declare
- **THEN** nothing is written for that key, and the submission succeeds

#### Scenario: An unfilled attribute writes nothing
- **WHEN** the picked option carries no attribute for a mapped column
- **THEN** nothing is written for that key, and the submission succeeds

#### Scenario: A field the request omits keeps its targets
- **WHEN** a request writes no value for a mapping field
- **THEN** the mapped targets keep whatever `data` already holds

#### Scenario: Two pickers resolve in view order
- **WHEN** one request writes two mapping fields, and the request's key order
  differs from the step's view order
- **THEN** the engine applies them in view order

#### Scenario: An initial step's assignment reads the mapped data
- **WHEN** an instance is created at a step whose assignment strategy reads a
  mapped field
- **THEN** the strategy resolves against the written value

#### Scenario: Creation applies the mapping too
- **WHEN** an actor creates an instance whose start step carries a mapping
  field, and the creation data names an option
- **THEN** the mapped targets hold the option's attributes on the created
  instance

#### Scenario: A technical mapped target still takes the mapped value

- **WHEN** a submission writes a picker field whose `columnMapping`
  targets a field declaring `technical: true`
- **THEN** the mapped attribute lands in `data` for that target

#### Scenario: A request writing a technical mapped target directly is rejected

- **WHEN** a submission carries a value for a `technical` field that is
  also a `columnMapping` target
- **THEN** it throws `SubmissionValidationError` with a `readonly-field`
  issue for that key, and the mapping does not run

### Requirement: A type-mismatching attribute is dropped and recorded

The engine SHALL drop a mapped attribute whose value does not match its target
field's declared type. It SHALL NOT write it, and it SHALL NOT fail the
submission.

The drop SHALL record a `datasource.attribute-dropped` event, in the same
transaction as the commit. `runtime-events` owns that kind.

Failing the submission is the wrong answer. The mismatch comes from operator
data, and the participant can do nothing about it. The rule follows the one
`Action.output` already sets. The side effect stands, the mismatching entry
does not land, and the record names it.

#### Scenario: A mistyped attribute is dropped
- **WHEN** the picked option carries a string attribute and its target field
  declares `number`
- **THEN** the target keeps its previous value and the submission succeeds

#### Scenario: The drop is recorded
- **WHEN** a mapped attribute is dropped
- **THEN** the instance carries a `datasource.attribute-dropped` event naming
  the mapping field, the column and the target

#### Scenario: One drop does not stop the others
- **WHEN** one mapped attribute mismatches and another matches
- **THEN** the matching one is written and only the mismatching one is recorded
