<!-- antislop: allow-file em-dash passive-voice run-ons sentence-length -->
<!-- A MODIFIED block copies its live requirement whole, as OpenSpec requires,
     so the live spec text carries these findings. Passive WHEN/THEN phrasing
     matches the convention of every existing spec.md in openspec/specs/. -->
# Spec Delta

## MODIFIED Requirements

### Requirement: No body may carry an action type with the engine-reserved prefix

No body reaching the compile pass SHALL contain an action whose `type` starts
with the reserved `core.` prefix, in any of the five action positions
(`onEntry`, `onExit`, `onCancel`, a path's `onPath`, a timer's
`onFire.actions`) — regardless of which compile branch it takes.

The reserved prefix names the engine-internal subprocess spawn, return and
child-cancel handlers. The engine synthesizes them at runtime and never stores
them in a body. An authored `core.*` action would reach that dispatch with author-chosen
config. It could drive an outcome and an `outputMapping` writeback into an
instance of a different process, or cancel an instance of one.

The cancel-sink's reserved **identity** checks (its step id, its step key, and
the reserved `cancelled` outcome) SHALL remain authored-body-only: a compiled
body legitimately contains all three, so generalizing them to every body would
reject every compiled body on sight.

#### Scenario: A reserved action type in an authored body is rejected

- **WHEN** a body declares an action of type `core.returnSubprocess` in any
  action position
- **THEN** publishing fails with a located issue naming the reserved prefix

#### Scenario: The reserved-identity collision path cannot smuggle one through

- **WHEN** a body adds a well-formed terminal step carrying the reserved
  cancel-sink id — so that `publishedProcessBody` accepts it — and also
  declares a `core.*` action
- **THEN** publishing fails; the additive shape that satisfies
  `publishedProcessBody` no longer bypasses the ban

#### Scenario: A compiled body still round-trips

- **WHEN** a legitimately compiled body — containing the engine-injected
  cancel-sink step and, for a contracted process, its reserved outcome — is
  re-published unchanged
- **THEN** it is accepted as the no-op it is today
