# timers Specification

## Purpose

Defines timers as a first-class property of a step: how they are armed, fired,
disarmed and reconciled, and where the values they depend on are validated.

A timer's `fireAt` is computed once when the step is entered and persisted with the
commit that records the entry, so it survives restart and does not drift — time
enters the engine here and nowhere else (CEL has no `now()`). A timer declares
either a fixed `duration` or a CEL `deadline`, never both. Arming is total: a
deadline that cannot be resolved to an instant omits that timer rather than failing
the step entry, and the omission is recorded as a `timer.unarmed` event. A
`duration`, by contrast, is validated on the **publish** path — grammar and
magnitude both — because `definition.ts` is also the deserializer for stored
immutable bodies, so a tightened read-path refinement would make an
already-published definition unreadable and its pinned instances unrehydratable.

Firing is at-most-once per armed timer, enforced by the same optimistic-concurrency
token transitions use. A timer whose `onFire` names a `targetPath` forces a
transition and bypasses that path's guard; one that names only actions is a reminder
and changes no step. Migration reconciles a carried timer set against the target
step's declarations instead of re-arming from scratch: a surviving timer whose
declaration is unchanged (or whose provenance predates the field) keeps its
original `fireAt`; one whose declaration actually changed is re-armed.

## Requirements
### Requirement: Arm timers on step entry

When an instance enters a step that declares timers, the engine SHALL compute a
`fireAt` timestamp for each armable timer and persist it into `instance.timers[]`
as part of the same commit that records the entry. A `duration` timer's `fireAt`
is the entry instant plus the ISO-8601 duration. A `deadline` timer's `fireAt` is
the instant its CEL expression yields, evaluated at entry (see the deadline
requirements below). The armed set SHALL replace any timers carried from the
previous step.

Each armed `TimerState` SHALL also record its `provenance`: the declared source
it was armed from (`{ kind: "duration", duration }` for a duration timer, or
`{ kind: "deadline", src }` for a deadline timer — the expression's source, not
its evaluated value) and the `armedAt` instant. Provenance is written by the
same arming step that computes `fireAt`; a caller does not derive or supply it
separately. It exists to let migration's reconciliation (below) detect that a
surviving timer id's declaration changed, rather than to be read at arming time.

Where a caller supplies a pre-computed armed set to the shared commit path, that set
SHALL be persisted in place of one computed from the target step, and the scheduling
column SHALL be derived from it. Arming from the target step is the default and the
only behaviour any current caller uses.

The replacement rule is unchanged in substance: the committed set still wholly
replaces what the instance carried. What a supplied set changes is who computes it —
a caller that already knows which timers the instance should carry, and why, rather
than the declaration alone. Without this carve-out the requirement contradicts the
override directly, since a supplied set may deliberately carry a timer forward.

#### Scenario: Duration timer armed at entry
- **WHEN** an instance transitions onto a step carrying a `duration: "P1D"` timer
- **THEN** `instance.timers[]` contains that timer with `fireAt` equal to the
  entry time plus one day, and `fired` unset

#### Scenario: Step without timers arms nothing
- **WHEN** an instance enters a step that declares no timers
- **THEN** `instance.timers[]` is empty after the entry commit

#### Scenario: Duration and deadline timers armed together
- **WHEN** an instance enters a step carrying both a `duration` timer and a
  resolvable `deadline` timer
- **THEN** `instance.timers[]` contains both, and `next_timer_at` is the earlier
  of the two `fireAt` values

#### Scenario: A supplied armed set is persisted instead of a computed one

- **WHEN** a commit supplies a pre-computed armed set
- **THEN** the instance carries exactly that set afterwards, the target step's timers
  are not armed, and the scheduling column reflects the supplied set's earliest
  unfired fire time

#### Scenario: The committed set still replaces what was carried

- **WHEN** a commit supplies an armed set omitting a timer the instance carried
- **THEN** that timer is absent afterwards

#### Scenario: An armed timer records what it was armed from

- **WHEN** an instance enters a step carrying a `duration` timer
- **THEN** the resulting `TimerState.provenance` records `{ kind: "duration",
  duration }` matching the step's declared value, plus the `armedAt` instant

### Requirement: Disarm timers on step exit

When an instance leaves a step, timers armed for that step SHALL no longer be
eligible to fire. A timer that has not fired by the time its step is exited is
discarded, not carried forward.

A migration SHALL be exempt. Where a migrating instance's target step declares a
timer the instance already carries, that timer's armed state SHALL be carried
forward rather than discarded.

The two rules disagree because they answer different questions. Ordinary exit
discards because the instance has left the state the timer bounded — the deadline
belonged to the step it is no longer on. A migration does not leave that state: the
instance is on the same step under a new definition, or on the step the rule
declares to be its counterpart. Discarding there would restart every in-flight
duration timer from the migration instant, so publishing a corrected label would
silently extend every running deadline on that step — a change in business outcome
caused by an editorial change to the definition.

#### Scenario: Unfired timer discarded on exit
- **WHEN** an instance on a step with an unfired timer takes any transition off
  that step before the timer's `fireAt`
- **THEN** the timer never fires and is absent from the instance's armed timers
  on the new step

#### Scenario: A migration carries a surviving timer forward

- **WHEN** a migrating instance's target step declares a timer id the instance
  already carries, armed and unfired
- **THEN** that timer is present in the armed set after migration and is not
  discarded

### Requirement: Migration reconciles timers instead of re-arming them

Migration SHALL NOT arm the target step's timers wholesale. It SHALL reconcile the
instance's carried timers against the target step's declarations, partitioning them
exhaustively:

- carried, unfired, still declared, provenance absent or matching the target's
  current declaration → keep the persisted `fireAt`;
- carried, unfired, still declared, provenance present and **not** matching the
  target's current declaration → re-armed at the migration instant, exactly as a
  newly-declared timer;
- carried, **fired**, still declared → keep as fired: neither re-armed nor dropped,
  regardless of provenance;
- declared but not carried → armed at the migration instant under the ordinary
  arming rules;
- carried but no longer declared → dropped, whether fired or not.

The scheduling column SHALL be recomputed from the resulting set.

The fired case is called out because a three-way reading omits it: a fired timer is
carried *and* still declared, so a rule phrased only as "declared but not in the
armed set is armed" would resurrect it and fire it a second time.

A timer armed at migration SHALL be armed against the **target** body, the
**post-remap** data, and the **new** sequence. A deadline expression evaluated
against the source catalog resolves the wrong fields, and one evaluated over
pre-remap data sees values the migration has moved.

Arming remains total: a fire time that cannot be computed omits the timer and
records `timer.unarmed` rather than failing the migration. Such an event SHALL carry
the committed sequence and the **target** version, because the dropped timer is
declared by the target step and its id resolves only there.

Provenance match is structural equality on the declared source alone (`kind` plus
`duration` or `src`) — the `armedAt` instant is excluded from the comparison, since
re-entering an unchanged timer at a different instant must still count as
unchanged. A carried `TimerState` with no `provenance` (armed before this field
existed) SHALL be treated as matching — reconciliation has no signal to compare
against, so it keeps today's keyed-by-id-only behavior for exactly that timer,
until it is next armed (at which point it gains provenance and is compared on
every subsequent migration).

#### Scenario: A surviving timer keeps its fire time

- **WHEN** an instance with an armed, unfired timer migrates onto a step still
  declaring that timer id with an unchanged declaration
- **THEN** the timer's `fireAt` is unchanged and the scheduling column still
  reflects it

#### Scenario: A fired timer is neither resurrected nor dropped

- **WHEN** the instance carries a timer marked fired that the target step still
  declares
- **THEN** it remains carried and marked fired, and it does not fire again

#### Scenario: A newly declared timer arms at the migration instant

- **WHEN** the target step declares a duration timer the migrating instance does not
  carry
- **THEN** it is armed relative to the migration instant

#### Scenario: A newly armed deadline is evaluated against the target catalog

- **WHEN** the target step declares a deadline timer reading a field the migration
  renamed
- **THEN** the expression is evaluated against the target catalog over the
  post-remap data

#### Scenario: A dropped timer leaves the scheduling column correct

- **WHEN** the migrating instance's earliest timer is one the target step no longer
  declares
- **THEN** it is removed and the scheduling column falls back to the earliest
  remaining unfired timer, or is cleared when none remain

#### Scenario: A timer that cannot be armed at migration does not fail it

- **WHEN** a newly declared deadline timer's expression raises at migration
- **THEN** the migration commits, that timer is absent from the armed set, and a
  `timer.unarmed` event carrying the committed sequence and the target version is
  recorded in the same transaction

#### Scenario: A redeclared duration is detected and re-armed

- **WHEN** an instance carries a `duration` timer armed with provenance
  `{ kind: "duration", duration: "PT1H" }`, and the target step declares the same
  timer id with `duration: "PT2H"`
- **THEN** the timer is re-armed at the migration instant using the target's
  `PT2H` duration, not kept at its original `fireAt`

#### Scenario: A duration-to-deadline flip is detected and re-armed

- **WHEN** an instance carries a timer armed with provenance
  `{ kind: "duration", ... }`, and the target step redeclares the same timer id
  as a `deadline`
- **THEN** the timer is re-armed at the migration instant by evaluating the
  target's deadline expression, not kept at its original `fireAt`

#### Scenario: A fired timer is kept even if its declaration changed

- **WHEN** an instance carries a fired timer whose provenance no longer matches
  the target step's current declaration for that timer id
- **THEN** it remains carried and marked fired, and is not re-armed

#### Scenario: A carried timer with no provenance is trusted and kept

- **WHEN** an instance carries an unfired, still-declared timer with no
  `provenance` on record (armed before this field existed), and the target
  step's declaration for that timer id has changed
- **THEN** the timer keeps its persisted `fireAt` — reconciliation has no
  provenance to compare and does not re-arm it

### Requirement: Fire a transition timer as a guard-bypassing forced transition

A timer whose `onFire` specifies a `targetPath` SHALL, when due, force a
transition along that path regardless of the path's guard. The transition SHALL
run the timer's `onFire.actions` together with the ordinary trigger actions,
record a history entry with `cause: "timer"`, then run the instance to rest via
automatic-path evaluation.

#### Scenario: Timer forces transition despite a false guard
- **WHEN** a due transition timer targets a path whose guard evaluates to false
- **THEN** the instance transitions along that path anyway, and the history entry
  for the transition has `cause: "timer"`

#### Scenario: onFire actions are delivered
- **WHEN** a transition timer with `onFire.actions` fires
- **THEN** those actions are enqueued for at-least-once delivery through the
  outbox alongside the target path's trigger actions

#### Scenario: Instance runs to rest after firing
- **WHEN** a transition timer fires onto an all-automatic step whose guard matches
  an onward path
- **THEN** the instance continues through the automatic cascade and comes to rest
  on a manual, wait, or terminal step

### Requirement: Fire a reminder timer as a side effect only

A timer whose `onFire` specifies `actions` but no `targetPath` SHALL, when due,
enqueue those actions and mark itself fired without transitioning. The instance
remains on the same step.

The fire SHALL additionally be recorded as a `timer.fired` runtime event naming the
timer, in the same commit that marks it fired. Because a reminder does not advance
`transitionSeq`, the timer's `fired` flag is otherwise the only trace it left, and
that flag says a fire happened without saying when or what it delivered.

#### Scenario: Reminder fires without transitioning
- **WHEN** a due reminder timer (actions, no `targetPath`) fires on a step
- **THEN** its actions are enqueued for delivery, the timer is marked `fired`, and
  the instance's `currentStepId` and `transitionSeq` are unchanged

#### Scenario: The fire is recorded as an event
- **WHEN** a due reminder timer fires
- **THEN** a `timer.fired` event naming that timer is recorded in the same commit,
  carrying the `transitionSeq` in force without advancing it

### Requirement: Poll and fire due timers, surviving restart

The engine SHALL run a scheduler that periodically finds instances with an
unfired timer whose `fireAt` is at or before the current time and fires it.
Because `fireAt` is persisted at entry, a scheduler started after a crash SHALL
fire any timer that came due while it was down.

#### Scenario: Due timer fires on the next poll
- **WHEN** the scheduler polls and an armed timer's `fireAt` is in the past
- **THEN** that timer fires on that poll pass

#### Scenario: Overdue timer fires after restart
- **WHEN** a scheduler starts and an instance holds an unfired timer whose
  `fireAt` elapsed while no scheduler was running
- **THEN** the scheduler fires that timer

### Requirement: Fire each timer at most once

A timer SHALL fire at most once even under concurrent schedulers or a re-scan
after a crash. A transition-timer fire is serialized by the instance's
optimistic-concurrency token, and a reminder-timer fire is guarded by the timer's
`fired` flag, so a redundant fire attempt is a no-op rather than a duplicate.

#### Scenario: Concurrent pollers fire once
- **WHEN** two scheduler passes attempt to fire the same due transition timer
  concurrently
- **THEN** exactly one transition commits and the other is rejected by the
  concurrency token with no second transition

#### Scenario: Reminder does not re-fire
- **WHEN** a reminder timer already marked `fired` is seen again by a later poll
- **THEN** its actions are not enqueued a second time

### Requirement: Arm a deadline timer from its expression at step entry

A timer declaring a `deadline` expression SHALL have its `fireAt` computed at step
entry by evaluating that CEL expression against the entry-time context, and
persisted like any other armed timer. The expression is evaluated in the same
guard context the engine builds for path guards — `data` (re-keyed from `fieldId`
to field key), the projected `instance`, and `actor` — with no `result` and no
`child` namespace. The acting identity is the system identity, so arming is
deterministic and identical whether the step is entered as the initial step or via
a transition.

The expression SHALL yield a string denoting an instant, accepted against a strict
ISO-8601 whitelist. A date-only value is interpreted as midnight UTC; a value
carrying an offset is converted to UTC; a datetime with no offset is interpreted as
UTC, never as host-local time; `T` and a space are both accepted as the date/time
separator. A value outside the whitelist SHALL be rejected rather than parsed
leniently, so that no accepted value's meaning depends on the host timezone and no
string denoting something other than a date is read as one.

The persisted `fireAt` SHALL always be a UTC ISO-8601 instant of the fixed form
`YYYY-MM-DDTHH:mm:ss.sssZ`. The year is bounded to four digits: a wider year renders
as an expanded form whose leading sign sorts before every digit, which would make it
win the earliest-timer comparison over every other timer on the step.

Once armed, a deadline timer is indistinguishable from a duration timer: the same
`TimerState`, the same transition-versus-reminder firing semantics, and the same
fire-once guarantee.

#### Scenario: Deadline timer armed from a data field
- **WHEN** an instance whose `data` holds a `due_date` of `2026-08-01T09:00:00Z`
  enters a step carrying a timer with `deadline` reading that field
- **THEN** `instance.timers[]` contains that timer with `fireAt` equal to
  `2026-08-01T09:00:00.000Z` and `fired` unset

#### Scenario: Date-only deadline arms at midnight UTC
- **WHEN** a deadline expression yields the date-only string `2026-08-01`
- **THEN** the armed `fireAt` is `2026-08-01T00:00:00.000Z`

#### Scenario: Offset-bearing deadline is normalized to UTC
- **WHEN** a deadline expression yields `2026-08-01T10:00:00+02:00`
- **THEN** the armed `fireAt` is `2026-08-01T08:00:00.000Z`

#### Scenario: A zoneless value arms the same instant on every host
- **WHEN** a deadline expression yields `2026-08-01 10:00:00` (space-separated, no
  zone) and the same definition and data are armed on hosts in different timezones
- **THEN** every host arms `fireAt` `2026-08-01T10:00:00.000Z`

#### Scenario: A value outside the whitelist is rejected, not parsed leniently
- **WHEN** a deadline expression yields a locale-formatted date (`12/25/2026`), a
  value denoting no date (`5`, `2026`, `Dec 25`), or an expanded-year instant
  (`+275760-09-13T00:00:00Z`)
- **THEN** no timer is armed for it — in particular it does not arm an instant in
  the distant past that the scheduler would fire immediately, nor one whose
  representation would sort ahead of every other timer on the step

#### Scenario: Armed deadline timer forces its transition when due
- **WHEN** an armed deadline timer whose `onFire` specifies a `targetPath` comes
  due and the scheduler fires it
- **THEN** the instance transitions along that path bypassing its guard and the
  history entry records `cause: "timer"`, exactly as for a duration timer

### Requirement: An unresolvable or unparseable deadline is not armed

Arming SHALL be total: it runs inside the transition commit and MUST NOT fail the
transition. If a deadline expression raises at evaluation — most commonly because
it reads a field not yet written into `data` — or yields a value that is not a
parseable instant, that timer SHALL be omitted from the armed set. The entry
commit proceeds and every other timer on the step is armed normally.

The omission SHALL be recorded as a `timer.unarmed` event naming the timer and
distinguishing the reason — an expression that raised, versus a value that was not
an instant — in the same commit that records the entry. An omitted timer is
otherwise indistinguishable from one that was never declared, and on an
all-automatic step whose only bound was that timer the instance waits indefinitely
with nothing recording why.

A deadline is evaluated once, at entry. A later action writeback that changes the
field the expression reads SHALL NOT re-arm or move an already-armed `fireAt`, and
SHALL NOT arm a timer that was omitted at entry.

#### Scenario: Deadline reading an unwritten field is omitted
- **WHEN** an instance enters a step whose deadline expression reads a field that
  holds no value in `data`
- **THEN** the transition commits, and `instance.timers[]` contains no entry for
  that timer

#### Scenario: Non-instant deadline value is omitted
- **WHEN** a deadline expression evaluates successfully but yields a string that
  is not a parseable instant
- **THEN** the transition commits and that timer is not armed

#### Scenario: A later writeback does not re-arm
- **WHEN** a deadline timer was omitted at entry and a post-commit action
  writeback subsequently writes the field its expression reads
- **THEN** the timer remains unarmed and never fires

#### Scenario: The omission is recorded with its reason
- **WHEN** a timer is omitted from the armed set
- **THEN** a `timer.unarmed` event naming it is recorded in the same commit as the
  entry, and its reason distinguishes an expression that raised from a value that
  was not an instant

### Requirement: A deadline already elapsed at entry fires promptly

A deadline whose instant lies at or before the entry time SHALL be armed with that
past `fireAt` rather than clamped, skipped, or fired synchronously during the
commit. The scheduler's existing due-timer poll then fires it on its next pass.

#### Scenario: Past deadline arms and fires on the next poll
- **WHEN** an instance enters a step whose deadline expression yields an instant
  in the past
- **THEN** the timer is armed with that past `fireAt`, the entry commit sets
  `next_timer_at` to it, and the next scheduler pass fires the timer

### Requirement: A duration is validated on the publish path, never on the read path

A `duration` value SHALL be validated against the ISO-8601 grammar the engine
supports — weeks, days, hours, minutes and seconds, no calendar units, at least one
component — when a definition is published. A value outside that grammar is a publish
error, naming the offending field.

This validation MUST NOT run when a stored definition is read back. The contract
module is also the deserializer for published bodies, and published versions are
immutable while instances pin `{processId, version, definitionHash}`. A check that
tightens over time and runs on the read path would make an already-published
definition fail to parse, leaving its pinned instances unrehydratable with no repair
path, and — because the workers resolve a body outside their per-instance error
handling — would starve every other instance in the same pass. Validation that may
tighten belongs on the write path, alongside expression checking and plugin-config
validation.

Enforcing it at publish is also what makes arming total for the duration branch.
Arming computes a duration timer's `fireAt` while entering the **target** step, inside
the transition commit, so an unvalidated duration that raises there does not fail one
instance: it makes the step unreachable for every instance of the definition, and
makes the definition uninstantiable when that step is the initial step. Reached
through the scheduler the same raise is swallowed and retried on every poll
indefinitely.

The grammar applies to every duration-typed field. The magnitude bound below applies
only to `Timer.duration`.

#### Scenario: A malformed duration is rejected at publish

- **WHEN** a timer declares a duration outside the supported grammar — a calendar
  unit (`P1Y`, `P3M`), a non-ISO string (`1 day`), an empty designator (`P`, `PT`), or
  a trailing bare time designator (`P1DT`)
- **THEN** publishing rejects it, naming the offending field

#### Scenario: A supported duration is accepted

- **WHEN** a timer declares `P1W`, `P1D`, `PT1H`, `PT30M`, `PT1.5S`, or a combination
  such as `P1DT2H30M`
- **THEN** publishing accepts it

#### Scenario: A body published before the check still reads

- **WHEN** a stored definition carries a duration the current grammar rejects, having
  been published when no such check existed
- **THEN** reading it back still parses successfully, so its pinned instances keep
  rehydrating, while republishing that same body is rejected

#### Scenario: The grammar reaches every duration-typed field

- **WHEN** a malformed duration appears on an action's `timeout` or `retry.baseDelay`,
  in any action position — step entry, exit, cancel, a path's actions, or a timer's
  fire actions
- **THEN** publishing rejects it, naming that field's location

#### Scenario: A validated duration does not raise at arming

- **WHEN** an instance enters a step whose duration timers all passed validation, from
  any entry instant before the stated ceiling
- **THEN** arming computes a `fireAt` for each without raising, and the entry commits

### Requirement: Every armed fireAt is fixed-width and lexically sortable

An armed `fireAt` SHALL always carry the form `YYYY-MM-DDTHH:mm:ss.sssZ`, whichever
branch produced it. The scheduler selects the earliest timer on a step by lexical
comparison, so a value rendered in the expanded-year form — whose leading sign sorts
before every digit — would be selected as earliest regardless of the instant it
denotes, suppressing every other timer on that step.

A `Timer.duration` SHALL therefore additionally be bounded. Because `fireAt` is
`entryInstant + duration`, and the publish check cannot know the entry instant, the
bound is derived from a fixed, stated ceiling on the entry instant: a duration that
passes cannot produce an out-of-range `fireAt` when armed from any entry before that
ceiling. Bounding by the representable window alone is necessary but NOT sufficient —
a duration well inside that window still overflows when added to a present-day entry.
The ceiling MUST be a constant rather than the validation-time clock, so publishing
the same body twice yields the same verdict.

The bound exists to preserve the representation, not to express a policy about how far
ahead a timer may be scheduled, and so applies only where a `fireAt` is computed:
`retryPolicy.baseDelay` and `action.timeout` carry the grammar but not the bound.

#### Scenario: An out-of-range duration is rejected at publish

- **WHEN** a timer declares a grammar-valid duration that would overflow — one past
  the representable window (`P9999999D`), or one inside that window which still
  overflows from an ordinary present-day entry (`P3000000D`)
- **THEN** publishing rejects it

#### Scenario: The bound does not apply to fields that compute no instant

- **WHEN** an action's `retry.baseDelay` or `timeout` carries a grammar-valid duration
  larger than the timer bound
- **THEN** publishing accepts it

#### Scenario: Both branches produce the same form

- **WHEN** a step carries both a `duration` timer and a `deadline` timer and an
  instance enters it
- **THEN** both armed `fireAt` values match `YYYY-MM-DDTHH:mm:ss.sssZ`, and the
  earliest-timer selection between them reflects true chronological order

### Requirement: The timer scan isolates a poison instance from the batch

Each instance in a scheduler pass SHALL be processed inside its own error boundary, covering the row body
parse and the body resolution as well as `fireTimer`. A parse failure, a resolver miss, or a resolver
that throws SHALL skip that one instance and leave every other due instance in the pass to be processed.
A single poison instance SHALL NOT abort the pass.

The scan is ordered by `next_timer_at`, so an unprocessable instance with the earliest due time would
otherwise sit at the head of every pass and re-throw indefinitely, blocking every instance behind it. A
skipped instance leaves its `next_timer_at` due, so a later pass retries it — consistent with how a lost
firing race is already handled.

#### Scenario: A poison instance at the head of the scan does not block the rest

- **WHEN** a scheduler pass selects a batch containing one instance whose stored body cannot be parsed
  (or whose resolver throws), ordered ahead of instances with due timers
- **THEN** the due timers on the other instances fire in that same pass
