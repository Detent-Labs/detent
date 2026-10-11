# Tasks

## 1. Instance field and step-entry seam

- [ ] 1.1 Add `awaitedChild: instanceId.nullable().optional()` to the instance schema. Verify that `parseInstance` keeps the key.
- [ ] 1.2 Add `CANCEL_CHILD_ACTION_TYPE = "core.cancelSubprocessChild"` in `src/engine/registry.ts`. Verify that an authored action of that type fails to publish.
- [ ] 1.3 Make `planStepEntry` compute `awaitedChild` for the entered step (design D2). Verify with plan tests for a subprocess target, a suppressed spawn, another target, and a self-loop.
- [ ] 1.4 Make `planStepEntry` enqueue one cancel row when the awaited child changes (design D3). Verify with plan tests for a timer exit, a migration exit, a suppressed spawn, and a cancel commit.
- [ ] 1.5 Write `awaitedChild: next.awaitedChild ?? null` in the `applyStepEntry` patch. Verify with a database test that a leaving commit stores `null` and enqueues the row.
- [ ] 1.6 Set `awaitedChild` in `createInstance` for a subprocess initial step, from sequence 0. Verify with a database test that the stored id matches the derived one.
- [ ] 1.7 Edit the doc comments of `planStepEntry`, `StepEntryOpts` and `createInstance` to state the new consequences. Verify by reading them against the `transition-execution` delta.

## 2. The cascade parks at a subprocess step (B-1)

- [ ] 2.1 Make `resolveAutomatic` return at a step of type `subprocess`, before it selects a path. Verify with the R1 test below.
- [ ] 2.2 Add the R1 test to `test/subprocess.test.ts`, with a guardless default as the second path. Verify that the parent stays parked, the child exists, and `approved` takes the approved path.
- [ ] 2.3 Add a test that an outcome matching no guarded path takes the guardless default. Verify with the `rejected` outcome.
- [ ] 2.4 Add tests for a subprocess initial step with a guardless default, and for a guard over parent data alone. Verify that both parents stay parked until the child returns.
- [ ] 2.5 Edit the doc comments of `resolveAutomatic` and `selectAutomaticPath`. Verify that they name the subprocess exception.

## 3. Spawn and return check the awaited child (B-2)

- [ ] 3.1 Make the spawn return an empty result unless `parent.awaitedChild` equals the derived id (design D4). Verify that the test-instance check and the depth check still run for an awaiting parent.
- [ ] 3.2 Widen the post-create backstop to cancel a running child whose parent no longer awaits it. Verify with a test where the parent leaves between the gate and the backstop.
- [ ] 3.3 Make the return do nothing unless `parent.awaitedChild` equals the returning child's id. Keep the `currentStepId` check. Verify that C3's late return changes nothing after C4 starts.
- [ ] 3.4 Clear `awaitedChild` in the return's writeback `UPDATE` and in the in-memory `parked` instance. Verify that the first hop plans no cancel row.
- [ ] 3.5 Add a `ponytail:` comment at the return gate naming the no-backfill ceiling. Verify with `git grep -n 'ponytail:' -- src`.
- [ ] 3.6 Rework the tests that use the raw SQL helpers `moveTo` and `relinkChild`, and the direct `spawnCtx` tests. Verify that each keeps its scenario and passes.
- [ ] 3.7 Add tests for a queued spawn whose parent left, and for a first-visit spawn after a re-entry. Verify that no child exists for the left visit.

## 4. The leaving commit cancels the child (B-2)

- [ ] 4.1 Add the `core.cancelSubprocessChild` handler and its `configSchema` `{ childId }` to `src/engine/subprocess.ts`. Follow design D3.
- [ ] 4.2 Register the handler in `registerSubprocessHandlers`, and check the per-tenant copy in `src/engine/host.ts`. Verify that a tenant engine holds three `core.` handlers.
- [ ] 4.3 Add the R2 test: a timer forces a path while the child waits on a manual task. Verify that the child ends `cancelled`, its `onCancel` action runs, and a grandchild ends `cancelled`.
- [ ] 4.4 Add a re-entry test, where the timer path leads back to the same step. Verify that the first child ends `cancelled`, the second child exists, and the first return changes nothing.
- [ ] 4.5 Add handler tests for a missing child, a terminal child, a foreign child, and a concurrent commit. Verify that only the concurrent commit throws.
- [ ] 4.6 Edit the `registry-check.ts` comment, and add a cancel-handler case to `test/registry-check.test.ts`. Verify that a forged config fails on shape.

## 5. Migration

- [ ] 5.1 Add a migration test for a relocation off a subprocess step while its spawn row is pending. Verify the instance migrates, no skip event exists, and the late spawn creates no child.
- [ ] 5.2 Add a test that a running child still defers the relocation. Verify the `child-in-flight` reason. The test pins the gate against widening.
- [ ] 5.3 Add a test that an identity migration keeps `awaitedChild`. Verify that the existing child's return then drives the parent off the step.
- [ ] 5.4 Edit the comments in `src/engine/migration.ts` that describe a stale child return. Verify that they match the `instance-migration` delta.

## 6. View flags get no child (A-5, engine side)

- [ ] 6.1 Pass `child: false` for `visible`, `required` and `readonly` in `collect` in `src/cel/check.ts`. Edit its comments. Verify that a flag reading `child.outcome` fails to publish.
- [ ] 6.2 Add `test/cel.test.ts` cases for all three flags and for a note entry's `visible`. Verify that each fails with an unknown-reference finding.
- [ ] 6.3 Edit the `test/cel.test.ts` comment near line 199 that says the flags admit `child`. Verify with `git grep -n "visible/required/readonly" -- test src`.

## 7. Studio condition builder (A-5, web side)

- [ ] 7.1 Drop the `stepId` prop at the three view-override sites in `BooleanOrExpressionInput` and `FormEditorScreen`. Keep `PathsPanel`. Run `bun install`, then `bun run typecheck` in the container.
- [ ] 7.2 Add a web test for a subprocess step. Its view override offers no `child` operand, and its path guard still does. Verify that the test fails against the old code.
- [ ] 7.3 Edit the comments in `ConditionInput.tsx` and `conditionLogic.ts` that describe the view-override sites. Verify by reading them against the delta spec.

## 8. Rules, guide and index

- [ ] 8.1 Edit `.claude/rules/process-contract.md`: the Paths wait-state sentence, the Subprocesses paragraph (three handlers, `awaitedChild`), and the Runtime record note. Verify with `git grep -n "two internal" -- .claude docs`.
- [ ] 8.2 Edit `.claude/rules/authoring-invariants.md` beside the subprocess wait-state rule. State that the cascade never evaluates the paths on entry and a guardless default stays allowed.
- [ ] 8.3 Edit the Contract section of `docs/authoring-guide.md`. Cover the paths running after the return, the else branch, the timer and migration cancel, and the view flags. Verify against the delta specs.
- [ ] 8.4 Sweep `examples/` and `scripts/seed.ts`. The only subprocess step is `step_l_check`, and both its paths have guards. Verify that the examples still publish.
- [ ] 8.5 Delete the `fix-subprocess-wait-state` entry from the audit index in `docs/decisions.md`. Verify with `git grep -n "fix-subprocess-wait-state" -- docs/decisions.md`.

## 9. Verification

- [ ] 9.1 Run `bun run typecheck`, then `bun run build`, inside the devcontainer. Record the printed result in the run report.
- [ ] 9.2 Run `sh scripts/test-gated.sh bun test` in the container with `OPENSPEC_TELEMETRY=0`. The container sets `DATABASE_URL`. Record the pass, fail and skip counts.
- [ ] 9.3 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host. Record the printed result.
- [ ] 9.4 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` on the host. Record the printed result.
- [ ] 9.5 Browser check on the production build: open a draft with a subprocess step in the form editor. Verify that the view-override picker lists no `child` operand and the path guard picker does.
- [ ] 9.6 Run `/impeccable critique` and `/impeccable audit` on the form editor route. Record the findings. Fix the findings that the diff caused.
