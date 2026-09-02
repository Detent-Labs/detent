<!-- antislop: allow-file passive-voice sentence-length run-ons synonym-rotation paragraph-length -->
<!-- Gherkin grammar is structurally passive, and the seven MODIFIED requirements below are copied whole from the live spec, whose debt predates this change; only the relationship-rule passages and the refusal scenarios are new. -->

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
relationship rule, throwing `AuthorizationError` otherwise. That rule
admits `ADMIN_ROLE`, the current claimant, and an eligible candidate
on the current step. It also admits a participant who holds no
revocation: the starter, or an actor the instance's principal set
names by id, role or group. A claim or a candidacy on the current step
outranks a revocation. `actor` is therefore load-bearing
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
`instance.assignment` to authorize the caller. That test accepts
`ADMIN_ROLE`, the current claimant, an eligible candidate on the current
step, and a participant the principal set names who holds no revocation.
Every caller that reaches the return already passed it.

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

### Requirement: Post a free-text comment on an instance through the runtime API

`postComment(instanceId, actor, text, db?)` SHALL apply the same
visibility rule `getInstanceView` applies, including its test-instance
narrowing. On a test instance, a non-administrative actor may act only
as its `startedBy`, never merely as claimant or eligible candidate.

That rule admits `system:admin`, a live claimant or eligible candidate
on the current step, and a participant the `authorization` capability's
relationship rule names who holds no revocation. A test instance admits
a non-administrative caller only as its `startedBy`.

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
  candidate, a matching principal, or `system:admin` calls `postComment`
- **THEN** it throws `AuthorizationError` and no row is inserted

#### Scenario: A test instance's creator can comment, a mere claimant cannot

- **WHEN** a test instance's `startedBy` actor calls `postComment`
- **THEN** the comment is inserted
- **WHEN** a different, non-administrative actor holding only a claim or
  candidacy on that same test instance calls `postComment`
- **THEN** it throws `AuthorizationError` and no row is inserted

### Requirement: List an instance's comments through the runtime API

`listComments(instanceId, actor, page, db?)` SHALL apply the same
visibility rule `postComment` applies, including its test-instance
narrowing. It SHALL return a page of the instance's comments ordered
`createdAt` ascending, then `id` ascending. It SHALL reuse the same
`limit`/`cursor` keyset-pagination shape `listInstances` and
`getInstanceRecord` already use.

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
  candidate, a matching principal, or `system:admin` calls `listComments`
- **THEN** it throws `AuthorizationError`

#### Scenario: A claimant who is not the creator cannot list a test instance's comments

- **WHEN** a non-administrative actor holding only a claim or candidacy
  (not `startedBy`) on a test instance calls `listComments`
- **THEN** it throws `AuthorizationError`

### Requirement: Upload an attachment to an instance through the runtime API

`uploadAttachment(instanceId, actor, { filename, contentType, data, sizeBytes }, db?)` SHALL apply the same
visibility rule `postComment` applies (`loadInstanceForActor`), including
its test-instance narrowing. That rule admits `system:admin`, a live
claimant or eligible candidate on the current step, and a participant the
`authorization` capability's relationship rule names who holds no
revocation. A test instance admits a non-administrative caller only as
its `startedBy`.

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
  candidate, a matching principal, or `system:admin` calls `uploadAttachment`
- **THEN** it throws `AuthorizationError` and no row is inserted

#### Scenario: A claimant who is not the creator cannot upload to a test instance

- **WHEN** a non-administrative actor holding only a claim or candidacy
  (not `startedBy`) on a test instance calls `uploadAttachment`
- **THEN** it throws `AuthorizationError` and no row is inserted

### Requirement: List an instance's attachments through the runtime API

`listAttachments(instanceId, actor, page, db?)` SHALL apply the same
visibility rule `uploadAttachment` applies, including its test-instance
narrowing. It SHALL return a page of the instance's attachments ordered
`createdAt` ascending, then `id` ascending. It SHALL reuse the same
`limit`/`cursor` keyset-pagination shape `listComments` already uses. It
SHALL NOT include `data` in any returned item.

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
  candidate, a matching principal, or `system:admin` calls `listAttachments`
- **THEN** it throws `AuthorizationError`

#### Scenario: A claimant who is not the creator cannot list a test instance's attachments

- **WHEN** a non-administrative actor holding only a claim or candidacy
  (not `startedBy`) on a test instance calls `listAttachments`
- **THEN** it throws `AuthorizationError`

### Requirement: Read one attachment's bytes through the runtime API

`getAttachment(instanceId, attachmentId, actor, db?)` SHALL apply the
same visibility rule `uploadAttachment` applies, including its
test-instance narrowing. On success it SHALL return the attachment's
`filename`, `contentType`, and `data`.

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
  candidate, a matching principal, or `system:admin` calls `getAttachment`
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

#### Scenario: A claimant who is not the creator cannot download a test instance's attachment

- **WHEN** a non-administrative actor holding only a claim or candidacy
  (not `startedBy`) on a test instance calls `getAttachment`
- **AND** the call targets one of that instance's attachments
- **THEN** it throws `AuthorizationError`
