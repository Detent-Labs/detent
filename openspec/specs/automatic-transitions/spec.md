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

### Requirement: A cascade terminates on a repeated step

Within a single advance operation the engine SHALL record each `currentStepId` it
enters. Because guards are pure and instance `data` does not change during the
cascade, re-entering an already-recorded step is a non-terminating loop; the
engine SHALL stop, leave the instance on its last committed step, set its status
to `faulted`, and surface a loop error identifying that step. Hops committed
before detection SHALL remain as appended history.

The park SHALL additionally append an `instance.faulted` `InstanceEvent` naming
the repeated step and the reason for the park. The park is not a transition — no
step change — so it SHALL NOT append a `HistoryEntry` and SHALL NOT advance
`transitionSeq`; the event records the sequence the instance rests at. The park
enqueues no actions, so the event SHALL NOT carry `ActionOutcome`s.

The status flip and its event SHALL be written in one transaction, so a
`faulted` instance cannot exist without the record of why it was parked. The
flip is guarded on the instance's `transitionSeq`; if that guard matches no row
because the instance moved concurrently, neither the flip nor the event SHALL be
written.

#### Scenario: A data-independent cycle is stopped and surfaced
- **WHEN** an advance cascade re-enters a step it already entered in the same operation
- **THEN** the engine stops advancing, the instance remains on its last committed step with status `faulted`, prior hops remain in history, and a loop error naming the repeated step is raised

#### Scenario: The park is recorded as an event
- **WHEN** an advance cascade is stopped by re-entering a step and the instance is parked `faulted`
- **THEN** an `instance.faulted` `InstanceEvent` is appended for that instance, carrying the repeated step's id and the reason `automatic-cascade-loop`

#### Scenario: The park event does not advance the sequence
- **WHEN** an instance resting at `transitionSeq` N is parked `faulted` by a cascade loop
- **THEN** the appended event carries N, the instance's persisted `transitionSeq` is still N, and no `HistoryEntry` is appended for the park

#### Scenario: The park event carries no action outcomes
- **WHEN** an `instance.faulted` event is appended
- **THEN** it carries no `ActionOutcome`s, because parking enqueues no actions

#### Scenario: A lost concurrency race writes neither the flip nor the event
- **WHEN** a cascade loop is detected but the instance has concurrently moved past the `transitionSeq` the cascade left it at
- **THEN** the status is not flipped to `faulted` and no `instance.faulted` event is appended

### Requirement: Guards evaluate against the frozen instance context

Automatic-path guards SHALL be evaluated with the same CEL library and formal
context used at authoring time: `data`, `instance`, and `actor`, with fields
referenced by `key`. The `result` namespace (Action.output only) and the `child`
namespace (subprocess steps only) SHALL NOT be visible to a guard, and a data
source is not a readable namespace (the engine resolves none, so a CEL reference to
one is a publish error). Because guards are type-checked at publish time, evaluation
SHALL be total and SHALL NOT throw for a definition that passed publish.

#### Scenario: A guard reads instance data by field key
- **WHEN** an automatic path's guard references a catalog field by `key` and that field's value satisfies the condition
- **THEN** the guard evaluates to true and the path is eligible to be taken

#### Scenario: Guard context excludes result and child
- **WHEN** an automatic-path guard is evaluated on a non-subprocess step
- **THEN** neither the `result` namespace nor the `child` namespace is available to the expression

#### Scenario: Guard context excludes data sources
- **WHEN** an automatic-path guard references a declared data-source result
- **THEN** the reference is not a readable namespace; such a guard cannot have passed publish (it is a publish error), so no published definition reaches evaluation with one

