## Why

Two engine-hang risks from the 2026-08-18 code review are still open. SEC-1 is
the only finding that review rates High. No check walks the subprocess reference
graph. Process A can call B while B calls A, and a published cycle spawns child
instances until storage fills.

SEC-7: a CEL expression has no bound on its cost. A guard with nested
comprehensions over a large list holds its transaction's locks for the whole
evaluation. The owner ranked both first on 2026-09-23 as small and high in
value.

## What Changes

- Publish rejects a body when its own `processId` is reachable from it through
  subprocess edges. Each edge resolves the way publish already resolves a child
  today. The rule rejects direct self-reference (A calls A) and any longer cycle
  that the new version would close.
- The spawn handler refuses to create a child when the parent already sits
  `MAX_SUBPROCESS_DEPTH` (16) levels deep in `parent` links. The refusal is a
  runtime backstop. It fails the spawn action the same way a test instance's
  refused spawn fails today.
- Every checked CEL site gets three structural limits at authoring time. They
  cap AST nodes, cap parse depth, and allow at most two nested comprehensions.
  Publish and the studio's live validation report a violation as a CEL issue.
  Nothing changes at runtime. This change does not add a timer or a configuration.
- `process.start` chaining stays outside the cycle rule on purpose. A chained
  start is fire-and-forget. A loop there is a legitimate pattern, such as a
  yearly renewal that starts next year's instance.
- `docs/decisions.md` closes SEC-1 and SEC-7. `docs/authoring-guide.md` states
  both new rules.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cross-process-validation`: adds the subprocess cycle rule at publish.
- `subprocess-execution`: adds the spawn depth cap.
- `cel-expressions`: adds the structural bound on every checked site.

## Impact

- `src/engine/definitions.ts`: a graph walk beside `validateCrossProcess`.
- `src/engine/subprocess.ts`: a depth count over `parent` links in the spawn
  handler, before child resolution.
- `src/cel/check.ts`: `limits` on the environment `buildEnv` returns, and a
  comprehension-nesting walk in the per-site check.
- Tests under `test/` for each rule, each with a rejected input.
- `docs/authoring-guide.md`, `docs/decisions.md`, `docs/current-state.md`.
- `.claude/rules/process-contract.md` and `.claude/rules/authoring-invariants.md`.
- No change to `src/schema/definition.ts`. No stored-data migration.
