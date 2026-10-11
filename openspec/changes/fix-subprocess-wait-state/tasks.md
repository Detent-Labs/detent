# Tasks

## 1. Instance field, cancel handler and step-entry seam

- [x] 1.1 Add `awaitedChild: instanceId.nullable().optional()` to the instance schema. Verify that `parseInstance` keeps the key.
- [x] 1.2 Add `CANCEL_CHILD_ACTION_TYPE = "core.cancelSubprocessChild"` in `src/engine/registry.ts`. Verify that an authored action of that type fails to publish.
- [x] 1.3 Add the cancel handler and its `configSchema` `{ childId }` to `src/engine/subprocess.ts`, as design D3 states. Register it in `registerSubprocessHandlers`, and check the per-tenant call in `src/engine/host.ts`. Verify that a tenant engine holds three `core.` handlers. Edit the comments at the top of `subprocess.ts` and at the registration function that say two handlers.
- [x] 1.4 Add handler tests for a missing, a terminal, a foreign and a parentless child. Verify that each case leaves the database unchanged. Add a case for `cancellable: false`, which still cancels.
- [x] 1.5 Add retry tests: a concurrent commit and an unresolvable body throw. A `cancelled` child with a running grandchild cancels it. A grandchild whose cancel fails leaves the sweep `pending`, so the handler throws. Verify each outcome.
- [x] 1.6 Edit the `registry-check.ts` comment, and add a cancel-handler case to `test/registry-check.test.ts`. Verify that a forged config fails on shape.
- [x] 1.7 Make `planStepEntry` compute `awaitedChild` for the entered step (design D2). Verify with plan tests for a subprocess target, a suppressed spawn onto a subprocess target, another target, and a self-loop. Add a suppressed spawn onto a non-subprocess target, which expects `null` and one cancel row.
- [x] 1.8 Make `planStepEntry` enqueue one cancel row when the awaited child changes (design D3). Verify with plan tests for a timer exit, a migration exit and a suppressed spawn. Add a cancel commit, and a self-loop that names both child ids.
- [x] 1.9 Write `awaitedChild: next.awaitedChild ?? null` in the `applyStepEntry` patch. Verify with a database test that a leaving commit stores `null` and enqueues the row.
- [x] 1.10 Set `awaitedChild` in `createInstance` for a subprocess initial step, from sequence 0. Verify with a database test that the stored id matches the derived one.
- [x] 1.11 Clear `awaitedChild` in the return's writeback `UPDATE` and in the in-memory `parked` instance. Verify that the first hop plans no cancel row, and that a matched and an unmatched outcome both store `null`.
- [x] 1.12 Edit the doc comments of `planStepEntry`, `StepEntryOpts`, `createInstance` and `applyStepEntry` to state the new consequences. The `applyStepEntry` comments say "four fields". Verify by reading them against the `transition-execution` delta.

## 2. The cascade parks at a subprocess step (B-1)

- [x] 2.1 Make `resolveAutomatic` return at a step of type `subprocess`, before it selects a path. Verify with the R1 test below.
- [x] 2.2 Add the R1 test to `test/subprocess.test.ts`, with a guardless default as the second path. Verify that the parent stays parked, the child exists, and `approved` takes the approved path.
- [x] 2.3 Add a test that an outcome matching no guarded path takes the guardless default. Verify with the `rejected` outcome.
- [x] 2.4 Add tests for a subprocess initial step with a guardless default, and for a guard over parent data alone. Verify that both parents stay parked until the child returns.
- [x] 2.5 Edit the doc comments of `resolveAutomatic` and `selectAutomaticPath`. Verify that they name the subprocess exception.

## 3. Spawn and return check the awaited child (B-2)

- [x] 3.1 Make the spawn return an empty result unless `parent.awaitedChild` equals the derived id (design D4). Verify that the test-instance check and the depth check still run for an awaiting parent.
- [x] 3.2 Widen the post-create backstop to cancel a running child whose parent no longer awaits it. Verify with a test where the parent leaves between the gate and the backstop.
- [x] 3.3 Make the return do nothing unless `parent.awaitedChild` equals the returning child's id. Keep the `currentStepId` check. Verify that C3's late return changes nothing after C4 starts.
- [x] 3.4 Add a `ponytail:` comment at the return gate naming the no-backfill ceiling. Verify with `git grep -n 'ponytail:' -- src`.
- [x] 3.5 Rework the tests that use the raw SQL helpers `moveTo` and `relinkChild`, and the direct `spawnCtx` tests. Set `awaitedChild` with the helper where a scenario needs a parent that awaits. Verify that each keeps its scenario and passes.
- [x] 3.6 Add tests for a queued spawn whose parent left, and for a first-visit spawn after a re-entry. Add a test for a cancel row that arrives before the spawn. Verify that no child exists for the left visit.

## 4. The leaving commit cancels the child (B-2)

- [x] 4.1 Add the R2 test: a timer forces a path while the child waits on a manual task. Verify that the child ends `cancelled`, its `onCancel` action runs, and a grandchild ends `cancelled`.
- [x] 4.2 Add a re-entry test, where the timer path leads back to the same step. Verify that the first child ends `cancelled`, the second child exists, and the first return changes nothing.
- [x] 4.3 Add a test that a parent cancel enqueues no leaving row. Verify that the sweep cancels the running child.

## 5. Migration

- [x] 5.1 Widen the live-child gate in `src/engine/migration.ts` to `stepChanged || targetStep.type !== "subprocess"`. Verify that a kept step id with a new type defers while a child runs.
- [x] 5.2 Add a migration test for a relocation off a subprocess step while its spawn row is pending. Verify the instance migrates, no skip event exists, and the late spawn creates no child. Add a type flip with a settled child, which stores a null `awaitedChild`.
- [x] 5.3 Add a test that a running child still defers the relocation. Verify the `child-in-flight` reason. The test pins the gate against widening to spawn rows.
- [x] 5.4 Add a test that an identity migration keeps `awaitedChild`. Verify that the existing child's return then drives the parent off the step.
- [x] 5.5 Edit the comments in `src/engine/migration.ts` that describe a stale child return. Verify that they match the `instance-migration` delta.

## 6. View flags get no child (A-5, engine side)

- [x] 6.1 Pass `child: false` for `visible`, `required` and `readonly` in `collect` in `src/cel/check.ts`. Edit its comments. Verify that a flag reading `child.outcome` fails to publish.
- [x] 6.2 Add `test/cel.test.ts` cases for all three flags and for a note entry's `visible`. Verify that each fails with an unknown-reference finding.
- [x] 6.3 Edit the `test/cel.test.ts` comment near line 199 that says the flags admit `child`. Verify with `git grep -n "visible/required/readonly" -- test src`.

## 7. Studio condition builder (A-5, web side)

- [x] 7.1 Delete the `stepId` prop from `BooleanOrExpressionInput`, `OverrideField`, `FormEditorStrip`, `NoteEditorStrip` and their callers. Delete the four `stepId=` attributes in `studio-formEditor-strip.test.tsx`. Keep `PathsPanel`.
- [x] 7.2 Run `bun install`, then `bun run typecheck` in the container. Verify that the compiler finds no stale `stepId` at the four flag sites.
- [x] 7.3 Add a web test for a subprocess step. Its view overrides offer no `child` operand, and its path guard still does. Verify that the test fails against the old code.
- [x] 7.4 Edit the comments in `ConditionInput.tsx` and `conditionLogic.ts` that describe the view-override sites. Verify by reading them against the delta spec.

## 8. Rules, guide and index

- [x] 8.1 Edit `.claude/rules/process-contract.md`: the Paths wait-state sentence, the Subprocesses paragraph (three handlers, `awaitedChild`), and the Runtime record note. Verify with `git grep -n "two internal" -- .claude docs`.
- [x] 8.2 Edit `.claude/rules/authoring-invariants.md` beside the subprocess wait-state rule. State that the cascade never evaluates the paths on entry and a guardless default stays allowed.
- [x] 8.3 Edit the Contract section and the Path section of `docs/authoring-guide.md`. The Path section says an automatic path fires by itself. Cover the paths running after the return, the else branch, the timer and migration cancel, and the view flags. Verify against the delta specs.
- [x] 8.4 Sweep `examples/` and `scripts/seed.ts`. The only subprocess step is `step_l_check`, and both its paths have guards. Verify that the examples still publish.
- [x] 8.5 Delete the `fix-subprocess-wait-state` entry from the audit index in `docs/decisions.md`. Verify with `git grep -n "fix-subprocess-wait-state" -- docs/decisions.md`.
- [x] 8.6 Edit the Purpose paragraph of `openspec/specs/automatic-transitions/spec.md` so its list of resting steps names the subprocess step. Verify by reading it against the delta.
- [x] 8.7 Edit `README.md` line 61 so the subprocess summary names the cancel handler. Verify with `git grep -n "downward cancel cascade" -- README.md`.

## 9. Verification

- [ ] 9.1 Run `bun run typecheck`, then `bun run build`, inside the devcontainer. Record the printed result in the run report.
- [ ] 9.2 Run `sh scripts/test-gated.sh bun test` in the container with `OPENSPEC_TELEMETRY=0`. The container sets `DATABASE_URL`. Record the pass, fail and skip counts.
- [ ] 9.3 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host. Record the printed result.
- [ ] 9.4 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` on the host. Record the printed result.
- [ ] 9.5 Browser check on the production build: open a draft with a subprocess step in the form editor. Verify that the view-override picker lists no `child` operand and the path guard picker does.
- [ ] 9.6 Run `/impeccable critique` and `/impeccable audit` on the form editor route. Record the findings. Fix the findings that the diff caused.
