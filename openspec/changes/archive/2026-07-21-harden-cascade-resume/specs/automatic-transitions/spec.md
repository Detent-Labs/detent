## MODIFIED Requirements

### Requirement: Automatic evaluation advances the instance to rest

After any commit that lands an instance on a step — a manual transition, an
automatic transition, or instance creation on an automatic `initialStep` — the
engine SHALL evaluate automatic paths repeatedly (a cascade of ordinary
per-hop transitions) until the instance sits on a resting step: a manual step, an
all-automatic step with no matching path, or a terminal step. An advance
operation SHALL return only once the instance is at rest.

Every commit that leaves the instance `running` SHALL durably mark it for
automatic re-resolution, in the same transaction as the commit itself,
regardless of whether the cascade is then also driven inline and regardless of
whether the step it lands on is itself cascade-eligible (a manual or
wait-state target is marked exactly as an automatic one is). This includes a
manual transition's commit, each automatic hop's commit, instance creation
(top-level or a subprocess child), and a subprocess return's commit of the
parent's first hop off its wait-state. A commit whose resulting status is not
`running` (a terminal step, or a `cancelled` override) is not marked by this
requirement — such an instance runs no further automatic evaluation, so there
is nothing for a mark to recover. So that a caller crashing at any point
between a commit and the completion of its own inline cascade leaves the
instance durably recoverable rather than resting on an intermediate step with
nothing to re-drive it.

A migration commit SHALL satisfy this requirement the same way every other
commit now does: by durably marking the instance rather than by cascading
inline, and SHALL be permitted to return before the instance is at rest. This
is no longer a carve-out specific to migration — it is the general mechanism
migration was the first caller of.

Migration is a batch operation whose per-instance work runs in its own transaction.
A cascade commits further transitions, so running one inside that transaction would
nest commits and make one instance's cascade a failure boundary for the batch. The
re-resolution flag already exists for this deferral, and the resolution worker runs
each hop under its own optimistic-concurrency check.

Marking every commit, not only migration's, closes the same failure shape for
every other cascade entry point: a process crashing between one hop's commit
and the next — whether inside `resolveAutomatic`'s own loop, between instance
creation and its first cascade attempt, or between a subprocess return's
parent commit and the remainder of the parent's cascade — otherwise leaves an
instance parked on an intermediate all-automatic step whose guard would in
fact match, with no event, no history entry, and no `faulted` status: it
simply stops moving.

#### Scenario: A manual transition into an automatic step cascades to rest
- **WHEN** a manual transition lands the instance on an all-automatic step whose guard routes to a terminal step
- **THEN** the advance operation returns with the instance on the terminal step, having committed each hop as its own transition

#### Scenario: Creation on an automatic initial step advances immediately
- **WHEN** an instance is created whose `initialStep` is all-automatic with a matching path
- **THEN** the engine advances it past that step before returning it at rest

#### Scenario: A migrated instance whose guard now matches is advanced

- **WHEN** an instance is migrated onto an all-automatic step whose guard its
  post-migration data satisfies
- **THEN** the migration commit flags it for re-resolution, and the worker advances
  it off that step to rest

#### Scenario: A migrated instance at a genuine wait-state stays put

- **WHEN** an instance is migrated onto an all-automatic step where no guard matches
- **THEN** re-resolution runs, no path is taken, and the instance rests there

#### Scenario: A migration returns before the cascade has run

- **WHEN** a migration commits an instance onto a step from which automatic paths
  will advance it
- **THEN** the migration operation returns without waiting for the cascade, and the
  instance is nonetheless flagged so the cascade happens

#### Scenario: A crashed cascade is durably resumed after a manual transition

- **WHEN** a manual transition commits onto an all-automatic step whose guard
  would advance it further, and the process ends before the in-process cascade
  runs another hop
- **THEN** the instance is left marked for re-resolution, and the re-resolution
  worker completes the cascade to rest on a later pass

#### Scenario: A crashed cascade is durably resumed after instance creation

- **WHEN** an instance is created on an automatic `initialStep` whose guard
  would advance it further, and the process ends before the in-process cascade
  runs
- **THEN** the created instance is left marked for re-resolution, and the
  re-resolution worker completes the cascade to rest on a later pass

#### Scenario: A crashed subprocess return cascade is durably resumed

- **WHEN** a subprocess return commits the parent's first hop off its
  subprocess step onto another all-automatic step whose guard would advance it
  further, and the process ends before the remaining cascade runs
- **THEN** the parent is left marked for re-resolution, and the re-resolution
  worker completes the cascade to rest on a later pass

#### Scenario: A resumed cascade that finds nothing to do is a no-op

- **WHEN** the re-resolution worker picks up an instance marked by an ordinary
  (non-migration) commit whose in-process cascade already completed before the
  worker's pass
- **THEN** the worker's re-evaluation is a no-op and the instance's state is
  unchanged
