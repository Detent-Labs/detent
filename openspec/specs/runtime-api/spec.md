# runtime-api

## Purpose

Defines the Runtime API Layer: the library boundary a UI (or, later, an HTTP
server) calls to run an instance without touching engine internals —
`createProcessInstance`, `getInstanceView`, `submitAndTransition`. It is a
library boundary, not a transport (`src/runtime/api.ts`): plain async TS
functions, resolving `ProcessBody` internally so callers only ever touch
`processId`/`instanceId`. Auth/actor resolution, assignment/claim
enforcement, and list/history endpoints are explicitly out of scope for this
capability.

## Requirements

### Requirement: Create a process instance through the runtime API

`createProcessInstance(processId, actor, opts?, db?)` SHALL create a new
instance of the newest published version of `processId` (or the version
given in `opts.version`), optionally seeded with `opts.data`, and SHALL run
it to rest (create-then-`resolveAutomatic`) before returning it. `opts.data`
SHALL be validated against the initial step's resolved view before creation —
field-set boundary, type, option membership, constraints, and
`validation.rule`, the same rules `submitAndTransition` applies to a
submission — evaluated against a stub `Instance` (minted id, `transitionSeq:
0`, `currentStepId` the initial step, `status` derived the same way
`store.ts::createInstance` derives it) that is then passed as the
actually-created instance's id, so the instance created is exactly the one
that was validated.

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

### Requirement: Resolve a display-ready view of an instance

`getInstanceView(instanceId, actor, db?)` SHALL return an `InstanceView`
describing the instance's current step, its resolved fields, and its
currently available manual paths, for an instance in any status. This read
uses the ordinary (unlocked) rehydrate path — a view is read-only, so there
is no concurrent writeback for it to race.

`fields` SHALL contain exactly the current step's `ViewField`s whose resolved
`visible` (literal `boolean`, used as-is, or CEL, evaluated with total
semantics, default `true`) is `true` against `buildGuardContext(body,
instance, actor)`, each carrying its resolved `required` and `readonly`. A
field resolving invisible SHALL be omitted entirely, not included with a
flag.

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
  instance
- **THEN** it returns the instance's `status` and its terminal step's
  resolved `fields`, with `availablePaths` empty

#### Scenario: View on a subprocess wait-state has no available paths
- **WHEN** `getInstanceView` is called for a `running` instance parked on a
  `subprocess` step
- **THEN** `status` is `"running"` and `availablePaths` is empty, since a
  subprocess step's paths are schema-enforced to be automatic, never manual

### Requirement: Submit data and trigger a manual transition atomically under a row lock

`submitAndTransition(instanceId, pathId, data, actor, db?)` SHALL, inside one
transaction, read the instance row with a row lock (`SELECT ... FOR UPDATE`),
resolve and hash-verify its pinned `ProcessBody`, validate `data` against the
current step's resolved view and against `FieldValidation`, and — on success
— commit the data write and the manual transition on `pathId` atomically via
`commitManualTransition`. The row lock is held for exactly this one commit,
not for any subsequent automatic-path cascade.

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

### Requirement: Submitted data is validated against field type, options, constraints, and rule

For every field key present in a submission, `submitAndTransition` (and
`createProcessInstance`'s `opts.data` seed) SHALL validate the submitted
value, against the merged (not-yet-committed) data, in this order:

1. A type match against the field's declared `FieldDef.type`, mirroring
   `check.ts::celType`'s existing mapping: `string`/`date`/`datetime`/
   `select`/`reference` require a JS `string`; `number` a JS `number`;
   `boolean` a JS `boolean`; `multiselect` an array of strings; `file` and a
   plugin (object) type are opaque and accepted as-is.
2. If `FieldDef.options` is declared (non-empty), the value (each item, for
   `multiselect`) must equal one `option.value`.
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
- **WHEN** a submitted value for a field with declared `options` does not
  equal any `option.value`
- **THEN** the result carries an `invalid-option` issue for that field

#### Scenario: A multiselect value is checked item-by-item against options
- **WHEN** a `multiselect` field declares `options` and a submitted array
  includes an item not among them
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
