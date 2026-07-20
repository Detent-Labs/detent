## MODIFIED Requirements

### Requirement: Arm timers on step entry

When an instance enters a step that declares timers, the engine SHALL compute a
`fireAt` timestamp for each armable timer and persist it into `instance.timers[]`
as part of the same commit that records the entry. A `duration` timer's `fireAt`
is the entry instant plus the ISO-8601 duration. A `deadline` timer's `fireAt` is
the instant its CEL expression yields, evaluated at entry (see the deadline
requirements below). The armed set SHALL replace any timers carried from the
previous step.

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

## ADDED Requirements

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

### Requirement: A deadline already elapsed at entry fires promptly

A deadline whose instant lies at or before the entry time SHALL be armed with that
past `fireAt` rather than clamped, skipped, or fired synchronously during the
commit. The scheduler's existing due-timer poll then fires it on its next pass.

#### Scenario: Past deadline arms and fires on the next poll
- **WHEN** an instance enters a step whose deadline expression yields an instant
  in the past
- **THEN** the timer is armed with that past `fireAt`, the entry commit sets
  `next_timer_at` to it, and the next scheduler pass fires the timer
