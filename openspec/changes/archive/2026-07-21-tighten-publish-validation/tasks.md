## 1. Shared field-walk helper

- [x] 1.1 In `src/schema/definition.ts`, add and export `collectFieldsDeep(fields: FieldDef[]): FieldDef[]` — a depth-first walk that recurses into `group` fields' `fields` and returns the flat list of every field, top-level and nested.
- [x] 1.2 Update `src/cel/check.ts::dataSchema` to build its `key -> CEL type` map from `collectFieldsDeep` instead of its own inline walk.
- [x] 1.3 Update `src/cel/eval.ts::fieldKeyById` to build its `id -> key` map from `collectFieldsDeep` instead of its own inline walk.
- [x] 1.4 Run `bun test test/cel.test.ts` (with `DATABASE_URL` set) to confirm the relocation is behavior-preserving.

## 2. Step-level invariants (subprocess coupling and wait-state)

- [x] 2.1 In `step`'s `superRefine` (`definition.ts`), reject when `type === "subprocess"` and `subprocess` is undefined, and when `type !== "subprocess"` and `subprocess` is defined.
- [x] 2.2 In the same `superRefine`, reject when `type === "subprocess"` and any path has `trigger: "manual"`.
- [x] 2.3 Remove the unsatisfiable `hasTimerExit` branch and its computation; the non-terminal-step-needs-an-exit check becomes `paths.length === 0`.
- [x] 2.4 Add rejecting-variant tests to `test/validate.test.ts` for: subprocess type with no spec, non-subprocess type with a spec, a subprocess step with a manual path, and a non-terminal step with zero paths (confirming the simplified exit rule still rejects it).

## 3. `createInstance` derives status from the initial step (revised — see design.md Decision 3)

A blanket publish-time rejection of a terminal `initialStep` was implemented
first and reverted: `test/migration.test.ts` "6.2 migration onto a terminal
step yields completed" proved the shape is legitimate (a migration-target
version), so the fix moved to `createInstance` instead. This task group is
no longer part of the `definition-contract` capability; it backs the new
`instance-creation` capability.

- [x] 3.1 In `src/engine/store.ts::createInstance`, derive `status` as `initial?.terminal ? "completed" : "running"` (mirroring `planStepEntry`'s `target.terminal ? "completed" : instance.status`) instead of hardcoding `"running"`.
- [x] 3.2 Add a test to `test/engine.test.ts`: creating an instance from a definition whose `initialStep` is terminal yields `status: "completed"` immediately, and rehydration returns the same status.
- [x] 3.3 Re-run `test/migration.test.ts` to confirm "6.2 migration onto a terminal step yields completed" still passes (it publishes exactly this shape as a migration target).

## 4. Process-level invariants: full-depth id and key uniqueness

- [x] 4.1 In `processBody`'s `superRefine`, using `collectFieldsDeep`, replace the top-level-only field-id uniqueness check with one covering every field in the tree.
- [x] 4.2 Add uniqueness checks (within the same `superRefine`) for: path ids across all steps, action ids across every action position (onEntry/onExit/onCancel/onPath/timer onFire), timer ids across all steps, and data source ids.
- [x] 4.3 Add a field-key uniqueness check over `collectFieldsDeep`'s output.
- [x] 4.4 Add a data-source-key uniqueness check, plus a check rejecting a data source key equal to any of `"data"`, `"instance"`, `"actor"`, `"child"`, `"result"`.
- [x] 4.5 Add one rejecting-variant test per new uniqueness/reserved-name rule to `test/validate.test.ts` (duplicate path id, duplicate action id, duplicate timer id, duplicate data source id, duplicate field id nested in a group colliding with a top-level field, duplicate field id across two different groups, duplicate field key including a nested one, duplicate data source key, data source keyed as a reserved namespace name).

## 5. Process-level invariant: view-ref resolution over the full field tree

- [x] 5.1 Update the view-ref resolution check (`definition.ts:493-495`) to resolve against `collectFieldsDeep`'s output instead of the top-level-only `fieldIds` set.
- [x] 5.2 Add a test confirming a view referencing a field nested inside a `group` now parses successfully.
- [x] 5.3 Confirm the existing "view ref does not resolve" rejection test still rejects a reference to a genuinely unknown field id (at any depth).

## 6. Spec and example verification

- [x] 6.1 Confirm `examples/expense-approval.json` and the other two example bodies still parse and publish unchanged under every new check; adjust `test/validate.test.ts`'s hash pin only if compilation output changes (it should not — these are pure rejection-path additions).
- [x] 6.2 Run the full suite with `DATABASE_URL` set (`bun test`) and confirm the pass/skip counts show no unexpected skips.
- [x] 6.3 Run `bun run typecheck`.
- [x] 6.4 Read back `openspec/specs/definition-contract/spec.md` and `openspec/specs/instance-creation/spec.md` against the final diff and confirm every requirement's scenarios match actual behavior.
