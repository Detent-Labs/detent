<!-- antislop: allow-file em-dash filler long-words passive-voice run-ons sentence-length trailing-negation -->
<!-- A MODIFIED block copies its live requirement whole, as OpenSpec requires,
     so the live spec text carries these findings. Passive WHEN/THEN phrasing
     matches the convention of every existing spec.md in openspec/specs/. -->
# Spec Delta

## MODIFIED Requirements

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
resulting `status`, the subprocess spawn, the subprocess return, the child a
subprocess step awaits, the enqueue of the supplied actions, the appended
`HistoryEntry`, the armed timer set, and the scheduling column.

The cancellation of the child a commit leaves depends on the step **left**, not on
the step entered. A timer-forced or migration transition enqueues it. A synthesized
cancel commit omits it, because the sweep of running children covers it.

This is scoped to transitions. Instance creation is a separate step-entry path that
does not route through the shared commit and therefore does not inherit these
consequences generically; each one creation needs is reproduced there deliberately.
The subprocess spawn is reproduced: an instance created on a definition whose
`initialStep` is a `subprocess` step SHALL have its spawn enqueued inside the
creation transaction, carried by a `subprocess.spawn-enqueued` event rather than by
a `HistoryEntry` (creation writes none). The same creation SHALL record the child
the step awaits, derived at sequence 0. See the `subprocess-execution` and
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

#### Scenario: A synthesized transition off a subprocess step cancels its child
- **WHEN** a timer-forced or migration transition leaves a subprocess step whose parent awaits a child
- **THEN** the commit clears the awaited child and enqueues the child's cancellation

#### Scenario: A cancel commit enqueues no leaving cancellation
- **WHEN** a cancellation commits the parked parent onto the cancel sink
- **THEN** the commit enqueues no child cancellation row, because the sweep of running children covers it

#### Scenario: Synthesized transition to a terminal step completes on arm
- **WHEN** a synthesized transition commits to a terminal target step
- **THEN** the target step's timers are (dis)armed exactly as for an authored-path transition and `next_timer_at` reflects the target step

### Requirement: A caller may override the timer set, the recorded version, the spawn, and supply events

The planning step SHALL accept four further overrides, each defaulting to current
behaviour:

- a **pre-computed armed timer set**, used in place of arming the target step. The
  scheduling column SHALL still be derived by the planner from the supplied set, so a
  caller cannot leave the two inconsistent.
- the **definition version recorded** on the `HistoryEntry` and on any `timer.unarmed`
  events, defaulting to the instance's version.
- **suppression of the subprocess spawn**, for a commit re-entering the step the
  instance is already parked on. A suppressed spawn onto a subprocess target also
  carries the awaited child over, so the live child stays the one the parent waits
  for. A suppressed spawn onto another step type clears it.
- **additional events** to append in the commit transaction. A caller supplying its own
  timer set produces no drops of the planner's own but may have computed drops while
  deriving that set; without this channel it could only record them by mutating the
  returned plan.

Spawn suppression is not a convenience. The spawn's idempotency is keyed on the
transition sequence — the child id derives from the parent instance, that sequence, and
the step id, and the handler's guard is a lookup on that id. A commit re-entering the
parked step advances the sequence and derives a **different** child id. Unsuppressed,
it would cancel the live child as a left visit and spawn a replacement. A migration
that keeps the parent on its step would then destroy the child's work. Idempotency
protects the redelivery of one commit, not two commits onto one step.

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
- **THEN** no spawn row is enqueued, and the instance keeps its awaited child
  with no cancellation row

#### Scenario: An unsuppressed re-entry cancels the previous visit's child

- **WHEN** a step entry re-enters a subprocess step without suppressing the spawn
- **THEN** the plan records the new visit's child and enqueues the cancellation
  of the previous visit's child

#### Scenario: An unsuppressed re-entry derives a different child id

- **WHEN** a step entry re-enters a subprocess step without suppressing the spawn
- **THEN** a spawn row is enqueued whose parent sequence yields a child id differing
  from the existing child's, which the spawn handler's existence guard does not match

#### Scenario: Defaults reproduce current behaviour exactly

- **WHEN** a step entry is planned with no overrides
- **THEN** the timers are armed from the target step, the recorded version is the
  instance's, the spawn is enqueued for a subprocess target, and only the planner's own
  events are written

### Requirement: The applier writes a caller-supplied field patch

The execution step SHALL accept an optional field patch and write it to the instance
row alongside its own fields, under the same optimistic-concurrency predicate. The
ordinary path writes only the step, its entry time, the sequence, the status, the
timers, the assignment and the awaited child; a caller that must also rewrite the
instance's pin or payload supplies those here rather than issuing a second statement.

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
- **THEN** the instance row's step, entry time, sequence, status, timers, assignment,
  awaited child and scheduling column are written, and no other field is touched
