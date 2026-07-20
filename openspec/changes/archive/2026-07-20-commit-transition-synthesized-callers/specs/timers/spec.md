## MODIFIED Requirements

### Requirement: Arm timers on step entry

When an instance enters a step that declares timers, the engine SHALL compute a
`fireAt` timestamp for each armable timer and persist it into `instance.timers[]`
as part of the same commit that records the entry. A `duration` timer's `fireAt`
is the entry instant plus the ISO-8601 duration. A `deadline` timer's `fireAt` is
the instant its CEL expression yields, evaluated at entry (see the deadline
requirements below). The armed set SHALL replace any timers carried from the
previous step.

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

#### Scenario: A supplied armed set is persisted instead of a computed one

- **WHEN** a commit supplies a pre-computed armed set
- **THEN** the instance carries exactly that set afterwards, the target step's timers
  are not armed, and the scheduling column reflects the supplied set's earliest
  unfired fire time

#### Scenario: The committed set still replaces what was carried

- **WHEN** a commit supplies an armed set omitting a timer the instance carried
- **THEN** that timer is absent afterwards
