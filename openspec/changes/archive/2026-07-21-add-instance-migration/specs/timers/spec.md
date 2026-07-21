## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Migration reconciles timers instead of re-arming them

Migration SHALL NOT arm the target step's timers wholesale. It SHALL reconcile the
instance's carried timers against the target step's declarations, partitioning them
exhaustively:

- carried, unfired, still declared → keep the persisted `fireAt`;
- carried, **fired**, still declared → keep as fired: neither re-armed nor dropped;
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

Reconciliation keys on timer id alone. `TimerState` carries no provenance — no
declared duration, no deadline source, no arming instant — so a target step that
redeclares a surviving id with a different duration, or flips it between `duration`
and `deadline`, is indistinguishable from one that left it unchanged, and the old
fire time is kept. This is a limitation of the record shape, not a judgement about
what is desirable; closing it requires a provenance field on `TimerState`.

#### Scenario: A surviving timer keeps its fire time

- **WHEN** an instance with an armed, unfired timer migrates onto a step still
  declaring that timer id
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
