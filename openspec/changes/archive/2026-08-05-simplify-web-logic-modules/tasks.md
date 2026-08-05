## 1. The draft toolbar's two logic files

- [x] 1.1 Move `isDirty` into
  `packages/web/src/areas/studio/screens/draftToolbarState.ts`, with its doc
  comment. Delete `publishGateLogic.ts`.
- [x] 1.2 Change `savedBodyReducer` to `(_state: Draft, body: Draft)` and
  delete the `SavedBodyAction` type. Keep the `structuredClone` and the
  comment explaining it.
- [x] 1.3 Cut the file's comment down to what still holds. The panels mutate
  the draft in place, so the clone is load-bearing. The two-kind rationale
  goes with the union.
- [x] 1.4 Rework `panels/DraftToolbar.tsx`. One import for both functions, and
  two dispatch calls that pass the body directly.
- [x] 1.5 Move the cases from `test/studio-publishGateLogic.test.ts` into
  `test/studio-draftToolbarState.test.ts`, then delete the first file.
- [x] 1.6 Repoint `test/studio-dataListKeysLogic.test.ts`'s `isDirty` import.
- [x] 1.7 Rework `test/studio-draftToolbarState.test.ts`'s own reducer calls
  to the new argument shape.

## 2. selectVersion

- [x] 2.1 Delete `selectVersion` from
  `packages/web/src/areas/studio/screens/versionDiffLogic.ts`. Keep
  `VersionSelection`, `canDiff` and `diffJson`.
- [x] 2.2 Inline the spread at both call sites in `VersionsScreen.tsx`.
- [x] 2.3 Rewrite the `selectVersion` cases in
  `test/studio-versionDiffLogic.test.ts` to build the selection object
  directly. Keep every `canDiff` assertion.

## 3. The login form

- [x] 3.1 Add `required` to both inputs in
  `packages/web/src/shell/LoginScreen.tsx`.
- [x] 3.2 Cut the submit button's gate to `disabled={loading}`.
- [x] 3.3 Add no CSS. Confirm `shell.css` still styles no `:invalid` or
  `:user-invalid` state, so an untouched field carries no error styling.

## 4. The five one-line removals

- [x] 4.1 Cut `?? catalog.en[key] ?? key` from `t()` in
  `packages/web/src/shell/catalog.ts`.
- [x] 4.2 Cut the same tail from
  `packages/web/src/areas/app/catalog.ts`.
- [x] 4.3 Export `browserStorage()` from `packages/web/src/shell/session.ts`.
  Call it at both sites in `App.tsx` that write the guard inline.
- [x] 4.4 Delete `freeText` from `Operand` in
  `panels/shared/conditionLogic.ts`, and both writes of it. Delete the two
  assertions in `test/studio-conditionLogic.test.ts` that read it, keeping
  their surrounding cases.
- [x] 4.5 Replace `rowCounter` in `screens/migrationPlanLogic.ts` with
  `crypto.randomUUID()`. Keep the `nextRowId()` name, so its five call sites
  stay as they are.
- [x] 4.6 Delete `EVERY_KEY` from `panels/shared/fieldValidationLogic.ts` and
  return `ALL_KEYS` at both sites. Carry the "every key" intent in a comment.

## 5. Documentation

- [x] 5.1 Append a `## Web logic-module simplifications
  (\`simplify-web-logic-modules\`)` section to `docs/current-state.md`. Record
  the rejected finding 10 and its measurement.
- [x] 5.2 Rewrite `docs/current-state.md` line 1159. It names
  `screens/publishGateLogic.ts::isDirty`, and this change deletes that file.
  It is the only hit across all six removed names.

## 6. Verification

- [x] 6.1 Run `bun run typecheck`. Report what it printed. The catalog change
  rests on the compiler, so this is the check that matters most.
- [x] 6.2 Run the FULL `bun test` with `DATABASE_URL` set, inside the
  devcontainer. Report the pass count AND the skip count.
- [x] 6.3 Build the web bundle and load the login screen in a real browser.
  Submit with an empty password and confirm the browser blocks it, names the
  field and moves focus. No test in this repo sees a validation bubble.
- [x] 6.4 In the same browser, log in and open the studio's Versions screen.
  Pick two versions and confirm the diff still renders.
- [x] 6.5 Run the antislop linter over `proposal.md`, `design.md`,
  `tasks.md`, the spec delta and `docs/current-state.md`.
- [x] 6.6 Run `git diff --check`.
- [x] 6.7 Run `git ls-files --eol`. Read the `w/` column for CRLF.
- [x] 6.8 Confirm each touched Markdown file's antislop finding count did not
  rise against its count at `HEAD`.
