# Tasks

## 1. Shared groundwork

- [x] 1.1 Move `PROCESS_START_ACTION_TYPE` to `src/schema/definition.ts`, beside `RESERVED_ACTION_PREFIX`. Re-export it from `src/engine/registry.ts`. Verify `bun run typecheck` passes with every importer unchanged.
- [x] 1.2 Add `astProblem(ast)` to `src/cel/check.ts`. It returns the time-function or nesting message. `checkSite` and `validateMigrationSpec` both call it. Verify the CEL and migration tests still pass with the same messages.

## 2. Conditions infer to bool (A-4)

- [ ] 2.1 Pass `expect: "bool"` in `collect()` for the guard, the three view flags and both `validation.rule` sites. Verify with new cases in `test/cel.test.ts` for each scenario of "A condition site infers to bool".
- [ ] 2.2 Cover in those cases a string guard, a `child.outcome` guard, an `int` flag and a `string` rule. Cover a `bool` and a `dyn` condition that pass. Verify each rejecting case names `expected bool`.
- [ ] 2.3 Add one test that `processBody` still parses a body whose guard reads `data.status` alone. Verify it passes, because the rule lives on the publish path.
- [ ] 2.4 Change the test "the deadline result-type expectation does not leak into other sites" in `test/cel.test.ts`. Its comment claims that every other site accepts any type. Make it assert that a numeric `Action.output` and a `string` mapping value still pass. Verify it passes.
- [ ] 2.5 Repair every fixture and test body that publishes a non-bool condition. Read each test name that the full suite reports red. Verify no red test mentions `expected bool` afterwards.
- [ ] 2.6 Confirm a test compiles each file under `examples/` and runs `validateProcessBody` on it. `test/cel.test.ts` does so for three files only. Add a test that covers all of them. Verify it passes.
- [ ] 2.7 Add the `bool` rule to the "Every CEL Expression parses" bullets in `.claude/rules/authoring-invariants.md`. Add it to the Expressions section of `.claude/rules/process-contract.md`. Verify with a grep for the new sentence in both files.
- [ ] 2.8 Teach the rule in `docs/authoring-guide.md`: the Path, View and Validation sections each gain one sentence and one comparison example. Verify the antislop linter reports nothing new on the file.

## 3. Literal patterns for matches (A-3)

- [ ] 3.1 Add the `matches` rule to `astProblem`, for both call forms. Import `MAX_PATTERN_LENGTH` from `src/schema/compile.ts`. Verify `git grep -n "cel/check" -- src/schema` prints nothing, so `compile.ts` never imports `check.ts`.
- [ ] 3.2 Add tests in `test/cel.test.ts` for each scenario of "A matches call takes a string-literal pattern that compiles". Include the call form and a call nested in a comprehension. Test the over-long literal through `validateMigrationSpec`, because publish caps the literal first. Verify each rejecting case fails on the old code.
- [ ] 3.3 Add a `validateMigrationSpec` case with a non-literal pattern in `test/cel.test.ts`. Add a `checkAgainstFields` case where `data.s.matches("(")` returns `ok: false`. Verify both pass.
- [ ] 3.4 Add the `matches` bullet to `.claude/rules/authoring-invariants.md` and one paragraph to `.claude/rules/process-contract.md`. Verify with a grep for `matches` in both files.
- [ ] 3.5 Teach the rule in `docs/authoring-guide.md`. State that the length bound does not stop backtracking, as for `pattern`. Verify the antislop linter reports nothing new on the file.

## 4. Checked mapping values for process.start (A-1)

- [ ] 4.1 Add the `process.start` mapping sites to `collect()` in `src/cel/check.ts`. Read `config.inputMapping` only when it is a plain object. Skip entries that are not CEL expressions.
- [ ] 4.2 Add the `ponytail:` comment from the design above that code. Add one line to the file header about the dependency on `registry-check.ts`. Verify `git grep -n 'ponytail:' -- src` lists the new comment.
- [ ] 4.3 Add tests in `test/cel.test.ts` for the scenarios of "A process.start mapping value is a checked CEL site". Skip the length and studio scenarios. Add a case where another action type holds a CEL-shaped `config` value that stays unread. Add a malformed `config` case that must not throw. Verify each rejecting case fails on the old code.
- [ ] 4.4 Add the mapping values to `collectExpressionSites` in `src/schema/compile.ts`, through `collectActionSites`. Read `config.inputMapping` only when it is a plain object, because this pass runs before Zod. Verify with a test in `test/compile-validation.test.ts`: an over-long value fails at its entry.
- [ ] 4.5 Add a DB-backed test in `test/process-chaining.test.ts`. `publishBody` rejects a mapping with `timestamp()` and one with three nested `all()` calls. Verify both fail on the old code.
- [ ] 4.6 Run `bun install` in the devcontainer, because `packages/web` reads a copy of the engine package. Add a case to `packages/web/test/studio-draftValidationLogic.test.ts`. A draft whose mapping calls `timestamp()` yields a CEL issue. Verify the issue names the mapping entry.
- [ ] 4.7 Add the mapping bullet to `.claude/rules/authoring-invariants.md`. Extend the subprocess-mapping paragraph of `.claude/rules/process-contract.md` with the `process.start` rule. Verify with a grep for `process.start` in the new text.
- [ ] 4.8 Teach the rule in the `process.start` paragraph of the Contract section in `docs/authoring-guide.md`. Verify the antislop linter reports nothing new on the file.

## 5. Records

- [ ] 5.1 Delete the `harden-cel-check-sites` entry from the audit index in `docs/decisions.md`. Verify a grep finds no such entry and the neighbors stay.
- [ ] 5.2 Delete the `process.start` sentences from FIELDS-17 and FIELDS-22 in `docs/decisions.md`. FIELDS-17 keeps its `valueFromField` and `instanceIdField` part. Verify the antislop linter reports nothing new.

## 6. Verification

- [ ] 6.1 Run `bun install`, then `bun run typecheck`, in the devcontainer. Verify it exits 0.
- [ ] 6.2 Run `bun run build` in the devcontainer. Verify it exits 0.
- [ ] 6.3 Run the full `bun test` with `DATABASE_URL` set, through `scripts/test-gated.sh`. Verify `0 fail` and a skip count within the floor.
- [ ] 6.4 Run the prose gate over the pushed range on the host. Verify it exits 0.
- [ ] 6.5 Run the whitespace gate over the pushed range on the host. Verify it exits 0.
- [ ] 6.6 Run `openspec validate harden-cel-check-sites --strict`. Verify it reports the change as valid.
- [ ] 6.7 Replay repro scripts 1, 3 and 4 from `tmp/audit-2026-10-10/reports/A.md` in the devcontainer. Run repro 4 on a guard site through `validateProcessBody`, because the scratchpad has no expected type. Verify each body now draws a located CEL issue.

## Workflow follow-up

- Run `openspec-verify-change`, then `openspec-sync-specs`, then `openspec-archive-change`.
- The change touches no file under `packages/web/src`, so no browser check applies.
