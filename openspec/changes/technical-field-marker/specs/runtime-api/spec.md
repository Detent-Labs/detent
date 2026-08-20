## MODIFIED Requirements

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
resolved body already means. It is never part of the visible-and-
required set. It is also never part of the visible-and-editable set
`submitAndTransition` accepts.

<!-- Why: this heading must match openspec/specs/runtime-api/spec.md's
     existing scenario title verbatim, or `openspec validate` reports the
     archived scenario as dropped. -->
<!-- antislop: allow passive-voice -->
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

<!-- antislop: allow passive-voice -->
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

<!-- antislop: allow passive-voice -->
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
The floor exists so that omitting one optional authoring key cannot
make a step writable. Otherwise even an actor with no relationship to
the instance at all could write to it.

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
editable as `readonly-field`. `submitAndTransition` SHALL always reject
a key naming a `technical` field as `readonly-field`. `getInstanceView`'s
resolution always reports a technical field as `readonly: true`.

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

<!-- antislop: allow passive-voice -->
#### Scenario: A field outside the current view is rejected
- **WHEN** `data` includes a key for a field not visible on the instance's
  current step
- **THEN** it throws `SubmissionValidationError` with an `unknown-field`
  issue for that key, and the instance stays uncommitted

<!-- antislop: allow passive-voice -->
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

<!-- antislop: allow passive-voice -->
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

<!-- antislop: allow passive-voice -->
#### Scenario: A submission to an unclaimed assigned step is rejected before validation
- **WHEN** the current step has a declared `assignment` with `claimedBy`
  unset, and any actor calls `submitAndTransition`
- **THEN** it throws `NotClaimedError` before any field validation runs,
  and the instance stays uncommitted

<!-- antislop: allow passive-voice -->
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
