## 1. Narrow the Action.output authoring scope

- [x] 1.1 In `src/cel/check.ts::buildEnv`, register `result` as the sole namespace when `opts.result` is set — skip `data`, `instance`, `actor`, `child` and data sources. Update the doc comment to state the rule and why (the writeback is post-commit; the engine supplies `{result}` alone).
- [x] 1.2 Drop the now-dead `child` parameter from `collect()`'s `outputs()` helper and its call sites, so the signature stops implying a namespace output scope no longer has.
- [x] 1.3 Correct the `buildOutputContext` comment in `src/cel/eval.ts` — it already describes the intended scope, but asserts the authoring side matches when (before 1.1) it did not.
- [x] 1.4 Add `test/cel.test.ts` cases: an `Action.output` reading `data.<key>` is rejected; one reading `instance.*`/`actor.*` is rejected; an output site on a subprocess step reading `child.*` is rejected; `result.<field>` still passes.

## 2. Cover onCancel action outputs

- [x] 2.1 In `collect()`, walk `s.onCancel` alongside `s.onEntry`/`s.onExit`, locating issues at `steps[i].onCancel.actions[j].output.<fieldId>`.
- [x] 2.2 Add a `test/cel.test.ts` case: an `onCancel` action whose output expression does not parse (and one reading `data`) is reported, located at the `onCancel` site.

## 3. Wire the check into publish

- [x] 3.1 Add an exported `CelValidationError` to `src/engine/definitions.ts` carrying `readonly issues: CelIssue[]`, with a message joining `loc: message (src)` — mirroring `DurationValidationError`.
- [x] 3.2 In `publishBody`, call `validateProcessBody(body)` on the compiled body after the existing-version hash lookup and before `validateCrossProcess`; throw `CelValidationError` when it returns issues. Document the placement (after compile so the injected sink is covered; after the lookup so an identical re-publish of a pre-tightening body stays a no-op).
- [x] 3.3 Verify `src/cel/check.ts` has no import that would pull the CEL library into a read path — `definitions.ts` already imports `compile.ts`, so confirm the dependency direction stays engine → cel and never contract → cel.

## 4. Publish-path tests

- [x] 4.1 `test/definitions.test.ts`: `publishBody` rejects a body with an unparseable expression, and no `definitions` row is written.
- [x] 4.2 `test/definitions.test.ts`: `publishBody` rejects an unknown field-key reference in a guard, and a type mismatch, each with the issue's `loc` asserted.
- [x] 4.3 `test/definitions.test.ts`: `publishBody` rejects a body whose `Action.output` reads `data`.
- [x] 4.4 `test/definitions.test.ts`: a rejected publish consumes no version number — publishing a valid body afterwards for the same `processId` receives the version the rejected publish would have taken.
- [x] 4.5 `test/definitions.test.ts`: re-publishing an already-published body takes the hash-hit path and does not re-run the expression check (assert no throw and no new version).

## 5. Fixtures and regression surface

- [x] 5.1 Confirm all three `examples/*.json` bodies still publish; fix any expression the narrowed scope now rejects, treating a fixture that relied on the wider output scope as a fixture asserting the drift.
- [x] 5.2 Grep `test/` for bodies published through `publishBody` and repair any whose expressions were previously unchecked (a body invented for an unrelated test may carry a placeholder guard that never had to type-check).

## 6. Verify

- [x] 6.1 `bun run typecheck` clean.
- [x] 6.2 `bun test` with `DATABASE_URL` set — full suite, not a single-file rerun. Record the pass/fail counts and confirm no test skipped silently.
- [x] 6.3 On a copy of the tree (never the shared working tree), mutation-check the wiring: remove the `validateProcessBody` call in `publishBody` and confirm the named tests from group 4 fail; remove the `onCancel` walk and confirm 2.2 fails; restore the wider output env and confirm 1.4 fails.
- [x] 6.4 Update `CLAUDE.md`: the CEL bullet under "Current state" and roadmap #2 both describe `check.ts` as authoring-time without naming its enforcement point — state that `publishBody` invokes it, that `Action.output` scope is `result` only, and that data-source resolution remains unbuilt.
