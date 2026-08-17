## 1. The engine write path

- [x] 1.1 Take the signature from `design.md`. `max` goes before `db`.
- [x] 1.2 Change the return type to `"written" | "missing" | "at-bound"`.
- [x] 1.3 Keep the delete branch. It answers `"written"` or `"missing"`.
- [x] 1.4 Rewrite the insert against the statement in `design.md § Decisions`.
- [x] 1.5 Answer `"at-bound"` when the statement returns no row.
- [x] 1.6 Comment the two disjuncts. Name why `EXISTS` is there.
- [x] 1.7 Delete `uiStringOverrideExists`.
- [x] 1.8 Correct the module header. It claims three statements.

## 2. The route

- [x] 2.1 Delete the probe and the count from `handleAdminPutUiString`.
- [x] 2.2 Pass `MAX_OVERRIDES` to `setUiStringOverride`.
- [x] 2.3 Raise the same `RequestShapeError` on `"at-bound"`.
- [x] 2.4 Derive `deleted` from `"written"`, as today.
- [x] 2.5 Drop `uiStringOverrideExists` and `countUiStringOverrides` from the
      import. `countUiStringOverrides` has no other reader here.
- [x] 2.6 Rewrite the doc comment at `admin-routes.ts:784-792`. One statement
      now carries the bound.

## 3. Tests

- [x] 3.1 Replace the `uiStringOverrideExists` test in
      `test/ui-strings.test.ts`.
- [x] 3.2 Assert the bound refuses a new key, with a small `max`.
- [x] 3.3 Assert an overwrite still lands at the bound.
- [x] 3.4 Assert a clear still lands at the bound.
- [x] 3.5 Add the bound argument to the nine calls in
      `test/ui-strings.test.ts`. Move each `sql` one position right.
- [x] 3.6 Change `test/ui-strings.test.ts:52` to expect `"written"`.
- [x] 3.7 Change `test/ui-strings.test.ts:59` to expect `"missing"`.
- [x] 3.8 Add the bound argument to the four calls in
      `test/http-ui-strings.test.ts` (lines 63, 64, 76, 92).
- [x] 3.9 Leave that file's route-driven assertions as they are.

## 4. The audit

- [x] 4.1 Record finding 23 as resolved in `PONYTAIL-AUDIT.md`.
- [x] 4.2 Move finding 5 to "Checked, not flagged (deliberate)".
- [x] 4.3 Move finding 28 there. It rides with 5 in the audit.
- [x] 4.4 Move finding 22 there, beside the `waitingLabel` entry.
- [x] 4.5 Carry each measurement across from `design.md`.
- [x] 4.6 Correct the net-lines total and the "Not applied" grouping.
- [x] 4.7 Add `countUiStringOverrides` to finding 41's list. Only `test/`
      reads it after this change.

## 5. Verification

- [x] 5.1 Run `bun run typecheck`. Report what it printed.
- [x] 5.2 Run `bun run build`. Report what it printed.
- [x] 5.3 Run the full `bun test` with `DATABASE_URL` set.
- [x] 5.4 Report the pass count and the skip count.
- [x] 5.5 Run the antislop linter over every Markdown file touched.
- [x] 5.6 Run `git diff --check` and `git ls-files --eol`.
