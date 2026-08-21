<!-- antislop: allow-file passive-voice -->
## MODIFIED Requirements

### Requirement: Create a process instance through the runtime API

`createProcessInstance(processId, actor, registry, opts?, db?)` SHALL
create a new instance of `processId`. It uses the newest published
version, or the version `opts.version` names. `opts.data` MAY seed the
new instance. The call SHALL run that instance to rest before it
returns, by create-then-`resolveAutomatic`.

`createProcessInstance` SHALL check `opts.data` against the initial
step's resolved view before it creates anything. The check covers the
field-set boundary, the declared type, membership in the resolved
`options`, the constraints, and `validation.rule`. That membership read
covers a static list and a `dataSource`-bound one alike, per the
`data-source-resolution` capability. These are the same rules
`submitAndTransition` applies to a submission.

The check SHALL run against a stub `Instance`. That stub carries a
minted id, `transitionSeq: 0`, and `currentStepId` set to the initial
step. Its `status` derives the way `store.ts::createInstance` derives
one. The call SHALL then pass that minted id as the created instance's
own id. The instance it creates is therefore exactly the one it
checked.

<!-- antislop: allow synonym-rotation (false positive: names two distinct things, not two spellings of one) -->
`createProcessInstance` SHALL take a required `registry: DataSourceRegistry`
parameter. It threads that parameter into the `resolveFields` call that
resolves the initial step's view for this check.

The required check SHALL NOT run at creation. That holds whether or not
the caller passes `opts.data`. Requiredness is a transition-time gate.
`submitAndTransition` enforces it whenever a manual path leaves a step.
It is not an existence-time gate on creation at a step, nor on rest
there.

An instance MAY therefore start at a step whose view marks fields
required, with those fields still unfilled. A later
`submitAndTransition` supplies them. This is the ordinary "create an
empty instance, then fill in the initial step's form" flow. The
"capture" step of `examples/expense-approval.json` depends on it. That
step is itself the initial step, and it carries required fields.

`opts.data` SHALL NOT carry a key naming a `FieldDef` declaring
`technical: true`. The initial step's resolved view always reports such
a field `readonly: true`. The field-set boundary therefore rejects the
key as `readonly-field`, the way it rejects a submission.

#### Scenario: Creating an instance with no data seed
- **WHEN** a caller calls `createProcessInstance` for a process with no
  `opts.data`, even when the initial step's view marks fields required
- **THEN** the engine creates an instance pinned to the resolved
  version, runs it to rest, and returns it
- **AND** the required check does not block that creation

#### Scenario: Creating an instance pins to an explicit version
- **WHEN** a caller calls `createProcessInstance` with `opts.version`
  naming a published version older than the newest
- **THEN** the created instance pins to that explicit version, not the
  newest

#### Scenario: Creating an instance with a valid data seed
- **WHEN** a caller passes `opts.data` satisfying every type, option,
  constraint and rule check on the initial step's view
- **THEN** the engine creates the instance with that data present

#### Scenario: Creating an instance with an invalid data seed is rejected
- **WHEN** a caller passes `opts.data` carrying a value for a field on
  the initial step's view
- **AND** that value fails a type, option-membership, constraint, or
  `validation.rule` check
- **THEN** it throws `SubmissionValidationError` carrying that field's
  issue, and creates no instance

#### Scenario: A dataSource-bound field's seed data is validated against its resolved options
- **WHEN** a caller passes `opts.data` carrying a value for a
  `dataSource`-bound field on the initial step
- **AND** that value equals none of that data source's resolved options
- **THEN** it throws `SubmissionValidationError` with an
  `invalid-option` issue for that field, and creates no instance

#### Scenario: A seeded technical field is rejected
- **WHEN** a caller passes `opts.data` carrying a key for a `FieldDef`
  declaring `technical: true`, on a step whose view marks it visible
- **THEN** it throws `SubmissionValidationError` with a `readonly-field`
  issue for that key, and creates no instance

### Requirement: Resolve a display-ready view of an instance

`getInstanceView(instanceId, actor, registry, db?)` SHALL return an
`InstanceView`. It describes the instance's current step, its resolved
fields, and its currently available manual paths. This holds for an
instance in any status. This read uses the ordinary, unlocked rehydrate
path. A view is read-only.

No concurrent writeback races it. `getInstanceView` SHALL take a
required `registry: DataSourceRegistry` parameter. It threads that
parameter into the `resolveFields` call that resolves the current
step's view.

`getInstanceView` SHALL authorize `actor` against the loaded instance
before returning anything. It follows the `authorization` capability's
relationship rule. That rule admits `ADMIN_ROLE`, `startedBy`, the
current claimant, or an eligible candidate on the current step. It SHALL
throw `AuthorizationError` otherwise.

`actor` is therefore load-bearing twice. It is the authorization
subject. It is also the CEL guard context that `resolveFields` and
`resolveAvailablePaths` evaluate against.

A caller without `ADMIN_ROLE` who cannot load the instance SHALL see
that same `AuthorizationError`. An unrelated caller therefore cannot
tell a nonexistent instance apart from one they may not read. A caller
holding `ADMIN_ROLE` SHALL see the ordinary not-found response instead.

`fields` SHALL contain exactly the current step's `ViewField`s whose
resolved `visible` is `true` against `buildGuardContext(body, instance,
actor)`. `visible` may be a literal `boolean`, used as-is. It may also
be a CEL expression, evaluated with total semantics. Its default is
`true`.

Each entry carries its resolved `required`, `readonly`, `span`, and
`options`. Per the `data-source-resolution` capability, `options` comes
from static `FieldDef.options` unchanged, or resolves at runtime for a
`dataSource`-bound field.

`getInstanceView` SHALL omit a field that resolves invisible from
`fields` entirely. It SHALL NOT include the field with a flag instead.
`span` SHALL be the matching `ViewField.span`, or `1` when the view
declares none.

`InstanceView` SHALL also carry `columns`: the current step's
`view.columns`, or `1` when the view declares none. `columns` reports
regardless of `status`, the same way `step` itself does. It describes
the step's declared layout, not instance state.

A `ViewField` may resolve to a `FieldDef` of `type: "group"`, a
container that is never a leaf value in `instance.data`. Such a
`ViewField` SHALL still appear in `fields` when visible, so a caller
can see its label and its grouping. Its `value` SHALL always be
`undefined`. Its resolved `required` and `readonly` SHALL always read
`false`, regardless of the view's own declaration. It is never part of
the visible-and-required set the required check enforces. It is also
never part of the visible-and-editable set `submitAndTransition`
accepts.

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

The view SHALL carry `availablePaths`. It holds exactly the manual paths
on the current step whose guard holds against
`buildGuardContext(body, instance, actor)`. The view SHALL omit a path
that does not match, never flag it. A guardless manual path SHALL always
appear, since `evalGuard` treats an absent guard as satisfied.

Three cases SHALL leave `availablePaths` empty. The instance is not
`running`. The current step declares no manual path. Every manual path's
guard is false. The view SHALL always carry `status`, so a caller can
tell those three apart.

#### Scenario: An unrelated actor is refused before any field resolves

- **WHEN** an authenticated actor with no relationship to the instance
  and no `ADMIN_ROLE` calls `getInstanceView`
- **THEN** it throws `AuthorizationError`, and it resolves no data
  source and reads no field value out

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

- **WHEN** an actor with a relationship to a `completed` or `cancelled`
  instance calls `getInstanceView`
- **THEN** it returns the instance's `status` and its terminal step's
  resolved `fields`, with `availablePaths` empty

#### Scenario: View on a subprocess wait-state has no available paths

- **WHEN** a caller calls `getInstanceView` for a `running` instance
  parked on a `subprocess` step
- **THEN** `status` is `"running"` and `availablePaths` is empty, since a
  subprocess step's paths are schema-enforced to be automatic, never
  manual

#### Scenario: A dataSource-bound field's view carries its resolved options

- **WHEN** a caller calls `getInstanceView` for an instance parked on a
  step whose visible fields include one bound to a `dataSource`
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

### Requirement: Submit data and trigger a manual transition atomically under a row lock

`submitAndTransition(instanceId, pathId, data, actor, registry, db?)`
SHALL run inside one transaction. It SHALL read the instance row with a
row lock (`SELECT ... FOR UPDATE`). It SHALL resolve and hash-verify
the instance's pinned `ProcessBody`.

If the current step has a declared, non-unset `instance.assignment`,
`submitAndTransition` SHALL need `actor.id === instance.assignment.claimedBy`.
It SHALL throw `NotClaimedError` when `claimedBy` is unset. It SHALL
throw `NotClaimantError` when `claimedBy` names a different actor. All
of this SHALL happen before any submission validation runs.

A step with no declared `assignment` SHALL NOT thereby become open to
every authenticated actor. The caller must be the instance's starter
(`instance.startedBy === actor.id`), or must carry `ADMIN_ROLE`.
`submitAndTransition` SHALL reject any other caller with
`AuthorizationError`, before any submission validation runs.

This floor is deliberately weaker than the claimant rule. Starter and
operator are the only relationships an assignment-less step defines.
The floor exists for a reason. Omitting one optional authoring key must
not open a step to an actor with no relationship to the instance.

Once this check passes, `submitAndTransition` SHALL validate `data`
against the current step's resolved view. It SHALL use the required
`registry: DataSourceRegistry` parameter to resolve `dataSource`-bound
fields' options. This follows the `data-source-resolution` capability.
It SHALL also validate `data` against `FieldValidation`. On success it
SHALL commit the data write and the manual transition on `pathId`
atomically, via `commitManualTransition`.

The row lock covers exactly this one commit. It does not cover any
subsequent automatic-path cascade.

The row lock exists for one reason. The `transitionSeq`
optimistic-concurrency predicate does not protect a wholesale `data`
patch. A concurrent `Action.output` writeback (`outbox.ts`) patches a
single field of `data`, without advancing or checking `transitionSeq`.
An unlocked read taken before such a writeback lands, but committed
after, produces a wholesale patch. That patch would silently discard
the writeback.

`submitAndTransition` SHALL NOT use an unlocked read, such as
`store.ts::rehydrate` alone, for the read that grounds its commit.

`submitAndTransition` SHALL take `instanceId`, never a caller-supplied
`Instance` snapshot. The whole read-validate-commit sequence therefore
stays inside one call and one transaction.

Every key in `data` SHALL lie within the current step's
visible-and-editable field set. That set is `visible && !readonly`,
excluding any `ViewField` resolving to a group-container ref.
`submitAndTransition` SHALL resolve that set the same way
`getInstanceView` resolves `fields`, against the pre-submission
committed data.

`submitAndTransition` SHALL reject a key outside that set, without
touching the instance. It SHALL reject a key not present in the
resolved view as `unknown-field`. It SHALL reject a key present but not
editable as `readonly-field`. `submitAndTransition` SHALL reject a key
naming a `technical` field the current step's view resolves visible as
`readonly-field`, since that resolution always reports it
`readonly: true`. A technical field the current step's view does not
resolve at all falls under the `unknown-field` rule above, unchanged.

`submitAndTransition` SHALL collect all located validation issues into
one thrown `SubmissionValidationError`, rather than failing on the
first one found.

Only once every submitted field passes SHALL `submitAndTransition`
evaluate the target path's guard, against the merged instance. That
instance has the data applied, but not yet committed. A guard that
evaluates false SHALL throw the existing `GuardRefused`. The instance
SHALL then stay uncommitted.

After the commit's transaction completes, `submitAndTransition` SHALL
run the resulting instance through `resolveAutomatic`. It SHALL use the
ordinary, unlocked `db`, matching the transactional granularity every
other automatic-cascade caller already uses.

If this cascade raises the engine's existing `AutomaticCascadeLoop`,
the submitted data and the manual transition have already committed.
This is not a rejected submission. The instance instead becomes
`faulted`.

#### Scenario: A field outside the current view is rejected
- **WHEN** `data` includes a key for a field not visible on the instance's
  current step
- **THEN** it throws `SubmissionValidationError` with an `unknown-field`
  issue for that key, and the instance stays uncommitted

#### Scenario: A field marked readonly on the current view is rejected
- **WHEN** `data` includes a key for a field the current step's view marks
  `readonly`
- **THEN** it throws `SubmissionValidationError` with a `readonly-field`
  issue for that key, and the instance stays uncommitted

#### Scenario: A group-container field is never an accepted submission key
- **WHEN** `data` includes a key for a `FieldDef` of `type: "group"`, even
  one the current step's view marks visible
- **THEN** it throws `SubmissionValidationError` with an `unknown-field`
  issue for that key

#### Scenario: A technical field is never an accepted submission key
- **WHEN** `data` includes a key for a `FieldDef` declaring
  `technical: true`, even on a step whose view marks it visible
- **THEN** it throws `SubmissionValidationError` with a `readonly-field`
  issue for that key, and the instance stays uncommitted

#### Scenario: Multiple validation issues are all reported together
- **WHEN** a submission violates more than one validation rule at once
- **AND** one field fails a type check while another lacks a required
  value
- **THEN** the thrown `SubmissionValidationError` carries an issue for
  each violation, not only the first

#### Scenario: A valid submission commits data and transition atomically, preserving unrelated fields
- **WHEN** `data` passes every validation rule and the target path's
  guard holds against the merged instance
- **AND** the instance's existing `data` carries fields this submission
  does not include
- **THEN** it writes the submitted data and keeps every other
  previously stored field present
- **AND** the manual transition on `pathId` commits in the same atomic
  operation, and the returned `Instance` reflects both

#### Scenario: A submission whose merged guard fails is rejected without commit
- **WHEN** `data` passes every validation rule but the target path's guard
  evaluates false against the merged instance
- **THEN** it throws the existing `GuardRefused`, and it commits neither
  the data nor the transition

#### Scenario: Two concurrent submissions serialize rather than racing into a concurrency conflict
- **WHEN** two `submitAndTransition` calls target the same instance
  concurrently
- **THEN** the row lock serializes them. The second call's read blocks
  until the first's transaction commits, then observes the
  already-committed state
- **AND** it either succeeds against that new state or fails with its
  own ordinary outcome, never `ConcurrencyConflict`

#### Scenario: An unlocked engine-level commit racing submitAndTransition surfaces a concurrency conflict
- **WHEN** a direct, unlocked engine call, such as
  `executeManualTransition` or `fireTimer` holding a stale in-memory
  `Instance`, commits against the same instance
- **AND** that commit lands concurrently with a `submitAndTransition`
  call
- **AND** `submitAndTransition`'s commit lands first
- **THEN** the unlocked call's own commit throws the engine's existing
  `ConcurrencyConflict` when it discovers `transitionSeq` moved out from
  under it

#### Scenario: A concurrent action writeback is not lost
- **WHEN** an `Action.output` writeback into a field outside a submission
  lands on the instance between `submitAndTransition`'s locked read and
  its commit
- **THEN** the writeback's value is present in the instance's `data`
  after the submission commits
- **AND** the row lock serializes the writeback's own commit either
  fully before or fully after `submitAndTransition`'s transaction
- **AND** neither one reads a state the other is mid-writing

#### Scenario: A cascade loop after a successful submission is not a rejected submission
- **WHEN** `submitAndTransition`'s commit succeeds and the subsequent
  automatic cascade re-enters a step already seen in the same advance
- **THEN** it throws the engine's existing `AutomaticCascadeLoop`, the
  submitted data and manual transition stay committed, and the
  instance's status becomes `faulted`

#### Scenario: A submission to an unclaimed assigned step is rejected before validation
- **WHEN** the current step has a declared `assignment` with `claimedBy`
  unset, and any actor calls `submitAndTransition`
- **THEN** it throws `NotClaimedError` before any field validation runs,
  and the instance stays uncommitted

#### Scenario: A submission by a non-claimant to a claimed step is rejected
- **WHEN** the current step has a declared `assignment` with `claimedBy`
  set to a different actor's id
- **AND** the calling actor's id does not match
- **THEN** it throws `NotClaimantError` before any field validation runs,
  and the instance stays uncommitted

#### Scenario: The claimant may submit
- **WHEN** the current step has a declared `assignment` with `claimedBy`
  set to the calling actor's id
- **THEN** the enforcement check passes, and submission proceeds to
  field validation as normal

#### Scenario: The starter may submit a step with no declared assignment
- **WHEN** the current step has no `assignment` field, and the calling
  actor started the instance
- **THEN** no claim check applies, and submission proceeds to field
  validation as normal

#### Scenario: An operator may submit a step with no declared assignment
- **WHEN** the current step has no `assignment` field, and the calling
  actor carries `ADMIN_ROLE` without having started the instance
- **THEN** submission proceeds to field validation as normal

#### Scenario: An unrelated actor may not submit a step with no declared assignment
- **WHEN** the current step has no `assignment` field, and the calling
  actor neither started the instance nor carries `ADMIN_ROLE`
- **THEN** it throws `AuthorizationError` before any field validation
  runs, and the instance stays uncommitted

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
- **THEN** the engine writes nothing for that key, and the submission
  succeeds

#### Scenario: An unfilled attribute writes nothing
- **WHEN** the picked option carries no attribute for a mapped column
- **THEN** the engine writes nothing for that key, and the submission
  succeeds

#### Scenario: A field the request omits keeps its targets
- **WHEN** a request writes no value for a mapping field
- **THEN** the mapped targets keep whatever `data` already holds

#### Scenario: Two pickers resolve in view order
- **WHEN** one request writes two mapping fields, and the request's key order
  differs from the step's view order
- **THEN** the engine applies them in view order

#### Scenario: An initial step's assignment reads the mapped data
- **WHEN** an actor creates an instance at a step whose assignment
  strategy reads a mapped field
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
