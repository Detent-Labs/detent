# Proposal

## Why

A subprocess step should be a wait-state: the parent parks until its child
returns. The engine does not enforce that. Two audit findings (B-1, B-2) break
the hard v1 boundary "Subprocesses are synchronous call-and-return only". A
third (A-5) lets the publish check accept a view flag that can never hold.

Case for B-1: in `examples/subprocess-loan-parent.json`, an author makes path
`rejected` of step `check` guardless, with `priority: 2`. The authoring rules
allow that. When the parent enters `check`, the automatic cascade evaluates
the paths with no `child` in scope. The guard `child.outcome == "approved"`
raises, which counts as false. The guardless path counts as true. The instance
completes on `rejected` before any child exists, so the engine rejects every
loan unchecked.

Case for B-2: step `check` has a timer `PT1H` whose `targetPath` is
`escalate`. The parent entered `check` at sequence 3 and spawned child C3,
which waits on a manual task. The timer forces `escalate`, and C3 keeps
running. If the escalation leads back to `check`, the step spawns C4. When C3
finishes, the return handler sees a parent on `check`. It applies C3's
`outputMapping` while C4 still runs. A migration that relocates the parent
while the spawn is still queued has the same effect.

Case for A-5: a field on a subprocess step has
`visible: child.outcome == 'ok'`. The publish check accepts it. The runtime
evaluates view flags with no `child`, so the field is always hidden.

## What Changes

- **Engine, B-1.** The automatic cascade returns at any step of type
  `subprocess`. Only the return handler leaves it. The return evaluates the
  step's guards after the child returns. A guardless else path becomes
  meaningful, and no new publish rule is necessary.
- **Engine, B-2.** The instance schema gains one optional field,
  `awaitedChild`, outside `ProcessBody`. A step entry onto a subprocess step
  writes the derived child id into it. A commit that leaves the step clears
  it. The return's writeback clears it too. An identity migration carries it.
- **Engine, B-2.** A commit that leaves a subprocess step by any route except
  the return enqueues one engine-internal outbox row,
  `core.cancelSubprocessChild`, in the same transaction. Its handler cancels
  the awaited child through the existing cancel primitive. The child's
  `onCancel` actions run, and nested children cascade.
- **Engine, B-2.** The spawn creates the child only while the parent's
  `awaitedChild` equals the derived child id. The return applies only when the
  parent's `awaitedChild` equals the returning child's id. The spawn's
  post-create backstop also cancels a child whose parent no longer awaits it.
- **Publish check and studio, A-5.** The check evaluates the three view flags
  `visible`, `required` and `readonly` with no `child`, as it already does
  for `validation.rule`. The studio condition builder offers `child` operands
  at path guards only. The three view-override sites lose them.
- **Registry.** The engine-internal `core.*` handlers grow from two to three.
  The reserved prefix already covers the new type.
- **BREAKING.** A guard that held at subprocess entry without reading `child`
  no longer fires at entry. The step waits for the child. Stored definitions
  stay valid. No deployment relies on the old behavior, and no definition
  under `examples/` does.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `subprocess-execution`: the parent parks until the child returns, and it
  records the child it awaits. The spawn creates the child only while the
  parent still awaits it. A return applies only for that child.
- `cancellation`: a commit that leaves a subprocess step cancels the awaited
  child.
- `automatic-transitions`: a subprocess step is a resting step for the
  automatic cascade. A guardless default on it applies after the child returns.
- `transition-execution`: the step-entry seam derives `awaitedChild` and the
  cancel row. Creation records `awaitedChild` for a subprocess initial step.
- `instance-migration`: a relocation off a subprocess step with a queued spawn
  commits, and the late spawn creates nothing. An identity migration carries
  `awaitedChild`.
- `action-registry-validation`: three internal handlers declare config
  schemas, up from two.
- `definition-contract`: the reserved `core.` prefix names three handlers.
- `process-chaining`: the reserved-prefix wording names three handlers.
- `cel-expressions`: the view flags of a subprocess step get no `child`.
- `studio-condition-builder`: only path guards offer the child's contract as
  operands.
- `studio-app`: the field-level condition row withholds `child.*` because no
  `visible` override admits it.

## Impact

- Code: `src/engine/transition.ts` (cascade, `planStepEntry`,
  `applyStepEntry`), `src/engine/subprocess.ts` (spawn gate, backstop, return
  gate and writeback, new handler), `src/engine/store.ts` (`createInstance`),
  `src/engine/registry.ts` (new constant), `src/engine/host.ts` (registration
  check), `src/schema/definition.ts` (instance schema), `src/cel/check.ts`
  (view flags), and `packages/web` (`BooleanOrExpressionInput`,
  `FormEditorScreen`, and the condition-builder tests).
- No change to `ProcessBody`, `Step`, `definitionHash` or any published
  definition. No new publish rule.
- Rules and docs: `.claude/rules/process-contract.md`,
  `.claude/rules/authoring-invariants.md`, `docs/authoring-guide.md`, and
  `docs/decisions.md`. The commit that archives this change deletes its entry
  from the audit index.
- Tests: `test/subprocess.test.ts` (reworked raw-SQL helpers, new cases for
  R1 and R2), `test/migration.test.ts`, `test/transition.test.ts`,
  `test/cel.test.ts`.
- UI: this change removes operands from one picker. It needs a browser check
  on the production build, plus `/impeccable critique` and `/impeccable audit`
  on the changed screen.
