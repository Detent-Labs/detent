## 1. Fold the field-level expression-length check into checkFieldTree

- [x] 1.1 In `src/schema/compile.ts`, add a per-field check (parallel to
      `checkPatterns`, `checkColumnMapping`, `checkFieldKeyFormat`) that
      bounds `f.validation.rule.src` and `f.default.src` (when each is a
      CEL expression, `{ lang: "cel", src }`) by `MAX_EXPRESSION_LENGTH`,
      pushing the same issue shape and message text
      `checkLengthBounds` currently produces for those two positions.
- [x] 1.2 Call the new check from `checkFieldTree`'s existing
      `walkFieldsIndexed` callback, alongside the other three per-field
      checks.
- [x] 1.3 Remove the `walkFieldsIndexed` call and its two `push(...)`
      lines for `validation.rule`/`default` from `collectExpressionSites`,
      keeping the rest of that function (the `body.workflow.steps` walk)
      unchanged.
- [x] 1.4 Update `checkFieldTree`'s doc comment (compile.ts:528-532) to
      name the new expression-length check among what the pass runs.
- [x] 1.5 Update `collectExpressionSites`'s doc comment to drop the
      field-level positions it no longer covers.

## 2. Tests

- [x] 2.1 Add a test asserting a field's over-long `validation.rule` CEL
      source produces the `expression source exceeds the
      ${MAX_EXPRESSION_LENGTH}-character bound` issue at
      `fields[i].validation.rule`.
- [x] 2.2 Add a test asserting a field's over-long `default` CEL source
      produces the same issue shape at `fields[i].default`.
- [x] 2.3 Confirm the existing guard-length test
      (`test/compile-validation.test.ts:360`) still passes unchanged,
      since guards stay in `collectExpressionSites`'s workflow-level walk.

## 3. Verification

- [x] 3.1 Run `bun run typecheck`.
- [x] 3.2 Run `bun run build`.
- [x] 3.3 Run the full `bun test` suite with `DATABASE_URL` set (not a
      single-file rerun) and confirm no new skips or failures.
