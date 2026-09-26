# Tasks

## 1. Subprocess cycle check at publish

- [x] 1.1 Write failing tests in `test/cross-process.test.ts` for the five scenarios of the `cross-process-validation` delta. They cover self-reference, the two-process cycle across publishes, the pinned earlier version, the acyclic chain and the `process.start` loop. Confirm the three rejection tests fail before 1.2.
- [x] 1.2 Add `validateSubprocessCycle` to `src/engine/definitions.ts` per design D1 and call it in `publishBody` after `validateCrossProcess`. Verify the 1.1 tests pass and the error message names the chain.

## 2. Spawn depth cap

- [x] 2.1 Write failing tests in `test/subprocess.test.ts` for the two scenarios of the `subprocess-execution` delta. Build the chain of `parent` links by seeding instances directly. Do not run 16 real spawns for it.
- [x] 2.2 Add `MAX_SUBPROCESS_DEPTH` and the parent-link walk to the spawn handler in `src/engine/subprocess.ts` per design D2. Verify the 2.1 tests pass and the existing subprocess tests stay green.

## 3. CEL structural bound

- [x] 3.1 Write failing tests in `test/cel.test.ts` for the three scenarios of the `cel-expressions` delta, plus one case over 2,000 AST nodes. Add one migration transform with three nested comprehensions. Assert that the check reports each violation at its site.
- [x] 3.2 Pass `limits` in `buildEnv` in `src/cel/check.ts` per design D3. Add the comprehension-nesting helper and call it from `checkSite` and `validateMigrationSpec`. Verify the 3.1 tests pass.

## 4. Documentation

- [x] 4.1 State the cycle rule, the depth cap and the three CEL limits in `docs/authoring-guide.md`, and say that `process.start` loops stay allowed. Verify with the antislop linter.
- [x] 4.2 Move SEC-1 and SEC-7 out of the open list in `docs/decisions.md`. Record them as closed by this change, with the `process.start` exclusion and its reason. Verify with the antislop linter.
- [x] 4.3 In `.claude/rules/process-contract.md`, add `validateSubprocessCycle` to the ordered list of DB-resolving checks that `publishBody` awaits, and correct the count. Add the CEL structural bound beside the CEL line in `.claude/rules/authoring-invariants.md`. Name the new check in the `publishBody` passage of `docs/current-state.md`. Verify with the antislop linter.

## 5. Verification

- [x] 5.1 In the devcontainer, run `bun run typecheck` and `bun run build`, and confirm both pass.
- [x] 5.2 Run the full `bun test` with `DATABASE_URL` set, and confirm that every named test passes.
- [x] 5.3 Pipe the full run's output through `sh scripts/gates/silent-green.sh` and confirm no skip past the floor.
- [x] 5.4 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`, and confirm both pass.
