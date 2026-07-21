# automatic-transitions

## Purpose

Defines how the engine executes a step whose paths are `automatic`: on entry it
evaluates the paths in priority order, takes the first whose guard holds, and
commits that hop through the same transition machinery a manual path uses
(`cause: "automatic"`). Evaluation runs the instance to rest — cascading through
successive automatic steps until it reaches a manual step, an automatic step with
no matching path (a wait-state), or a terminal step. A cascade that re-enters a
step is a non-terminating loop; the instance is parked `faulted` and the loop is
surfaced.

## Requirements

### Requirement: Automatic paths are evaluated on step entry in priority order

When an instance enters a step whose paths are `automatic`, the engine SHALL
evaluate those paths in ascending `priority` order and take the first path whose
guard holds against the frozen instance context. A guardless automatic path (the
highest-priority else-branch) SHALL be taken only when no higher-priority guard
matched. Evaluation SHALL stop at the first match.

#### Scenario: Higher-priority matching guard wins
- **WHEN** an entered all-automatic step has two automatic paths, priority 1 with a guard that holds and priority 2 with a guard that also holds
- **THEN** the engine takes the priority-1 path and does not evaluate the priority-2 path

#### Scenario: First matching guard is taken when an earlier one is false
- **WHEN** the priority-1 guard is false and the priority-2 guard holds
- **THEN** the engine takes the priority-2 path

#### Scenario: Guardless default is the else-branch
- **WHEN** every guarded automatic path on the step evaluates to false and the step carries a guardless default path
- **THEN** the engine takes the guardless default path

### Requirement: An all-automatic step with no matching path is a wait-state

When an instance enters an all-automatic step and no path's guard holds and there
is no guardless default, the engine SHALL NOT transition; the instance SHALL
remain on that step (a wait-state, bounded elsewhere by a timer). This is distinct
from a step that always resolves via its default.

#### Scenario: No guard matches and no default exists
- **WHEN** an entered all-automatic step has only guarded paths and none of their guards hold
- **THEN** the instance stays on that step and its `currentStepId` is unchanged

### Requirement: An automatic transition reuses the transition machinery

Taking an automatic path SHALL execute `onExit(source) → onPath → onEntry(target)`
in that order, commit `{currentStepId, transitionSeq, status}` atomically under
the `transitionSeq` optimistic-concurrency token, dispatch actions post-commit via
the transactional outbox, and append exactly one `HistoryEntry` recording
`cause: "automatic"`.

#### Scenario: Trigger order and single audit entry
- **WHEN** an instance takes an automatic path from source step S to target step T at `transitionSeq` N
- **THEN** S's `onExit`, then the path's triggers, then T's `onEntry` are processed in that order, the persisted `transitionSeq` becomes N+1, and exactly one `HistoryEntry` is appended with `cause: "automatic"`

#### Scenario: An automatic transition does not overwrite instance data
- **WHEN** a value is present in an instance's `data` and the instance then commits an automatic transition
- **THEN** that value is preserved, because the commit writes only `currentStepId`, `transitionSeq`, and `status`

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

### Requirement: A cascade terminates on a repeated step

Within a single advance operation the engine SHALL record each `currentStepId` it
enters. Because guards are pure and instance `data` does not change during the
cascade, re-entering an already-recorded step is a non-terminating loop; the
engine SHALL stop, leave the instance on its last committed step, set its status
to `faulted`, and surface a loop error identifying that step. Hops committed
before detection SHALL remain as appended history.

#### Scenario: A data-independent cycle is stopped and surfaced
- **WHEN** an advance cascade re-enters a step it already entered in the same operation
- **THEN** the engine stops advancing, the instance remains on its last committed step with status `faulted`, prior hops remain in history, and a loop error naming the repeated step is raised

### Requirement: Guards evaluate against the frozen instance context

Automatic-path guards SHALL be evaluated with the same CEL library and formal
context used at authoring time: `data`, `instance`, `actor`, and named
data-source results, with fields referenced by `key`. The `result` namespace
(Action.output only) and the `child` namespace (subprocess steps only) SHALL NOT
be visible to a guard. Because guards are type-checked at publish time, evaluation
SHALL be total and SHALL NOT throw for a definition that passed publish.

#### Scenario: A guard reads instance data by field key
- **WHEN** an automatic path's guard references a catalog field by `key` and that field's value satisfies the condition
- **THEN** the guard evaluates to true and the path is eligible to be taken

#### Scenario: Guard context excludes result and child
- **WHEN** an automatic-path guard is evaluated on a non-subprocess step
- **THEN** neither the `result` namespace nor the `child` namespace is available to the expression
