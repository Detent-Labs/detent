## 1. Issue-message catalog

- [x] 1.1 Replace the two catalogs in `issue-messages.ts` with one
  `MESSAGES: Record<string, Record<string, string>>` over the five constant
  kinds, per design.md.
- [x] 1.2 Delete the `MessageFn` and `Catalog` type declarations.
- [x] 1.3 Rewrite `issueMessage`'s body: resolve `loc` once, branch on
  `constraint` and `type-mismatch`, then look up.
- [x] 1.4 Correct the file header comment. It names the catalog shape.
- [x] 1.5 Smoke check: `bun test packages/form-ui/test/issue-messages.test.ts`.
  All eight cases pass unchanged. Group 3 runs the full suite.

## 2. The dead guard

- [x] 2.1 Delete `optionText`'s `parts.length === 0` branch. Return the join.
- [x] 2.2 Keep the `if (!attributes)` guard. Add no comment to it.
- [x] 2.3 Leave `field-form.test.tsx` as it is. Lines 411 and 418 already
  cover both guard inputs. No browser check: nothing rendered changes, and
  `development-toolchain`'s split rule sends this to an assertion.

## 3. Documentation

- [x] 3.1 Mark finding 25 resolved in `PONYTAIL-AUDIT.md`.
- [x] 3.2 Split finding 39 there. The `optionText` branch landed.
- [x] 3.3 Move two items to "Checked, not flagged (deliberate)":
  `optionText`'s first guard, with the `Object.values(undefined)` reason.
- [x] 3.4 And the `isGroup`/`isGroupField` merge, with design.md's cost.
- [x] 3.5 Run the antislop linter over every Markdown file this change edits.

## 4. Verification

- [x] 4.1 `bun run typecheck`, then `bun run build`.
- [x] 4.2 Full `bun test` with `DATABASE_URL` set. Report the skip count.
- [x] 4.3 `git diff --check`, then `git ls-files --eol` for CR bytes.
