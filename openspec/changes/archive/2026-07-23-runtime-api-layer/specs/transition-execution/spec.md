## MODIFIED Requirements

### Requirement: A manual transition executes onExit → onPath → onEntry

Executing a manual path SHALL run triggers in the order `onExit(source)` then
`onPath` then `onEntry(target)`, commit the new `currentStepId`, and do so as one
atomic unit — a failure before commit leaves the instance on its source step with
its prior `transitionSeq`. The commit SHALL write the instance's
`{currentStepId, transitionSeq, status, timers}` and SHALL NOT overwrite instance
`data` unless a caller explicitly supplies it as a field patch, so a post-commit
action writeback into `data` is not clobbered by a subsequent transition.

The engine SHALL expose `commitManualTransition(instance, pathId, body, actor,
db, dataPatch?)`, committing exactly one manual transition (guard check plus
commit) with no automatic-path cascade. `executeManualTransition` SHALL be
`commitManualTransition` followed by `resolveAutomatic`, unchanged in exported
signature and behavior for every caller that supplies no `dataPatch`. Both
functions SHALL accept the same optional `dataPatch` parameter.

When `dataPatch` is supplied, `commitManualTransition` SHALL compute the full
merged data object — `{ ...instance.data, ...dataPatch }`, not `dataPatch`
alone — and SHALL use it consistently in three places: as the data the guard
is evaluated against; as the `instance` passed to the underlying step-entry
plan (so that data-dependent step-entry consequences, such as an armed
deadline timer reading the patched field, and the in-memory `Instance` the
commit returns, both reflect the merged data rather than the pre-patch data);
and as the field patch threaded to the commit so the write lands atomically
with the transition, under the same optimistic-concurrency predicate, in the
same transaction. Passing `dataPatch` alone as the field patch is insufficient
and SHALL NOT be done, since the commit's underlying merge is shallow at the
top level of the persisted body: a field patch carrying only the submitted
keys would replace the instance's entire persisted `data` object rather than
extend it, discarding every previously stored field.

A manual transition that omits `dataPatch` sees unchanged behavior: the
guarantee that it writes no data patch is absolute in that case. The
carve-out exists because the shared commit also serves callers whose entry is
not an authored hop; one that patches `data` carries the row-locking
obligation stated with that requirement.

#### Scenario: Trigger order is onExit, onPath, onEntry
- **WHEN** an instance takes a manual path from source step S to target step T
- **THEN** the source step's `onExit`, then the path's triggers, then the target step's `onEntry` are processed in that order, and the instance's `currentStepId` becomes T

#### Scenario: A path may only be taken when its guard holds
- **WHEN** a manual path carries a guard that evaluates to false against the instance's frozen context
- **THEN** the transition is refused and the instance stays on its source step

#### Scenario: A transition with no data patch does not overwrite instance data
- **WHEN** a value is present in an instance's `data` and the instance then commits a manual transition with no `dataPatch` supplied
- **THEN** that value is preserved, because the transition writes only `currentStepId`, `transitionSeq`, `status` and `timers`

#### Scenario: A guard sees data merged from a supplied patch
- **WHEN** `commitManualTransition` is called with a `dataPatch` and the target path's guard reads a field the patch sets
- **THEN** the guard evaluates against the patch merged over the instance's existing data, not against the existing data alone

#### Scenario: A supplied data patch commits atomically with the transition, preserving unrelated fields
- **WHEN** `commitManualTransition` is called with a `dataPatch` covering only some of the instance's fields, and the guard holds
- **THEN** the patched fields are written, every other previously stored field of `data` remains present, and the step transition commits in the same atomic operation under the same `transitionSeq` predicate

#### Scenario: The returned instance and target-step timer arming both see the merged data
- **WHEN** `commitManualTransition` is called with a `dataPatch` and the target step declares a `deadline` timer that reads a field the patch sets
- **THEN** the timer is armed against the merged data, and the `Instance` `commitManualTransition` returns carries the merged data, not the pre-patch data

#### Scenario: executeManualTransition composes the commit with the cascade
- **WHEN** `executeManualTransition` is called with a `dataPatch` and the guard holds
- **THEN** its result is identical to calling `commitManualTransition` with the same arguments and then `resolveAutomatic` on the result

#### Scenario: Omitting the data patch leaves existing behavior unchanged
- **WHEN** `executeManualTransition` or `commitManualTransition` is called with no `dataPatch` argument
- **THEN** its guard evaluation, commit, and resulting instance are identical to a call made before the parameter existed
