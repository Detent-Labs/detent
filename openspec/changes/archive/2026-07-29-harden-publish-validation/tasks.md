## 1. Establish the compile-pass check block

- [x] 1.1 In `src/schema/compile.ts`, add a single issue type and error class
  pair for the new structural checks, modelled on `DurationIssue` /
  `DurationValidationError` (`loc`, `value`, `message`; the error carries every
  issue). Reuse the existing pair if the shapes are identical rather than
  adding a near-duplicate
- [x] 1.2 Call the new checks in `compileProcessBody` immediately after
  `validateDurations` (`compile.ts:102-103`) — that is, **before** the
  `publishedProcessBody.safeParse` early return at `:108`
- [x] 1.3 Correct the comment at `compile.ts:105-107`: it asserts that a body
  colliding with the reserved identity "is NOT published-valid and falls
  through", which is the premise SEC-3 falsifies
- [x] 1.4 Confirm `src/http/errors.ts` maps the new error to 422 with issues
  intact, as it already does for `DurationValidationError` — add the mapping
  if a new error class was introduced

## 2. Reserved action prefix on both branches

- [x] 2.1 Move the reserved-prefix loop out of `authoredProcessBody`
  (`definition.ts:684-686`) into the compile-pass check block, visiting all
  five action positions
- [x] 2.2 Leave the cancel-sink id, key and outcome checks in
  `authoredProcessBody` — a compiled body legitimately carries all three, so
  generalizing them would reject every compiled body
- [x] 2.3 In `src/engine/registry-check.ts:107`, drop the reserved-prefix
  `.filter()` and rewrite the doc comment above it, which states the falsified
  premise as its justification
- [x] 2.4 Give `SPAWN_ACTION_TYPE` and `RETURN_ACTION_TYPE` `configSchema`s at
  their registration site (`src/engine/subprocess.ts:242-243`), matching the
  configs actually synthesized at `transition.ts:251` and `:276`:
  `{ subprocessStepId, parentSeq }` and `{ parentInstanceId, childOutcome }`
  (the latter's `childOutcome` is nullable)

## 3. Unknown-key rejection

- [x] 3.1 Add a walk over the authored body that reports every key not
  declared by the corresponding schema, at every depth, with a located path
- [x] 3.2 Derive the accepted key set from the Zod schemas' `.shape` where
  available rather than transcribing key lists, so adding a key to
  `definition.ts` does not silently make the walk reject it
- [x] 3.3 Handle the recursive and union positions explicitly: `fieldDef`'s
  `z.lazy` self-reference, `type: BaseFieldType | Plugin`, and
  `default: Expression | Literal`
- [x] 3.4 Do not touch `processBody.parse` on the read path — it keeps
  stripping, which is what keeps `definitionHash` reproducible

## 4. Pattern compilation and runtime ordering

- [x] 4.1 In the compile-pass block, walk the full recursive field set (reuse
  `collectFieldsDeep`) and `new RegExp(pattern)` each declared
  `validation.pattern`, reporting a located issue on failure
- [x] 4.2 Reject a pattern whose source exceeds the declared maximum length
  (see task 6)
- [x] 4.3 In `src/runtime/api.ts:370-375`, run the pattern test only when the
  `minLength`/`maxLength` checks for that value produced no issue
- [x] 4.4 Cache the compiled `RegExp` per published body — a `WeakMap` keyed
  by the body object is enough, since a rehydrated body is reused across
  submissions and is immutable

## 5. Id resolution for the two unchecked positions

- [x] 5.1 In the compile-pass block, resolve every `SubprocessSpec.outputMapping`
  key against the process's own recursive field set
- [x] 5.2 Resolve every `ProcessContract.inputFields` and
  `ProcessContract.outputFields` entry the same way
- [x] 5.3 Do **not** add these to the base `processBody` superRefine beside the
  sibling `Action.output` check: that would tighten the read schema and could
  make an already-published body with this defect unreadable, taking its
  running instances with it

## 6. Field key format and length bounds

- [x] 6.1 Enforce `/^[a-z_][a-z0-9_]*$/` on every `FieldDef.key` in the
  compile-pass block, at full recursive depth
- [x] 6.2 Declare the length limits as named constants in one place, with a
  one-line comment each stating what the value is sized against:
  `key` and `Plugin.type` (low hundreds), `duration` (small),
  `Expression.src` and `pattern` (low thousands)
- [x] 6.3 Enforce them in the same walk, reporting located issues
- [x] 6.4 Leave `Step.key` and `Path.key` unconstrained — nothing reads them
  as identifiers, and constraining them would force existing bodies to change

## 7. Transport and draft bounds

- [x] 7.1 Pass `maxRequestBodySize` to `Bun.serve` in `src/http/server.ts:380`,
  as a named constant with a comment naming what it is sized against
- [x] 7.2 In `src/engine/drafts.ts::checkEnvelope`, add a serialized-size check
  over `body` + `layout`, raising the existing `RequestShapeError`
- [x] 7.3 Update the `process-drafts` rationale in code comments: the "no
  draft-specific limit because publish has none either" reasoning is no longer
  true once 7.1 lands

## 8. Fixtures, examples and Studio

- [x] 8.1 Re-publish every body under `examples/` through the new checks and
  correct anything they reject — a fixture that only worked because of
  stripping is documenting the wrong contract
- [x] 8.2 Do the same for the test fixtures under `test/`
- [x] 8.3 Check `packages/studio`'s live-validation surface: it runs the
  engine's own validators against the compiled body, so every new issue type
  must render there rather than falling into an "unknown issue" branch

## 9. Tests

- [x] 9.1 SEC-3 regression in the **additive** shape: a body that *adds* a
  well-formed terminal step carrying the cancel-sink id, plus a `core.*`
  action, is rejected at publish. Note that `test/cancel.test.ts:121` passes
  only incidentally today — it renames step[0] and so fails
  `publishedProcessBody` for an unrelated reason; keep it and add the additive
  case beside it
- [x] 9.2 A body with a misspelled `gaurd` key is rejected, with the located
  path in the issue
- [x] 9.3 A body with unknown keys in two places reports both
- [x] 9.4 An uncompilable `validation.pattern` (`"("`) is rejected at publish;
  a valid one still publishes
- [x] 9.5 A submission whose value violates `maxLength` does not evaluate the
  pattern — assert via a field declaring both, with the pattern's evaluation
  observable through the reported issue set
- [x] 9.6 A non-identifier `FieldDef.key` (`""`, `"my-field"`, `"2fa"`) is
  rejected; `total_amount` publishes
- [x] 9.7 An unresolvable `outputMapping` key and an unresolvable
  `contract.inputFields`/`outputFields` entry are each rejected, including the
  nested-in-a-group resolution case — mirror `test/validate.test.ts`'s existing
  `Action.output` suite
- [x] 9.8 An over-long `Expression.src` is rejected; the repo's examples raise
  no length issue
- [x] 9.9 An over-size draft envelope raises `RequestShapeError` and leaves
  the stored draft untouched
- [x] 9.10 Re-publishing a legitimately compiled body is still the no-op it is
  today (the idempotent path must survive every check added here)

## 10. Documentation

- [x] 10.1 `docs/current-state.md`: record the compile-pass check block and
  each new invariant in the definition-contract/compile entries
- [x] 10.2 `CLAUDE.md`'s authoring-time invariant list: add the new
  invariants, and note that the write-path checks run ahead of the idempotent
  return — the list currently reads as if `definition.ts` holds all structural
  invariants

## 11. Verification

- [x] 11.1 Run `bun run typecheck` from the repo root and confirm it passes
- [x] 11.2 Run the FULL `bun test` suite with `DATABASE_URL` set, from the
  repo root, and confirm it passes — check the skip count, not only the pass
  count
- [x] 11.3 Verify each new rejecting test fails without its fix, on a scratch
  copy of the tree — never by mutating the shared working tree
- [x] 11.4 Confirm no already-published fixture body becomes unreadable:
  rehydrating an instance pinned to a body published before this change must
  still work
