# instance-migration

## Purpose

Defines explicit, version-scoped migration of running instances from one published
version of a process onto another version of the same process. A migration is
governed by a `MigrationSpec` registered as a plan keyed by its version pair,
applied uniformly to the whole running population, committed through the shared
step-entry path under a per-instance row lock, and recorded as a synthesized
`cause: "migration"` transition (or a `migration.skipped` event for instances the
rule cannot place).

## Requirements

### Requirement: A migration plan is an entity keyed by its version pair

The system SHALL persist a migration plan keyed `(processId, fromVersion,
toVersion)`, carrying a `MigrationSpec`, registered by its own operation
independently of publishing a definition. Publishing SHALL NOT accept, store, or
require a migration rule.

Several plans MAY target one version, so a population spread across versions 1, 2
and 3 reaches version 4 through three plans, without chaining through intermediate
versions and without those versions carrying rules of their own.

Both versions SHALL be published versions of the same process, and `fromVersion`
SHALL differ from `toVersion`.

#### Scenario: A plan is registered and retrieved by its version pair

- **WHEN** a plan is registered for a process from version 1 to version 2
- **THEN** it is retrievable for that `(processId, 1, 2)` key

#### Scenario: Several source versions target one target version

- **WHEN** plans are registered for `(1→4)`, `(2→4)` and `(3→4)`
- **THEN** all three are retrievable and each migration uses its own plan

#### Scenario: A plan naming an unpublished version is refused

- **WHEN** a plan names a version with no published row for that process
- **THEN** registration fails and no plan is persisted

#### Scenario: Publishing does not carry a rule

- **WHEN** a definition version is published
- **THEN** no plan is created and the published version is hash-identical to one
  published before this capability existed

### Requirement: A plan is frozen by an atomic guard once applied

Registering a plan for an existing key SHALL replace the stored spec only while the
plan has not been applied, and SHALL be refused once it has. The check and the
replacement SHALL be one atomic operation, not a read followed by a write.

An invocation SHALL read the plan and mark it applied — before processing any
instance, not on the first successful one — as one atomic operation, not a read
followed by a separate write. All instances in that invocation SHALL be migrated
under the spec that operation reads back. A read followed by a separate freeze
statement leaves the same window a non-atomic registration would: a registration
landing between the two can commit its spec after the read but before the freeze,
so the invocation migrates instances under the spec it already read while the row
is left frozen on a different, never-applied spec.

A rule that has moved instances describes history: the `HistoryEntry` of every
instance migrated under it is only interpretable against the rule that produced it,
and the outbox key rewrite reads the stored spec. A read-then-write leaves a window
in which one invocation migrates under spec A while another stores spec B, so the
record and the rule disagree with nothing to indicate it. Marking on first success
rather than first attempt leaves the plan editable for the whole of an invocation
that happens to skip everything it sees. Re-reading per batch would let one
invocation apply two rules to one population, contradicting the uniformity this
capability guarantees.

Before first use a plan describes only an intention, and an operator who finds a
typo must be able to correct it — without editing the process definition, which is
the only alternative when the rule belongs to an immutable version.

#### Scenario: An unused plan is replaced

- **WHEN** a plan is re-registered for a key under which nothing has migrated
- **THEN** the stored spec is replaced and governs subsequent migrations

#### Scenario: An applied plan is frozen

- **WHEN** a plan is re-registered after it has been applied
- **THEN** registration is refused and the stored spec is unchanged

#### Scenario: A registration racing an invocation does not slip through

- **WHEN** a registration and an invocation of the same plan run concurrently
- **THEN** either the registration is refused, or it commits before the invocation's
  atomic read-and-freeze observes it — never a state in which instances migrated
  under one spec while a different spec is left stored and frozen

#### Scenario: One invocation uses one spec throughout

- **WHEN** an invocation spans several batches
- **THEN** every instance it migrates is migrated under the spec its atomic
  read-and-freeze returned

#### Scenario: An invocation that migrates nothing still freezes the plan

- **WHEN** an invocation processes instances and skips all of them
- **THEN** the plan is marked applied and can no longer be replaced

#### Scenario: Freezing is per key

- **WHEN** `(1→4)` has been applied and `(2→4)` has not
- **THEN** `(2→4)` is still replaceable

#### Scenario: The frozen spec is always the one actually used

- **WHEN** a registration for the same key is attempted while an invocation's
  atomic read-and-freeze is in flight
- **THEN** the spec left permanently stored on the row is the same spec every
  instance in that invocation was migrated under, never a spec registered but
  applied to nothing

### Requirement: A plan is validated against both bodies at registration

Registration SHALL reject a plan that does not resolve against both versions:

- every `stepMap` key SHALL be a step declared by the source body, and every value a
  step declared by the target body;
- a `stepMap` value SHALL NOT be the reserved cancel-sink step, which is injected
  into every compiled body and so passes a bare existence check while parking the
  instance on the cancellation terminal;
- every `fieldMap` key SHALL be a field in the source catalog and every value a
  field in the target catalog;
- every `transforms` key SHALL be a field in the target catalog;
- `unmappableStep`, when present, SHALL be a step declared by the target body and
  SHALL NOT be the cancel-sink.

These are registration errors rather than runtime errors, for the reason plugin
config and CEL checking sit on the write path: a rule that resolves nowhere would
otherwise fail once per instance, mid-migration, after part of the population moved.

#### Scenario: A stepMap value outside the target body is refused

- **WHEN** a `stepMap` value names a step the target body does not declare
- **THEN** registration fails

#### Scenario: A stepMap key outside the source body is refused

- **WHEN** a `stepMap` key names a step the source body does not declare
- **THEN** registration fails

#### Scenario: The cancel-sink is refused as a target

- **WHEN** a `stepMap` value or `unmappableStep` names the reserved cancel-sink
- **THEN** registration fails

#### Scenario: An unmappableStep outside the target body is refused

- **WHEN** `onUnmappable` is `route-to-step` and `unmappableStep` names a step the
  target body does not declare
- **THEN** registration fails

### Requirement: A field crossing versions keeps a compatible type

Registration SHALL reject a plan under which a value would land in a field of an
incompatible type:

- for every `fieldMap` entry, source and target fields SHALL have the same CEL type;
- for every field id declared by **both** catalogs and not remapped, the two
  declarations SHALL have the same CEL type;
- every `transforms` expression's inferred result type SHALL match the declared type
  of the field it writes.

The identity-carried case is the one a per-entry check misses entirely: a field whose
id is unchanged has no `fieldMap` entry to hang a check on, yet its declared type may
have changed between versions.

Instance `data` is untyped against the catalog, but guards are typed against it. A
`string` landing in a field the target declares `number` makes every guard reading it
raise, which guard totality converts to `false` — a silently wrong branch, which is
what publish-time CEL checking exists to prevent.

#### Scenario: A fieldMap between incompatible types is refused

- **WHEN** `fieldMap` moves a `string` field into a field the target declares `number`
- **THEN** registration fails

#### Scenario: An identity-carried field whose type changed is refused

- **WHEN** a field id is declared `string` by the source and `number` by the target,
  with no `fieldMap` entry
- **THEN** registration fails

#### Scenario: A transform whose result type mismatches its target is refused

- **WHEN** a transform yielding a string targets a field the target declares `number`
- **THEN** registration fails

### Requirement: Migration is explicit, version-scoped, and applies one rule

The system SHALL provide an operation moving running instances from one published
version of a process onto another version of the same process, governed by the plan
registered for that version pair, and SHALL refuse when no plan is registered.

Publishing a version SHALL NOT migrate anything.

The rule SHALL apply uniformly to every running instance on the source version. The
operation SHALL NOT accept a per-instance rule, an instance filter, or a per-run
override.

#### Scenario: Publishing alone migrates nothing

- **WHEN** a new version is published while instances run on the previous version
- **THEN** every running instance keeps its `{version, definitionHash}` and step

#### Scenario: One invocation covers the whole population

- **WHEN** migration is invoked for a version pair with several running instances on
  the source version
- **THEN** each is evaluated against the same plan in that one invocation

#### Scenario: Migration without a registered plan is refused

- **WHEN** migration is invoked for a version pair with no plan
- **THEN** the operation is refused and no instance is modified

### Requirement: Only running instances migrate

Migration SHALL apply only to instances whose status is `running`. A `completed`,
`cancelled`, or `faulted` instance SHALL be left pinned to the version it ran on, so
its closed history keeps resolving against the body that produced it.

#### Scenario: A completed instance is untouched

- **WHEN** migration runs over a version carrying running and completed instances
- **THEN** the completed instances keep their pin, step, data, and history, and are
  not reported in any category

#### Scenario: A faulted instance is untouched

- **WHEN** an instance parked `faulted` by a cascade loop is in the population
- **THEN** it keeps its pin and remains `faulted`

### Requirement: The current step is remapped through stepMap

The instance's `currentStepId` SHALL be resolved against the target version as: the
`stepMap` image if one exists, otherwise the same step id if the target body declares
it. Identity is therefore the default and `stepMap` need not be total.

#### Scenario: An unchanged step id carries over without a map entry

- **WHEN** an instance sits on a step the target declares and `stepMap` has no entry
- **THEN** it migrates onto that same step id

#### Scenario: A mapped step is redirected

- **WHEN** `stepMap` maps the instance's current step to a different step id
- **THEN** the instance migrates onto the mapped step

### Requirement: A migration commits through the shared step-entry path

A migration that moves an instance SHALL commit by planning a step entry through the
shared commit path and applying it, rather than by writing the instance row itself.
It SHALL supply the reconciled timer set, the target version as the recorded version,
and the pin and payload as the additional fields to write.

Every consequence of entering a step therefore applies unchanged, including the
status derived from the target step's `terminal` flag and the subprocess return
enqueued for a terminal step with a parent. A migration SHALL NOT reimplement any of
them.

A migration that wrote the instance row directly would silently forgo whichever
consequences it did not reproduce, and each omission produces an instance stuck with
no record: a `running` instance on a terminal step that no path can complete, since
terminal steps have no outgoing paths and the shared path is the only writer of
`completed`; or a migrated child on a terminal step whose parent waits forever.

#### Scenario: Migration onto a terminal step completes the instance

- **WHEN** an instance migrates onto a step the target body marks terminal
- **THEN** its status is `completed`, not `running`

#### Scenario: A migrated child on a terminal step enqueues its return

- **WHEN** a child instance migrates onto a terminal step
- **THEN** the subprocess return is enqueued, and once delivered it drives the parked
  parent off its subprocess step

#### Scenario: A migration writes its pin and payload in the commit transaction

- **WHEN** a migration commits
- **THEN** the instance's version, definition hash, data, step, and sequence are
  written in one statement in that transaction

### Requirement: An instance is migrated under a row lock

A migration SHALL hold the instance's row from the read its remap is computed from
through the commit that writes it. The population scan SHALL therefore yield instance
identifiers only, and each instance's payload SHALL be re-read under the lock.

The optimistic-concurrency token does not protect `data`. An action writeback modifies
a single field of the payload without advancing or checking `transitionSeq`, so a
migration that computed its remap from a batch read and later wrote the payload
wholesale would erase any writeback landing in between — silently, with the
concurrency predicate still matching, over a window spanning the remainder of the
batch. Row-level locking is the only thing that closes this.

#### Scenario: A concurrent writeback is not erased

- **WHEN** an action writeback for an instance lands while that instance is being
  migrated
- **THEN** either the writeback is included in the migrated payload or it is applied
  after the migration commits — it is never overwritten and lost

#### Scenario: The scan does not carry payloads

- **WHEN** the population for a version is scanned
- **THEN** the scan yields identifiers, and each instance's payload is read within the
  transaction that migrates it

### Requirement: An identity migration does not spawn a second child

A migration whose target step id equals the instance's current step id SHALL suppress
the subprocess spawn.

A parent parked at a subprocess step already has a live child. The spawn's
idempotency is keyed on the transition sequence — the child id derives from the
parent, that sequence, and the step id — so a migration advancing the sequence
derives a **different** child id, misses the spawn handler's existence guard, and
creates a second child alongside the live one. Idempotency protects redelivery of one
commit, not a second commit onto one step.

A migration that relocates the instance onto a subprocess step it was not on SHALL
spawn normally: that is a genuine entry.

#### Scenario: An identity migration of a parked parent spawns nothing

- **WHEN** a parent parked at a subprocess step migrates onto the same step id
- **THEN** no spawn is enqueued and the instance still has exactly one child

#### Scenario: A relocation onto a subprocess step spawns a child

- **WHEN** an instance is relocated onto a subprocess step it was not previously on
- **THEN** the spawn is enqueued and a linked child is created

### Requirement: Entry actions run only when the step actually changed

The source step's `onExit` SHALL NOT run — the instance is not leaving by an authored
path, the rule cancellation follows. The target step's `onEntry` SHALL be enqueued
when the migration changed the step, and SHALL NOT be when it did not.

An identity migration is the common case, and re-firing the target's `onEntry` would
send one duplicate side effect per instance across the whole population from an
editorial republish. The idempotency key derives from the transition sequence, which
migration advances, so deduplication does not prevent it. A relocation is the
opposite: the instance arrives at a step it has never entered, whose `onEntry` is what
initializes it.

#### Scenario: An identity migration runs no entry actions

- **WHEN** an instance migrates onto the same step id and that step declares `onEntry`
- **THEN** no action is enqueued for that migration

#### Scenario: A relocation runs the target's entry actions

- **WHEN** an instance is relocated onto a step declaring `onEntry` actions
- **THEN** those actions are enqueued for the committed sequence

#### Scenario: onExit is skipped

- **WHEN** an instance migrates from a step declaring `onExit` actions
- **THEN** those actions do not run

### Requirement: The data payload is remapped losslessly from a snapshot

`data` SHALL be carried onto the target version by computing `fieldMap` renames and
`transforms` against a **snapshot of the pre-migration data**, then applying the
result as one patch. Renames SHALL NOT be applied sequentially.

A `fieldMap` entry moves the value at the source `FieldId` to the target and vacates
the source. `transforms` overlay the renames. A key with no mapping is retained under
its own id, including when the target catalog no longer declares it. `fieldMap` SHALL
be injective.

Snapshot semantics and injectivity are what make the result well-defined: read as
sequential mutation a swap collapses to one value and a rename into an occupied field
depends on the authored JSON's key order, and without injectivity two sources
targeting one field resolve the same way.

Retaining an orphan is safe rather than merely tolerable: guard-context re-keying
resolves `data` ids against the target catalog and skips ids it does not find, so an
orphan cannot be observed or collide. Dropping it would destroy data unrecoverably.

#### Scenario: An unmapped field keeps its value

- **WHEN** the target still declares a field and `fieldMap` has no entry for it
- **THEN** its value is present under the same `FieldId` after migration

#### Scenario: A renamed field moves and vacates its source

- **WHEN** `fieldMap` maps A to B and the instance has a value at A
- **THEN** the value is at B and A is absent

#### Scenario: A swap exchanges both values

- **WHEN** `fieldMap` maps A to B and B to A, with both populated
- **THEN** the two values are exchanged and neither is lost

#### Scenario: A rename into an occupied field overwrites it

- **WHEN** `fieldMap` maps A to B, B holds a value, and B has no mapping of its own
- **THEN** B holds A's value after migration, deterministically

#### Scenario: A non-injective fieldMap is refused at registration

- **WHEN** a plan maps two source fields to one target field
- **THEN** registration fails

#### Scenario: A field the target no longer declares is retained

- **WHEN** the instance holds a value for a field absent from the target catalog and
  `fieldMap` does not move it
- **THEN** the value is still present in `data` after migration

### Requirement: transforms compute target values from the pre-migration data

A `transforms` entry SHALL be a CEL expression keyed by the target `FieldId`,
evaluated over the pre-migration snapshot, its result written to that field.

Evaluation SHALL be total in the same sense as guard evaluation: an expression that
raises SHALL leave its target field unwritten and SHALL NOT fail the migration. A
mid-flight instance with incomplete data is the normal case, and failing its
migration would strand exactly the instances migration exists to move.

Values written SHALL be JSON-safe. The CEL library models `int` as bigint, and a
bigint written into the payload makes the instance unparseable on its next read —
corruption produced by the migration itself.

A dropped transform — whether from a raising expression or a value that cannot
be made JSON-safe — SHALL be recorded as a `migration.transform-dropped`
`InstanceEvent` (see `runtime-events`) naming the target field and the reason,
in the same transaction as the migration. The migration itself is unaffected;
this only makes the omission queryable.

#### Scenario: A transform writes a computed value

- **WHEN** a transform for target field B reads a populated source field A
- **THEN** B holds the computed result after migration

#### Scenario: A transform reads the snapshot, not the remapped data

- **WHEN** `fieldMap` moves A to B and a transform for C reads A
- **THEN** the transform sees A's original value

#### Scenario: A transform overwrites a renamed value

- **WHEN** `fieldMap` moves A to B and `transforms` also targets B
- **THEN** B holds the transform's result

#### Scenario: A raising transform leaves its field unwritten

- **WHEN** a transform reads a field the instance never wrote
- **THEN** the instance still migrates, its target field is absent from
  `data`, and a `migration.transform-dropped` event naming that field and
  reason `"expression-raised"` is recorded

#### Scenario: An integer-valued transform stays readable

- **WHEN** a transform yields a CEL integer
- **THEN** the migrated instance parses on its next read

### Requirement: An unmappable instance is handled by the declared policy

An instance is unmappable when its `currentStepId` has no image in the target version.
`reject-and-pin` SHALL leave it entirely untouched — pin, step, data, timers, and
`transitionSeq` — and record the skip. `route-to-step` SHALL migrate it onto
`unmappableStep` with the data remapping applied normally. An absent `onUnmappable`
SHALL behave as `reject-and-pin`.

#### Scenario: reject-and-pin leaves the instance on its old version

- **WHEN** an instance sits on a step the target removed, under `reject-and-pin`
- **THEN** it keeps its `{version, definitionHash}`, step, data, and `transitionSeq`,
  and is reported as skipped

#### Scenario: route-to-step relocates the instance

- **WHEN** an instance sits on a step the target removed, under `route-to-step`
- **THEN** it migrates onto `unmappableStep` with its data remapped

#### Scenario: An absent policy defaults to reject-and-pin

- **WHEN** an unmappable instance is migrated under a plan with no `onUnmappable`
- **THEN** it is skipped rather than relocated

#### Scenario: Mappable instances are unaffected by an unmappable sibling

- **WHEN** one instance is unmappable and another is not
- **THEN** the mappable one migrates and the other is skipped, in one invocation

### Requirement: A migrated instance is recorded as a synthesized transition

A migration that moves an instance SHALL advance `transitionSeq` and append one
`HistoryEntry` with `cause: "migration"`, `pathId: null`, `fromStepId` the
pre-migration step, and `toStepId` the post-migration step — which may be the same
id. The entry SHALL carry the **target** `version`, since it describes the state the
instance is now in and `toStepId` resolves there.

The sequence advance is load-bearing. `transitionSeq` is the optimistic-concurrency
token: every writer commits under `WHERE transition_seq = <observed>`. A migration
rewriting the pin without advancing it would leave a concurrently-read sequence still
matching, and that transition would commit against the body the instance is no longer
pinned to.

#### Scenario: A migration appends an entry and advances the sequence

- **WHEN** an instance at `transitionSeq` N migrates
- **THEN** its sequence is N+1 and one `HistoryEntry` at N+1 with `cause: "migration"`
  and `pathId: null` records the from- and to-step

#### Scenario: An identity step migration is still recorded

- **WHEN** an instance migrates onto the same step id
- **THEN** an entry is appended with `fromStepId` equal to `toStepId`

#### Scenario: The entry resolves against the target version

- **WHEN** a migration entry is read back
- **THEN** its `version` is the target version and `toStepId` is declared there

#### Scenario: A concurrent transition and a migration produce one winner

- **WHEN** a transition and a migration are attempted from the same observed sequence
- **THEN** exactly one commits, the other is refused as a concurrency conflict, and no
  partial write remains

### Requirement: A skipped instance is recorded as an event

An instance left behind — by `reject-and-pin`, because it holds actions in flight, or
because it would relocate off a subprocess step with a live child — SHALL be recorded
as a `migration.skipped` `InstanceEvent` naming the source version, the target version,
and the reason. The reason SHALL distinguish the three causes: `step-unmappable` is a
property of the rule and will recur, while `pending-actions` and `child-in-flight` are
transient and clear on their own. It SHALL NOT advance `transitionSeq` and SHALL NOT
append a `HistoryEntry`.

The event is scoped to instances the rule could not place. An instance that could not
be **read** SHALL NOT produce one: an event envelope requires the instance's id,
version, and sequence, which is exactly what a row that fails to parse cannot supply.
Such an instance is reported as failed instead.

#### Scenario: A skip is recorded without advancing the sequence

- **WHEN** an unmappable instance is skipped
- **THEN** a `migration.skipped` event is appended at its unchanged `transitionSeq`
  and no `HistoryEntry` is appended

#### Scenario: The residue is queryable

- **WHEN** the event log is queried for `migration.skipped`
- **THEN** every instance the rule could not place is returned, with both versions and
  the reason

#### Scenario: The three skip reasons are distinguishable

- **WHEN** the event log is queried after an invocation that skipped an unmappable
  instance, an in-flight-actions instance, and a live-child instance
- **THEN** each carries a distinct reason: `step-unmappable`, `pending-actions`, or
  `child-in-flight`

#### Scenario: An unreadable instance produces no event

- **WHEN** an instance's row cannot be parsed
- **THEN** no `migration.skipped` event is written for it

### Requirement: An instance with actions in flight is not migrated

An instance holding any outbox row that has not been delivered SHALL be skipped, with
the reason distinguishing it from an unmappable instance. It remains on the source
version and is migrated by a later invocation once its actions have drained.

`Action.output` is keyed by the **enqueuing version's** `FieldId`. Delivered after a
rename, such a row writes into the key the migration vacated — a value no
target-version guard can read and which is indistinguishable from one legitimately
retained, so the action's result is lost and the payload gains a ghost.

Declining is chosen over reconciling. Rewriting pending rows' field ids at migration
would require a precise status partition — a claimed row is both "in flight" and
"possibly abandoned", and those want opposite treatment — plus snapshot semantics for
key swaps, a stamp rule so a row that missed one migration is not laundered past the
next one's detection, folding the version check into the writeback's existing
predicate to avoid reintroducing a time-of-check gap, an additional index, and a
defined lock order against the delivery transaction. Six mechanisms that must all hold
in order to preserve a result a later invocation would deliver anyway.

Declining is also chosen over migrating and dropping the writeback: dropping silently
and permanently discards an effect the handler already produced, whereas skipping
defers the migration of one instance and records that it did so.

An instance whose row has dead-lettered will not migrate until that is cleared. This
is visible rather than silent, and a dead-lettered action is an operational problem
already.

#### Scenario: An instance with a pending action is skipped

- **WHEN** an instance in the population holds an undelivered outbox row
- **THEN** it is not migrated, it keeps its pin and step, and it is reported as skipped
  with the in-flight reason

#### Scenario: The skip is distinguishable from an unmappable skip

- **WHEN** the event log is queried after an invocation
- **THEN** an instance skipped for in-flight actions is distinguishable from one
  skipped as unmappable

#### Scenario: A later invocation migrates it once drained

- **WHEN** the instance's actions are delivered and the migration is invoked again
- **THEN** it migrates normally

#### Scenario: Delivered rows do not block a migration

- **WHEN** an instance holds only delivered outbox rows
- **THEN** it migrates normally

### Requirement: A relocation off a subprocess step with a live child is deferred

A migration that changes the step and vacates a **subprocess-typed** source step SHALL check whether
that step has a live linked child, and SHALL skip the instance when one exists rather than commit the
relocation. A child is **live** when its `status` is `running`, OR when it holds any undelivered outbox
row — a terminal child whose `core.returnSubprocess` return has not yet delivered. The skip is
transient: the instance keeps its pin and step, is recorded as a `migration.skipped` event with the
`child-in-flight` reason, and is migrated by a later invocation once the child settles.

The engine SHALL NOT repoint a child's `parent.stepId` under migration. Repointing a live child
misdirects its pending return: relocating onto another subprocess step lets the old child's return
drive the parent off the new step under that step's `outputMapping` — orphaning the genuinely-spawned
new child — while relocating onto a non-subprocess step makes the return dead-letter (`return: not a
subprocess step`), orphaning the child forever. Declining is chosen over reconciling, consistent with
the in-flight-actions gate: a pending return is keyed to the enqueuing version's step and contract, so
re-pointing it is a snapshot-versus-live race preserving a result a later invocation delivers anyway.

A settled child — terminal with every outbox row delivered, including the parked-forever
`outcome-unmatched` case — SHALL NOT block the migration and SHALL NOT have its link repointed. A
settled child's `parent.stepId` is inert: `core.returnSubprocess` no longer fires for it, and the only
other reader, `cancelInstance`'s cascade sweep, keys on `parent.instanceId` and `status = 'running'`,
never on `parent.stepId`.

#### Scenario: A running child blocks the parent's relocation

- **WHEN** a parent parked at a subprocess step with a running child is relocated to a different step
- **THEN** the instance is not migrated, keeps its pin and step, and is recorded as skipped with the
  `child-in-flight` reason

#### Scenario: A terminal child with an undelivered return blocks the relocation

- **WHEN** the child has reached a terminal step but its `core.returnSubprocess` row is not yet
  delivered, and the parent is relocated to a different step
- **THEN** the instance is skipped with the `child-in-flight` reason, and the child's link is unchanged

#### Scenario: A settled child does not block the relocation and is not repointed

- **WHEN** the parent is relocated off a subprocess step whose child is terminal with all outbox rows
  delivered
- **THEN** the instance migrates normally and the child's `parent.stepId` is left unchanged

#### Scenario: A later invocation migrates the parent once the child settles

- **WHEN** the blocking child settles and the migration is invoked again
- **THEN** the parent migrates normally

#### Scenario: A relocation off a non-subprocess step is unaffected

- **WHEN** an instance not on a subprocess step is relocated
- **THEN** the live-child gate does not apply and the migration proceeds

### Requirement: The operation terminates, isolates faults, and identifies outcomes

Instances SHALL be selected by keyset pagination over the instance id, so that each
batch strictly advances regardless of what happened to the previous one.

A bare limit over the source-version predicate does not terminate: an instance that
is skipped, that loses a concurrency race, or that cannot be read all remain on the
source version and therefore in the predicate, so once a batch's worth of them
accumulates the same batch is returned forever.

Each instance SHALL be processed in its own transaction inside its own error
boundary, covering the row parse and the body resolution as well as the commit, so
one unreadable row cannot starve the batch.

Re-invoking SHALL be safe: an instance already on the target version is outside the
selection. An instance skipped by `reject-and-pin` remains on the source version and
is skipped again under the same plan.

The result SHALL identify the instances **migrated**, **skipped**, **conflicted**, and
**failed** — by id, not by count. A conflicted instance lost a concurrency race and is
retryable; a failed instance could not be read. Neither is recorded by an event, so
the result is the only way an operator can act on them.

#### Scenario: A population larger than one batch is fully migrated

- **WHEN** the source version carries more running instances than one batch
- **THEN** every eligible instance is migrated by the invocation

#### Scenario: A batch of skipped instances does not stall the scan

- **WHEN** a full batch of instances is skipped under `reject-and-pin`
- **THEN** the next batch returns different instances and the invocation terminates

#### Scenario: One unreadable instance does not starve the batch

- **WHEN** one instance cannot be read or its body cannot be resolved
- **THEN** it is reported as failed and every other eligible instance is still
  migrated

#### Scenario: Each instance commits independently of the rest

- **WHEN** a population spanning more than one batch is migrated
- **THEN** after the first batch commits, those instances are on the target version
  with their history entries while the remainder are still unchanged on the source
  version — no instance's outcome depends on a later one's

#### Scenario: Re-running migrates nothing twice

- **WHEN** the same migration is invoked again after a complete run
- **THEN** no instance is migrated again and no additional `HistoryEntry` is appended

#### Scenario: A conflicted instance is identified and retryable

- **WHEN** an instance loses a concurrency race during migration
- **THEN** the result names it, it remains on the source version, and a later
  invocation migrates it
