# Design

## Context

See `proposal.md` for the three cases (B-1, B-2, A-5). This section states
only the current mechanics the design must respect.

- Every step entry commits through `planStepEntry` and `applyStepEntry`
  (`src/engine/transition.ts`). Migration calls the same pair. Instance
  creation is the one entry that restates the spawn row itself
  (`createInstance`, `src/engine/store.ts`).
- `applyStepEntry` writes `body || patch::jsonb`. That merge is shallow. A key
  the patch omits keeps its old value, so clearing a key needs an explicit
  `null`. `assignment` already works this way.
- The spawn derives the child id from `(parent, parentSeq, stepId)`. The
  derivation is exact for one commit. It does not survive an identity
  migration, which advances the sequence and keeps the child.
- `resolveAutomatic` loops while the current step is all-automatic and a guard
  matches. Its context has no `child`. Only the return handler builds a
  context with `child`.
- The return handler locks the parent row. Then it compares the parent's step
  with the step in the child's own `parent` link. Two children of one step
  share that link's step id, so the comparison cannot tell them apart.
- `cancelInstance` is the cancel primitive. It runs the step's `onCancel`
  actions and sweeps running children. The sweep selects every running child
  of a parent. It cannot target one child.
- The live-child gate in migration looks for existing children only. A spawn
  that is still queued is invisible to it.

## Goals / Non-Goals

**Goals:**

- A parent on a subprocess step moves only through the return, a timer, a
  cancel or a migration. Each of the last three cancels the awaited child.
- A late spawn and a late return never act for a step visit the parent has
  left.
- Publish and every stored definition stay as they are.
- Engine and studio move together. `main` never offers an operand that publish
  rejects.

**Non-Goals:**

- A faulted parent keeps its running child. After D1 a new subprocess visit
  cannot fault, because the cascade returns on landing. The gap covers only
  an instance that faulted before this change.
- No backfill for an instance parked on a subprocess step before this change.
  The pre-1.0 stage allows that. See Migration Plan.
- No change to the live-child gate. A migration still defers while a child is
  live.
- No change to `resolve_state` marking. A subprocess target keeps its
  `pending` mark, and the worker clears it with a cheap pass.
- No new event kind. A return or spawn that finds the parent moved on stays a
  silent no-op. The existing "moved on" return already works that way.

## Decisions

### D1. The cascade returns at a subprocess step

`resolveAutomatic` returns when the current step has `type === "subprocess"`,
before it selects a path. The return handler already selects the first hop with
`child` in scope and commits it. The cascade it starts afterwards runs from
the step that hop reached.

Rejected: evaluate the paths with an empty `child` and skip a guardless path.
That keeps two evaluation sites. It still misreads a guard such as
`data.skip == true`, which holds without `child`.

Rejected: a publish rule that every path of a subprocess step guards on
`child`. The owner ruled out a new rule. The engine fix covers every body,
including one published before this change.

### D2. `awaitedChild` is one flat optional instance field

The instance schema gains `awaitedChild: instanceId.nullable().optional()`. It
sits outside `ProcessBody`, so `definitionHash` stays the same. It has no
default and no backfill.

`planStepEntry` computes it for the entered step:

- Target is a subprocess step and the spawn is active: the value is
  `subprocessChildId(instanceId, nextSeq, target.id)`, from the same
  `nextSeq` as the spawn row.
- Target is a subprocess step and the caller suppresses the spawn: the value
  carries over from the instance. This is the identity migration.
- Any other target: `null`.

`createInstance` sets it for a subprocess initial step from sequence 0.
`applyStepEntry` writes `awaitedChild: next.awaitedChild ?? null`, the same
shape it uses for `assignment`.

Rejected: derive the id from `transitionSeq` when needed. An identity
migration advances the sequence, so the derived id stops matching the live
child. This is the audit's own point.

Rejected: an object `{ instanceId, stepId }`. The step id repeats
`currentStepId`, and a second copy can drift.

Rejected: a SQL column. Nothing queries it. A body key avoids a schema
migration.

### D3. A leaving commit enqueues a cancel row

`planStepEntry` compares the instance's `awaitedChild` with the one it just
computed. When the instance had a value and the new value differs, the commit
leaves that child. The plan then adds one outbox row:

- type `core.cancelSubprocessChild`, config `{ childId }`;
- action id `action_cancel_awaited_child`, so the idempotency key is unique
  per commit;
- the same transaction as the step entry.

Two cases add no row. A cancel commit (`opts.status === "cancelled"`) leaves
the work to the existing sweep. A return commit has already cleared
`awaitedChild` in its writeback, because the child is terminal.

The handler loads the child. It does nothing when the child is missing, is
`completed` or `faulted`, or names another instance as its parent. For a
`running` or a `cancelled` child it resolves the child's body and calls
`cancelInstance`. That call cancels a running child, runs `onCancel` and
sweeps nested children. On a `cancelled` child it resumes a sweep that an
earlier call left `pending`. Afterwards the handler reads
`cancel_sweep_state` and throws while it stays `pending`, so the outbox
retries. An unresolvable child body throws too. A `ConcurrencyConflict`
propagates. Each retry reloads the child and sees the new state.

The row is durable and at-least-once. A crash between the leaving commit and
the cancel still cancels the child. The action takes the default retry
limit. A row that exhausts it dead-letters, and the operator retries it from
the admin outbox. D3 states that ceiling instead of raising the limit.

Rejected: cancel inline after the commit, as the parent sweep does. The sweep
resumes through `cancel_sweep_state` when someone cancels the parent again. A
timer exit or a migration has no later call to resume it.

Rejected: reuse `sweepCancelledChildren`. It selects every running child of the
parent. After a re-entry that includes the new child.

### D4. The spawn and the return check `awaitedChild`

On the path that creates a child, the spawn handler returns an empty result
unless `parent.awaitedChild` equals the derived child id. The check runs right
after the existing `status` check. It runs before the body resolution, the
test-instance check and the depth check.

The post-create backstop widens. It cancels a running child when the parent is
not running, or when `parent.awaitedChild` differs from the child id. This
closes the window between the gate and the insert.

The return handler, after the status check under the parent lock, returns
without effect unless `parent.awaitedChild` equals the returning child's id.
The existing `currentStepId` comparison stays. The check for a linked step
that is not a subprocess step still needs it. That check is now defense in
depth. The engine writes `awaitedChild` only on a subprocess step. A parent
that awaits this child on another step would need a hand-edited row.

The return's writeback `UPDATE` also sets `awaitedChild` to `null`. The parent
then has no awaited child while it waits out an unmatched outcome. A second
delivery of the same return finds nothing to apply.

Why both checks: a child that the leaving cancel ends reaches the cancel sink.
That enqueues a return with outcome `cancelled`. Without the equality check,
that return would drive a parent that re-entered the same step.

### D5. Migration reuses the leaving rule

A relocation off a subprocess step is a leaving commit like any other. The
shared seam adds the cancel row. A spawn still in the queue finds the parent no
longer awaiting its child. It creates nothing. The cancel finds no child and
does nothing.

The live-child gate still defers a migration with `child-in-flight` while a
child is live. A migration therefore never cancels a running child.

One condition widens. The gate runs today only when the step id changes (`if
(stepChanged)` in `migration.ts`). A plan can keep a step id and flip the step
from `subprocess` to another type. That also leaves the subprocess step. The
gate now runs whenever the source is a subprocess step and the target is not.
The cancel row then never reaches a running child.

An identity migration of a subprocess step still skips the gate.

The gate does not widen to a queued spawn row. A dead-lettered spawn would
then block the parent an operator wants to move.

The reverse flip is out of scope. A plan can keep a step id and turn a task
step into a subprocess step. The migration then suppresses the spawn as an
identity migration. The parent parks with no child. The flaw predates this
change. The run report names it.

An identity migration (spawn suppressed) carries `awaitedChild`. The return of
the existing child then still matches after the sequence advanced.

### D6. A-5 gives the three view flags no `child`

`collect` in `src/cel/check.ts` passes `child: false` for `visible`, `required`
and `readonly`, as it already does for `validation.rule`. The runtime stays as
it is, because `resolveFields` never supplied `child`.

The studio condition builder offers `child` operands from the `stepId` prop of
`ConditionInput`. The view-override sites reach it through
`BooleanOrExpressionInput` and `OverrideField` in `FormEditorScreen`. There
are four sites. A field entry has `visible`, `required` and `readonly`. A note
entry has `visible`. All four drop the `stepId` prop, and so do the strip
components and their callers that only forward it. The path-guard site in
`PathsPanel` keeps it. The field-level row in `FieldCatalogPanel` already
withholds `child.*`.

`/impeccable shape` has nothing to decide, because the change only removes
operands. The browser check and the `critique` and `audit` passes
still run on the changed screen, as the coordinator ruled.

### D7. Specs

- `subprocess-execution` holds the parking, awaiting, spawn gate and return
  gate rules.
- `cancellation` holds the leaving-cancel rule, because it adds a cancel
  trigger.
- `studio-condition-builder` loses a base scenario. A MODIFIED block cannot
  drop one. The old requirement goes through REMOVED, and a successor with a
  new name takes its place. The first requirement of that spec cites the old
  name, so it changes as well. At sync, move the successor to the removed
  requirement's place and run `git grep` for the old name.
- The Purpose paragraph of `automatic-transitions` lists the resting steps. A
  delta cannot reach a Purpose, so the apply phase edits it in the live spec
  (task 8.6).

## Risks / Trade-offs

- **An instance parked before this change drops its return.** It has no
  `awaitedChild`, so the equality check fails. → No deployment exists. A
  development database with a parked parent needs a reseed. The return gate
  carries a `ponytail:` comment naming this ceiling.
- **Every commit writes `"awaitedChild": null` into the body.** → The same
  holds for `assignment`. The instance body has no hash. A test that compares a
  returned plan instance with a stored one by `toEqual` can differ on the null.
  The implementer fixes such a test.
- **Plan tests use an unknown step.** Their instance has a `currentStepId`
  outside the body. → The leaving check keys on `awaitedChild`. It never looks
  up the body.
- **Raw SQL test helpers move a parent without the seam.** `moveTo` and
  `relinkChild` in `test/subprocess.test.ts` never touch `awaitedChild`. →
  Rework each affected test to move through the engine, or to set the field
  with the helper.
- **Direct spawn tests break.** A parent that awaits nothing gets no child. →
  Seed the parent with the derived id.
- **A cancelled child still enqueues a `cancelled` return.** → The equality
  check discards it. The parent sees no `cancelled` outcome from a child it
  left.
- **The cancel handler ends a child that an operator might want.** → The owner
  ruled it. A child belongs to one step visit.
- **One-way door: `awaitedChild` is a scalar.** Only the hard v1 boundaries
  "no fan-out" and "no multi-instance steps" need it undone. A later change
  that lifts them replaces the scalar with a set. Old rows read as a set of
  one. The cancel row type persists in outbox rows and history, so it stays
  readable. No open stage in `ROADMAP.md` touches subprocesses.
- **A cancel row can dead-letter.** → The child keeps running until the
  operator retries the row from the admin outbox.

## Migration Plan

No deployment exists. A development database keeps its schema, because the
field lives inside the instance body. A parent that sat on a subprocess step
before this change needs a reseed or a manual `awaitedChild` write. Rollback is
a revert. An extra `awaitedChild` key in a stored body does no harm to the older
code, which strips it on parse.

## Open Questions

None that change the specs, the approach or the tasks. The owner ruled the
field shape, the cancel mechanism and the migration case on 2026-10-11. The
coordinator ruled the studio scope on the same day.
