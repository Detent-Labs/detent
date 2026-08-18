## 1. Definition contract

- [x] 1.1 Add optional `validation` and `validationMode` to `viewField`
- [x] 1.2 Refine `viewField`: reject a mode without an override
- [x] 1.3 Refine `viewField`: reject an override with no key
- [x] 1.4 Add rejecting tests to `test/validate.test.ts`

## 2. Publish-time checks

- [x] 2.1 Call the existing `checkPatterns` on each step view field
- [x] 2.2 Pass the `steps[i].view.fields[j]` prefix so the issue locates
- [x] 2.3 Push `validation.rule` in `compile.ts::collectExpressionSites`
- [x] 2.4 Push `validation.rule` in the `check.ts` view-field walk
- [x] 2.5 Pass `child: false` at that site, on every step type
- [x] 2.6 Add pattern and rule-length tests to `test/compile-validation.test.ts`
- [x] 2.7 Add rule scope tests to `test/cel.test.ts`

## 3. Runtime resolution

- [x] 3.1 Add `effectiveValidation(field, viewField)` to `src/runtime/api.ts`
- [x] 3.2 Build a `ref`-keyed view-field map in `validateSubmissionData`
- [x] 3.3 Pass the effective validation to `checkConstraints` and the rule read
- [x] 3.4 Leave `ResolvedViewField` unchanged, keeping the override off the wire
- [x] 3.5 Assert `GET /instances/:id` reports no `validation` key

## 4. Runtime tests

- [x] 4.1 Narrowed bound rejects a value the catalog allows
- [x] 4.2 Widened bound accepts a value the catalog rejects
- [x] 4.3 Merge keeps the catalog keys the step omits
- [x] 4.4 Replace drops the catalog keys the step omits
- [x] 4.5 A step rule supersedes the catalog rule
- [x] 4.6 Two steps judge one value by their own overrides
- [x] 4.7 A seed is judged by the initial step's override

## 5. Documentation

- [x] 5.1 State the override rule in `docs/authoring-guide.md`
- [x] 5.2 Change `docs/current-state.md` for the schema change
- [x] 5.3 Extend the pattern invariant in `.claude/rules/authoring-invariants.md`
- [x] 5.4 Run the antislop linter on every changed Markdown file

## 6. Verification

- [x] 6.1 Run `bun run typecheck`
- [x] 6.2 Run `bun run build`
- [x] 6.3 Run the full `bun test` with `DATABASE_URL` set
- [x] 6.4 Check the skip count against the floor
- [x] 6.5 Run `git diff --check` and `git ls-files --eol`
