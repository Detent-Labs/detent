## MODIFIED Requirements

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
