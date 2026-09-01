<!-- antislop: allow-file passive-voice sentence-length paragraph-length run-ons synonym-rotation -->
<!-- The MODIFIED block below carries live-spec text verbatim, which the archive step matches by exact header, so its existing findings stay unrewritten. -->
## MODIFIED Requirements

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

When the loaded instance is a test instance (`kind: "test"`, per the
`draft-test-instances` capability), the relationship rule narrows. The
rule SHALL authorize a non-administrative actor only as that test
instance's own `startedBy`. For an ordinary instance, the current step's
claimant or an eligible assignment candidate can read it directly. A test
instance's non-administrative actor SHALL NOT rely on that standing
alone.

This narrowing lets the actor who created a test instance view and drive
it. The `draft-test-instances` capability's studio-only creation route
stamps `startedBy` from the authenticated actor. The caller cannot
supply it. A different actor who merely holds a claim or candidacy on
the test instance cannot read it. That same standing would grant access
to an ordinary instance's real assignment holder. The `ADMIN_ROLE` role
continues to authorize access to a test instance exactly as it does to
an ordinary one.

`fields` SHALL contain exactly the current step's view entries whose
resolved `visible` (literal `boolean`, used as-is, or CEL, evaluated
with total semantics, default `true`) is `true` against
`buildGuardContext(body, instance, actor)`. A field entry carries its
resolved `required`, `readonly`, `span`, and `options`, per the
`data-source-resolution` capability. That capability names three sources
for `options`. Static `FieldDef.options` carries through unchanged. A
`dataSource`-bound field resolves its own at runtime. A field declaring
`format: "person"` and neither of those resolves the body's own
`allowedGroups` expansion. A field resolving invisible SHALL be
omitted entirely, not included with a flag. `span` SHALL be the
matching `ViewField.span`, or `1` when the view declares none.

A view entry is a field entry or a note entry, per the
`definition-contract` capability. Every rule in this requirement that
names a `ViewField` reaches a field entry. A note entry resolves under
the same `visible` rule and carries `kind`, `text`, `group` and `span`
alone.
The "View resolution emits a note in place and withholds a hidden one"
requirement states the rest.

`InstanceView` SHALL also carry `columns`: the current step's
`view.columns`, or `1` when the view declares none. `columns` reports
regardless of `status`, the same way `step` itself does, since it
describes the step's declared layout rather than instance state.

`InstanceView` SHALL also carry `kind` (`"published"` or `"test"`),
mirroring the underlying instance's own `kind`. A caller then renders a
test instance distinctly with no separate lookup.

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

#### Scenario: A bare person field's view carries its allowedGroups-resolved options

- **WHEN** `getInstanceView` is called for an instance parked on a step
  whose visible fields include one declaring `format: "person"` and neither
  `options` nor `dataSource`
- **THEN** that field's resolved `options` reflects the body's own
  `allowedGroups` expansion, per the `data-source-resolution` capability

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

#### Scenario: A test instance's view carries kind "test"

- **WHEN** `getInstanceView` resolves an instance whose `kind` is `"test"`
- **THEN** the returned `InstanceView.kind` is `"test"`

#### Scenario: A published instance's view carries kind "published"

- **WHEN** `getInstanceView` resolves an instance whose `kind` is
  `"published"`
- **THEN** the returned `InstanceView.kind` is `"published"`

#### Scenario: A test instance's own creator retains access

- **WHEN** the caller is a test instance's `startedBy` actor, holding no
  `ADMIN_ROLE`
- **THEN** `getInstanceView` resolves the view exactly as it would for
  that same actor on an ordinary instance they started

#### Scenario: A claimant who is not the creator is refused a test instance

- **WHEN** the caller is a test instance's current step's claimant or an
  eligible assignment candidate
- **AND** the caller is not that test instance's `startedBy` and holds no
  `ADMIN_ROLE`
- **THEN** `getInstanceView` throws `AuthorizationError`, the same
  refusal a caller with no relationship to the instance at all receives

#### Scenario: Administrative access to a test instance is unaffected

- **WHEN** the caller holds `ADMIN_ROLE`
- **THEN** `getInstanceView` resolves a test instance's view exactly as
  it resolves an ordinary instance's

## ADDED Requirements

### Requirement: View resolution emits a note in place and withholds a hidden one

Resolving a step's view SHALL emit a note entry at the position the authored
array gives it. The emitted entry SHALL carry `kind: "note"`, the note's
`text`, and its `group` and `span`. A note SHALL carry no value, no
requiredness and no readonly state into the resolved view.

`kind` is what a caller discriminates on, mirroring the authored rule the
`definition-contract` capability states. A resolved entry carrying no `kind`
is a field entry. Emitting a note without it leaves a caller reading the note
as a field, which is the one shape the renderer cannot draw.

Resolution SHALL evaluate a note's `visible` the way it evaluates a field
entry's. A note the guard hides SHALL produce no resolved entry, so its `text`
never reaches a caller. Withholding the text matters on its own. An author uses
a note to explain a rule that applies to some instances. A hidden note's wording
can name a threshold the reader is not meant to see.

#### Scenario: A visible note reaches the resolved view in array order

- **WHEN** a step's view holds a field entry, then a note whose `visible`
  evaluates true, then a second field entry
- **THEN** the resolved view carries three entries in that order, the middle
  one a note carrying `kind: "note"` and its text

#### Scenario: A hidden note's text never leaves the engine

- **WHEN** a step's view holds a note whose `visible` evaluates false
- **THEN** the resolved view carries no entry for that note, and the response
  carries none of its text

#### Scenario: A note with no visible key resolves as shown

- **WHEN** a step's view holds a note declaring no `visible`
- **THEN** the resolved view carries it, matching how a field entry with no
  `visible` resolves

### Requirement: A note widens no submission check

A note SHALL contribute no key to the field set the engine checks a submission
against. A step whose view holds a note SHALL accept exactly the keys its field
entries accept.

#### Scenario: A note leaves the accepted key set alone

- **WHEN** a caller creates an instance at a step whose view holds one field
  entry and one note
- **THEN** the caller may seed that one field, and every other key still throws
  `unknown-field`

#### Scenario: A note changes no required-field verdict

- **WHEN** a caller submits a path from a step whose view holds a note and a
  required field entry
- **AND** the caller supplies that field
- **THEN** the submission succeeds, because the note carries no requiredness of
  its own
