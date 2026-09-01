# transition-execution

## Purpose

Defines how the engine advances an instance one step: the instance is pinned to a
frozen definition, a single manual path executes its triggers in order and commits
atomically with `transitionSeq` as the optimistic-concurrency token, and each
committed transition appends exactly one append-only `HistoryEntry`. Action
dispatch (side effects) and automatic-path evaluation are separate capabilities.

## Requirements

### Requirement: Instance is pinned to a frozen definition

An instance SHALL record `{ processId, version, definitionHash }` at creation and
SHALL execute against exactly that frozen `ProcessBody`. The engine MUST NOT
advance an instance against a body whose canonical hash differs from the pinned
`definitionHash`.

#### Scenario: Instance is created pinned to its definition
- **WHEN** an instance is created from a published version
- **THEN** it persists `processId`, `version`, and that version's `definitionHash`, and its `currentStepId` is the definition's `initialStep`

#### Scenario: Rehydration against a mismatched body is rejected
- **WHEN** a persisted instance is loaded together with a `ProcessBody` whose canonical hash does not equal the instance's pinned `definitionHash`
- **THEN** the engine refuses to execute and surfaces a pin mismatch, rather than running against the wrong body

### Requirement: A manual transition executes onExit → onPath → onEntry

Executing a manual path SHALL run triggers in the order `onExit(source)` then
`onPath` then `onEntry(target)`, commit the new `currentStepId`, and do so as one
atomic unit — a failure before commit leaves the instance on its source step with
its prior `transitionSeq`. The commit SHALL write the instance's
`{currentStepId, transitionSeq, status, timers}` and SHALL NOT overwrite instance
`data` unless a caller explicitly supplies it as a field patch, so a post-commit
action writeback into `data` is not clobbered by a subsequent transition.

The engine SHALL expose `commitManualTransition(instance, pathId, body, actor,
db, dataPatch?)`, committing exactly one manual transition (guard check plus
commit) with no automatic-path cascade. `executeManualTransition` SHALL be
`commitManualTransition` followed by `resolveAutomatic`, unchanged in exported
signature and behavior for every caller that supplies no `dataPatch`. Both
functions SHALL accept the same optional `dataPatch` parameter.

When `dataPatch` is supplied, `commitManualTransition` SHALL compute the full
merged data object — `{ ...instance.data, ...dataPatch }`, not `dataPatch`
alone — and SHALL use it consistently in three places: as the data the guard
is evaluated against; as the `instance` passed to the underlying step-entry
plan (so that data-dependent step-entry consequences, such as an armed
deadline timer reading the patched field, and the in-memory `Instance` the
commit returns, both reflect the merged data rather than the pre-patch data);
and as the field patch threaded to the commit so the write lands atomically
with the transition, under the same optimistic-concurrency predicate, in the
same transaction. Passing `dataPatch` alone as the field patch is insufficient
and SHALL NOT be done, since the commit's underlying merge is shallow at the
top level of the persisted body: a field patch carrying only the submitted
keys would replace the instance's entire persisted `data` object rather than
extend it, discarding every previously stored field.

A manual transition that omits `dataPatch` sees unchanged behavior: the
guarantee that it writes no data patch is absolute in that case. The
carve-out exists because the shared commit also serves callers whose entry is
not an authored hop; one that patches `data` carries the row-locking
obligation stated with that requirement.

#### Scenario: Trigger order is onExit, onPath, onEntry
- **WHEN** an instance takes a manual path from source step S to target step T
- **THEN** the source step's `onExit`, then the path's triggers, then the target step's `onEntry` are processed in that order, and the instance's `currentStepId` becomes T

#### Scenario: A path may only be taken when its guard holds
- **WHEN** a manual path carries a guard that evaluates to false against the instance's frozen context
- **THEN** the transition is refused and the instance stays on its source step

#### Scenario: A transition with no data patch does not overwrite instance data
- **WHEN** a value is present in an instance's `data` and the instance then commits a manual transition with no `dataPatch` supplied
- **THEN** that value is preserved, because the transition writes only `currentStepId`, `transitionSeq`, `status` and `timers`

#### Scenario: A guard sees data merged from a supplied patch
- **WHEN** `commitManualTransition` is called with a `dataPatch` and the target path's guard reads a field the patch sets
- **THEN** the guard evaluates against the patch merged over the instance's existing data, not against the existing data alone

#### Scenario: A supplied data patch commits atomically with the transition, preserving unrelated fields
- **WHEN** `commitManualTransition` is called with a `dataPatch` covering only some of the instance's fields, and the guard holds
- **THEN** the patched fields are written, every other previously stored field of `data` remains present, and the step transition commits in the same atomic operation under the same `transitionSeq` predicate

#### Scenario: The returned instance and target-step timer arming both see the merged data
- **WHEN** `commitManualTransition` is called with a `dataPatch` and the target step declares a `deadline` timer that reads a field the patch sets
- **THEN** the timer is armed against the merged data, and the `Instance` `commitManualTransition` returns carries the merged data, not the pre-patch data

#### Scenario: executeManualTransition composes the commit with the cascade
- **WHEN** `executeManualTransition` is called with a `dataPatch` and the guard holds
- **THEN** its result is identical to calling `commitManualTransition` with the same arguments and then `resolveAutomatic` on the result

#### Scenario: Omitting the data patch leaves existing behavior unchanged
- **WHEN** `executeManualTransition` or `commitManualTransition` is called with no `dataPatch` argument
- **THEN** its guard evaluation, commit, and resulting instance are identical to a call made before the parameter existed

### Requirement: transitionSeq is a monotonic optimistic-concurrency token

`transitionSeq` SHALL increase by exactly one on each committed transition and
SHALL act as the optimistic-concurrency token: a transition computed from a stale
`transitionSeq` MUST fail to commit rather than overwrite a concurrent update.

#### Scenario: Sequential transitions increment the token
- **WHEN** an instance at `transitionSeq` N commits a transition
- **THEN** its persisted `transitionSeq` becomes N+1

#### Scenario: A stale write loses
- **WHEN** two transitions are computed from the same `transitionSeq` N and both attempt to commit
- **THEN** the first to commit wins at N+1 and the second is rejected as a concurrency conflict, leaving no partial write

### Requirement: One HistoryEntry per committed transition

Each committed transition SHALL append exactly one append-only `HistoryEntry`
recording the active `version`, the resolved `pathId`, `fromStepId`, `toStepId`,
the committed `transitionSeq`, and a `cause`. For a manual transition the `cause`
is `user`.

#### Scenario: A manual transition records one audit entry
- **WHEN** an instance commits a manual transition from S to T at `transitionSeq` N+1
- **THEN** exactly one `HistoryEntry` is appended with `cause: "user"`, `fromStepId: S`, `toStepId: T`, `transitionSeq: N+1`, and the version active at that entry

### Requirement: A synthesized transition commits with a null path

The shared commit path SHALL commit a synthesized transition — one with no
authored `Path` — given an explicit `toStepId`, an explicit ordered action list,
and a `cause`. Such a transition SHALL record `pathId: null` in its `HistoryEntry`
and SHALL be subject to the same `transitionSeq` optimistic-concurrency rule and
the same target-step timer arming as an authored-path transition. It SHALL NOT
derive its `toStepId` or trigger list from an authored path.

Every consequence of committing a transition onto a step SHALL apply to a
synthesized transition identically to an authored one, because each is a function of
the step being **entered** rather than of how it was entered: the instance's
resulting `status`, the subprocess spawn, the subprocess return, the enqueue of the
supplied actions, the appended `HistoryEntry`, the armed timer set, and the
scheduling column.

This is scoped to transitions. Instance creation is a separate step-entry path that
does not route through the shared commit and therefore does not inherit these
consequences generically; each one creation needs is reproduced there deliberately.
The subprocess spawn is reproduced: an instance created on a definition whose
`initialStep` is a `subprocess` step SHALL have its spawn enqueued inside the
creation transaction, carried by a `subprocess.spawn-enqueued` event rather than by
a `HistoryEntry` (creation writes none). See the `subprocess-execution` and
`runtime-events` specs, which own that requirement. The remaining divergence —
creation appends no `HistoryEntry` and advances no `transitionSeq` — is intrinsic to
creation, not a gap.

No caller SHALL re-implement the commit in order to vary one of these. A
re-implementation silently forgoes every consequence it does not reproduce, and each
omission produces an instance that is stuck with no record of why — a `running`
instance on a terminal step that no path can complete, a child that never returns, a
parent parked on a subprocess step with no child.

#### Scenario: Synthesized transition records a null pathId
- **WHEN** a synthesized transition commits to an explicit target step
- **THEN** its `HistoryEntry` has `pathId: null`, `toStepId` equal to the supplied target, and the supplied actions enqueued to the outbox

#### Scenario: Synthesized transition obeys optimistic concurrency
- **WHEN** a synthesized transition is computed from `transitionSeq` N while another transition already committed at N+1
- **THEN** the synthesized transition is rejected as a concurrency conflict and leaves no partial write

#### Scenario: Synthesized transition to a terminal step completes on arm
- **WHEN** a synthesized transition commits to a terminal target step
- **THEN** the target step's timers are (dis)armed exactly as for an authored-path transition and `next_timer_at` reflects the target step

### Requirement: The commit is planned separately from being executed

The shared commit path SHALL expose the computation of a step entry separately from
its execution: a planning step deriving the resulting instance, the `HistoryEntry`,
the events, and the rows to enqueue; and an execution step writing that plan within a
**supplied** transaction rather than one it opens itself. The ordinary entry point
SHALL remain the two composed, opening its own transaction.

A caller with writes that must land atomically with a step entry SHALL be able to
place them in the same transaction. Without this, such a caller must either write
outside the commit's transaction, losing atomicity, or re-implement the commit, losing
its consequences.

The planning step SHALL perform no I/O, so that what a step entry implies is
determinable without a datastore. It is not otherwise pure: it mints identifiers and
reads the clock, so plans are not comparable by value without masking those. It is
also partial — computing an armed set can raise — and a caller that computes its own
armed set inherits that outside the planner.

The planning step SHALL take the `pathId`, `cause`, `actorId` and ordered action list
as inputs. Without them the `HistoryEntry` and the enqueued rows are unconstructible.

#### Scenario: A caller writes atomically with the commit

- **WHEN** a caller opens a transaction, applies a planned step entry, and writes an
  additional row in that same transaction
- **THEN** both are committed together, and a failure in either leaves neither

#### Scenario: The ordinary entry point is unchanged

- **WHEN** a transition is committed through the ordinary entry point
- **THEN** the instance row, `HistoryEntry`, events and outbox rows it writes are
  identical to those written before the split

#### Scenario: Planning performs no writes

- **WHEN** a step entry is planned but never applied
- **THEN** no instance, history entry, event, or outbox row is written

#### Scenario: A replanned entry commits at most once

- **WHEN** a step entry is planned, applied, and the transaction fails, and the caller
  replans and reapplies
- **THEN** exactly one commit takes effect, the second losing on the concurrency
  predicate if the first succeeded

### Requirement: The applier writes a caller-supplied field patch

The execution step SHALL accept an optional field patch and write it to the instance
row alongside its own fields, under the same optimistic-concurrency predicate. The
ordinary path writes only the step, the sequence, the status and the timers; a caller
that must also rewrite the instance's pin or payload supplies those here rather than
issuing a second statement.

The patch SHALL NOT override the fields the plan itself writes. A patch that set the
sequence would leave the instance body disagreeing with the promoted sequence column
and with the concurrency predicate, both of which take the plan's value, and the body
is what rehydration reads.

A caller patching the instance's `data` SHALL hold the instance row across its read
and its commit. The concurrency predicate does not protect `data`: a post-commit
action writeback modifies a single field without advancing or checking
`transitionSeq`, so a wholesale `data` patch computed from an earlier read erases such
a writeback silently and the predicate still matches. Row-level locking by the caller
is the only thing that closes this.

#### Scenario: A supplied patch is written with the commit

- **WHEN** a step entry is applied with a field patch
- **THEN** those fields are written in the same statement as the step advance, under
  the same concurrency predicate

#### Scenario: A patch does not weaken the concurrency predicate

- **WHEN** a step entry with a field patch is applied from a stale sequence
- **THEN** it is rejected as a concurrency conflict and none of the patch is written

#### Scenario: A patch colliding with the plan's own fields does not win

- **WHEN** a step entry is applied with a patch naming a field the plan also writes
- **THEN** the plan's value is persisted, and the instance body and the promoted
  sequence column agree

#### Scenario: No patch writes exactly the fields written before

- **WHEN** a step entry is applied with no patch
- **THEN** the instance row's step, sequence, status, timers and scheduling column are
  written, and no other field is touched

### Requirement: The resulting status is derived from the target step

The planning step SHALL derive the instance's resulting `status` from the target step:
`completed` when the target is terminal, otherwise the instance's current status. A
caller MAY override it, and a cancellation does, committing `cancelled` — a status no
step property implies.

Deriving it is what makes it inheritable. As a required parameter it is the one
consequence living at the call sites rather than in the shared path, so it is the one
a new caller can omit without any signal. The result of omitting it is a `running`
instance on a terminal step: terminal steps have no outgoing paths and this path is
the only writer of `completed`, so no transition can ever move or finish it.

#### Scenario: A terminal target completes the instance without the caller saying so

- **WHEN** a step entry to a terminal target is planned with no status supplied
- **THEN** the resulting status is `completed`

#### Scenario: A non-terminal target preserves the instance's status

- **WHEN** a step entry to a non-terminal target is planned with no status supplied
- **THEN** the resulting status is the instance's current status

#### Scenario: A cancellation overrides the derived status

- **WHEN** a cancel commits to the terminal cancel-sink
- **THEN** the resulting status is `cancelled`, not `completed`

### Requirement: The subprocess return relies on terminal entry being unrepeatable

The subprocess return SHALL be enqueued whenever the target step is terminal and the
instance has a parent, with no suppression option.

It needs none, but not because its idempotency key is sequence-free — it is derived
from the instance, the new sequence, and the action id, exactly like the spawn's. It
needs none because entering a terminal step derives `completed` and no path
transitions a non-running instance, so an instance reaches a terminal step at most
once and enqueues at most one return.

That safety is a chain: the status derivation, the terminal-only enqueue, and callers
not committing from a terminal step. A status override breaks the first link — a
cancellation enters a terminal step with a non-`completed` status and therefore does
enqueue a return. Any change to how terminal status is assigned, or any new caller
overriding it, SHALL re-examine this.

#### Scenario: A terminal entry enqueues exactly one return

- **WHEN** an instance with a parent commits onto a terminal step
- **THEN** exactly one return row is enqueued

#### Scenario: A second commit onto a terminal step is unreachable

- **WHEN** an instance has committed onto a terminal step
- **THEN** no further transition commits for it, so no second return is enqueued

### Requirement: A caller may override the timer set, the recorded version, the spawn, and supply events

The planning step SHALL accept four further overrides, each defaulting to current
behaviour:

- a **pre-computed armed timer set**, used in place of arming the target step. The
  scheduling column SHALL still be derived by the planner from the supplied set, so a
  caller cannot leave the two inconsistent.
- the **definition version recorded** on the `HistoryEntry` and on any `timer.unarmed`
  events, defaulting to the instance's version.
- **suppression of the subprocess spawn**, for a commit re-entering the step the
  instance is already parked on.
- **additional events** to append in the commit transaction. A caller supplying its own
  timer set produces no drops of the planner's own but may have computed drops while
  deriving that set; without this channel it could only record them by mutating the
  returned plan.

Spawn suppression is not a convenience. The spawn's idempotency is keyed on the
transition sequence — the child id derives from the parent instance, that sequence, and
the step id, and the handler's guard is a lookup on that id. A commit re-entering the
parked step advances the sequence, derives a **different** child id, misses the guard,
and creates a second child alongside the live one. Idempotency protects the redelivery
of one commit, not two commits onto one step.

Suppression SHALL NOT be inferred from the target equalling the instance's current
step: an authored self-loop is a real re-entry that must spawn. Whether a re-entry is
genuine is the caller's knowledge, so the decision is the caller's.

#### Scenario: A supplied timer set replaces arming

- **WHEN** a step entry is planned with a pre-computed timer set
- **THEN** the target step's timers are not armed, the resulting instance carries
  exactly the supplied set, and the scheduling column reflects its earliest unfired
  fire time

#### Scenario: A supplied version is recorded on both record kinds

- **WHEN** a step entry is planned with a version override and produces an event
- **THEN** the `HistoryEntry` and the event both carry that version

#### Scenario: Supplied events are appended in the commit

- **WHEN** a step entry is planned with additional events and applied
- **THEN** those events are written in the commit transaction, and roll back with it

#### Scenario: A suppressed spawn enqueues nothing

- **WHEN** a step entry to a subprocess target is planned with the spawn suppressed
- **THEN** no spawn row is enqueued

#### Scenario: An unsuppressed re-entry derives a different child id

- **WHEN** a step entry re-enters a subprocess step without suppressing the spawn
- **THEN** a spawn row is enqueued whose parent sequence yields a child id differing
  from the existing child's, which the spawn handler's existence guard does not match

#### Scenario: Defaults reproduce current behaviour exactly

- **WHEN** a step entry is planned with no overrides
- **THEN** the timers are armed from the target step, the recorded version is the
  instance's, the spawn is enqueued for a subprocess target, and only the planner's own
  events are written

### Requirement: A manual transition on a non-running instance is a no-op

`executeManualTransition` SHALL reject a manual transition on an instance
whose `status` is not `running` — including `faulted` — as a no-op: no
`HistoryEntry` is appended, `transitionSeq` does not change, no outbox row is
enqueued, and `resolveAutomatic` is not invoked. This applies regardless of
whether the offered path exists on the instance's current step or its guard
would hold, and matches the no-op convention `cancellation` already uses for
a non-running instance.

#### Scenario: A faulted instance rejects a manual transition
- **WHEN** a manual transition is offered to an instance whose status is `faulted`
- **THEN** no `HistoryEntry` is appended, `transitionSeq` is unchanged, and the instance's `currentStepId` and `status` are unchanged

#### Scenario: A completed or cancelled instance rejects a manual transition
- **WHEN** a manual transition is offered to an instance whose status is `completed` or `cancelled`
- **THEN** no `HistoryEntry` is appended and `transitionSeq` is unchanged

### Requirement: A timer fire on a non-running instance is a no-op

`fireTimer` SHALL reject firing a timer on an instance whose `status` is not
`running` — including `faulted` — as a no-op, for both a transition timer
(`onFire.targetPath`) and a reminder timer (`onFire.actions`, no
`targetPath`): no `HistoryEntry` or `timer.fired` event is appended,
`transitionSeq` does not change, and no outbox row is enqueued.

#### Scenario: A faulted instance ignores a due transition timer
- **WHEN** a transition timer fires for an instance whose status is `faulted`
- **THEN** no `HistoryEntry` is appended, `transitionSeq` is unchanged, and the instance's `currentStepId` is unchanged

#### Scenario: A faulted instance ignores a due reminder timer
- **WHEN** a reminder timer fires for an instance whose status is `faulted`
- **THEN** no `timer.fired` event is appended, no outbox row is enqueued, and the timer's `fired` flag is unchanged

### Requirement: A step entry commits the entered step's principals

Applying a step entry SHALL write the entered step's resolved assignment
candidates into the instance's principal set, per the
`instance-visibility-set` capability. It SHALL do so in one transaction with
the instance row, the history entry, the events and the outbox rows.

The applier is the single write point on purpose. Every step entry reaches it,
whatever drove the transition. One insert therefore covers a participant's
submit, an automatic transition, a timer-forced transition and a migration
relocation alike. A second write point would leave one of those four behind.

A migration commits the assignment the instance already held, rather than
resolving the target step's. Its append therefore adds nobody, and the rule
above needs no exception for it.

The write SHALL be an append that tolerates a principal the set already holds.
An entry re-adding a candidate already present SHALL succeed and change nothing.

The write SHALL NOT change what the applier reports or what its optimistic
concurrency check compares. It adds a relation to the commit and nothing else.

Planning SHALL write no principal, the same way planning writes no instance
row, history entry, event or outbox row.

#### Scenario: An applied entry writes the entered step's candidates

- **WHEN** the applier commits a step entry for a step whose assignment
  resolves to candidates
- **THEN** those candidates are principals of the instance after the commit

#### Scenario: A failed commit writes no principal

- **WHEN** an applied step entry's transaction fails
- **THEN** the transaction leaves no principal row for that entry
- **AND** it leaves no instance row, history entry, event or outbox row either

#### Scenario: Planning performs no principal write

- **WHEN** the planner plans a step entry that never reaches the applier
- **THEN** planning writes no principal row

#### Scenario: Re-entering a step with the same candidates is a no-op for the set

- **WHEN** an instance re-enters a step whose candidates are already principals
- **THEN** the commit succeeds and the set holds what it held before

#### Scenario: A step with no assignment writes no principal

- **WHEN** the applier commits a step entry for a step declaring no assignment
- **THEN** the commit writes no principal, and the set holds what it held before

#### Scenario: The concurrency token advances as before

- **WHEN** the applier commits a step entry
- **THEN** its `transitionSeq` advances exactly as it did before the principal
  write existed
