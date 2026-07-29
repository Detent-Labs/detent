## MODIFIED Requirements

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
