## MODIFIED Requirements

### Requirement: Automatic evaluation advances the instance to rest

After any commit that lands an instance on a step — a manual transition, an
automatic transition, or instance creation on an automatic `initialStep` — the
engine SHALL evaluate automatic paths repeatedly (a cascade of ordinary
per-hop transitions) until the instance sits on a resting step: a manual step, an
all-automatic step with no matching path, or a terminal step. An advance
operation SHALL return only once the instance is at rest.

A migration commit SHALL satisfy this requirement by flagging the instance for
automatic re-resolution rather than by cascading inline, and SHALL be permitted to
return before the instance is at rest.

Migration is a batch operation whose per-instance work runs in its own transaction.
A cascade commits further transitions, so running one inside that transaction would
nest commits and make one instance's cascade a failure boundary for the batch. The
re-resolution flag already exists for this deferral, and the resolution worker runs
each hop under its own optimistic-concurrency check.

The carve-out is about *when* the instance reaches rest, not *whether*. Omitting the
flag entirely would leave an instance migrated onto an all-automatic step whose
guard its post-migration data already satisfies parked indefinitely — no event, no
history entry, no `faulted` status, presenting only as "some instances stopped
moving". `transforms` exist to rewrite exactly the data guards read, so that is the
expected case, not an exotic one.

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
