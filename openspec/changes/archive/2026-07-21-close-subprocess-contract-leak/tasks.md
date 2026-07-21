## 1. CEL check: parameterize child.data typing

- [x] 1.1 In `src/cel/check.ts`, add `contractFieldSchema(fields: FieldDef[], ids: readonly string[] | undefined): Record<string, string>` — a filtered sibling of `dataSchema` that resolves each id in `ids` (via `collectFieldsDeep`) to its `key`/`celType`, skipping ids not found; empty/undefined `ids` yields `{}`.
- [x] 1.2 Add an optional `childDataSchema?: Record<string, string>` parameter to `buildEnv`'s options; when present, register `child` as `{ outcome: "string", data: childDataSchema }` instead of the fixed `CHILD_SCHEMA`. Omitted (every existing call site) reproduces current behavior exactly.
- [x] 1.3 Add `export function checkSubprocessChildRefs(body: ProcessBody, stepIndex: number, childBody: ProcessBody): CelIssue[]` — internally builds the child schema via `contractFieldSchema(childBody.fields, childBody.contract?.outputFields)`, then builds one environment scoped to `body.workflow.steps[stepIndex]` only (`data`/`instance`/`actor` from `body`, `child` typed with that schema) and checks that step's `outputMapping` values and automatic-path guards (the same two site kinds `collect()` tags `child: true` for), returning located `CelIssue[]` with the same `loc` format `collect()` uses (`steps[i].paths[j].guard`, `steps[i].subprocess.outputMapping.<fid>`).

## 2. Wire into cross-process publish validation

- [x] 2.1 In `src/engine/definitions.ts::validateCrossProcess`, after the existing `inputMapping` check for a step, when the resolved `child.contract` exists: call `checkSubprocessChildRefs(body, stepIndex, child)` (the already-resolved child body), accumulating any returned issues.
- [x] 2.2 After the loop over all subprocess steps, if any issues were accumulated, throw `CelValidationError(issues)` (imported from `../cel/check.js`) — not `CrossProcessValidationError`.
- [x] 2.3 Switch the loop to iterate with an index (`body.workflow.steps.entries()` or equivalent) since `checkSubprocessChildRefs` needs `stepIndex`.

## 3. Tests

- [x] 3.1 `test/cel.test.ts`: unit-test `checkSubprocessChildRefs` directly — a `child.data.<key>` reference inside the allowed schema passes; one outside it is rejected naming the expression; `child.outcome` always passes regardless of schema; confirm `validateProcessBody`'s existing single-body behavior (`child.data: dyn`, any reference accepted) is unchanged when no `childDataSchema` is supplied.
- [x] 3.2 `test/cross-process.test.ts`: extend the existing child/parent fixtures with a child field *not* listed in `contract.outputFields`; assert that a parent whose `outputMapping` or guard references it is rejected via `CelValidationError` (not `CrossProcessValidationError`), and that no parent version is persisted. Assert the existing example-derived shape (mapping/guard confined to declared outputs) still publishes.
- [x] 3.3 Confirm `examples/subprocess-loan-parent.json` / `subprocess-credit-check-child.json` still publish cleanly under the tightened check (they already confine `child.data` references to `contract.outputFields`) — add or extend a test asserting this if not already covered.

## 4. Docs

- [x] 4.1 `CLAUDE.md` roadmap item 1: replace the "Deferred: checking that `outputMapping` expressions read only child field keys / `contract.outputFields`" bullet with a short recorded fact pointing at `checkSubprocessChildRefs` / `cross-process-validation`.
- [x] 4.2 `CLAUDE.md` "Decided, not yet built": remove the stale "Move `resolveBody` inside the per-instance try in the workers" entry (verified already shipped in `src/engine/timers.ts` / `resolution.ts` via `isolate-worker-poison-rows`).
- [x] 4.3 `CLAUDE.md` subprocess-execution notes: note that `child.data`'s CEL surface (not the runtime value) is now confined to `contract.outputFields`, per the Non-Goals in this change's design.md.

## 5. Verification

- [x] 5.1 `bun run typecheck` clean.
- [x] 5.2 Full `bun test` with `DATABASE_URL` set; confirm pass/fail/skip counts (skip count unchanged from before this change, i.e. no suite silently skipped). Result: 413 pass, 0 fail, 0 skip, 1343 expect() calls across 18 files.
