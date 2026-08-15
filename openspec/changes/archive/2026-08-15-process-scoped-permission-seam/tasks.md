## 1. Survey before any code moves

- [x] 1.1 Grep the publish suites for a 403 assertion over a malformed body
- [x] 1.2 Grep for a test asserting the publish gate runs before the parse
- [x] 1.3 Confirm `Instance` carries `processId`, and note its type
- [x] 1.4 List every caller of `handlePublish` outside `src/http/`

## 2. The seam module

- [x] 2.1 Add a `Permission` union of `"publish"`, `"cancel"` and `"migrate"`
- [x] 2.2 Add the `PERMISSION_ROLE` constant map over those three
- [x] 2.3 Add `can`, returning a boolean, with the `void processId` statement
- [x] 2.4 Add `requirePermission`, throwing the existing `AuthorizationError`
- [x] 2.5 Import `ProcessId` as a type-only import
- [x] 2.6 Extend the module's own header comment to name the seam
- [x] 2.7 Extend the exports canary in `test/auth-authorize.test.ts`
- [x] 2.8 Keep `PERMISSION_ROLE` private to the module

## 3. The five gates that hold a process id

- [x] 3.1 Swap `handlePublishDraft` to `requirePermission` with `"publish"`
- [x] 3.2 Swap `handleGetMigrationPlan` to `requirePermission` with `"migrate"`
- [x] 3.3 Swap `handlePutMigrationPlan` to `requirePermission` with `"migrate"`
- [x] 3.4 Swap `handleGetOrphanKeys` to `requirePermission` with `"migrate"`
- [x] 3.5 Move the publish-route gate behind the body parse and the shape check
- [x] 3.6 Rewrite the `handlePublish` doc sentence about the pre-parse gate
- [x] 3.7 Drop any role import a file no longer uses
- [x] 3.8 Rewrite the third gate bullet in the `studio-routes.ts` header
- [x] 3.9 Fix the publish-ordering sentence in `docs/current-state.md`
- [x] 3.10 Keep that file's antislop count level. The prose ratchet reads it.

## 4. The cancel path

- [x] 4.1 Leave the load-free fast path exactly as it is
- [x] 4.2 Add the `can` term beside the `startedBy` test in the loaded branch
- [x] 4.3 Keep one error message across both refusals
- [x] 4.4 Rewrite the function's doc comment to name both tests

## 5. Tests

- [x] 5.1 Add `can` cases to `test/auth-authorize.test.ts`, one per permission
- [x] 5.2 Assert two different process ids give one answer
- [x] 5.3 Assert `requirePermission` throws for an actor with no roles
- [x] 5.4 Assert `requirePermission` returns for a role holder
- [x] 5.5 Assert 400 for a malformed body from a caller lacking the role
- [x] 5.6 Assert 403 still stands for a well-formed body from that caller
- [x] 5.7 Assert the cancel refusal reads the same for a missing instance
- [x] 5.8 Keep the starter cancel case green

## 6. Verification

- [x] 6.1 Run `bun run typecheck`, and report what it printed
- [x] 6.2 Run `bun run build`, and report what it printed
- [x] 6.3 Run the full `bun test` with `DATABASE_URL` set
- [x] 6.4 Report the pass, skip and fail counts from that run
- [x] 6.5 Run the antislop linter over every Markdown file this change touched
- [x] 6.6 Run `git diff --check`, then `git ls-files --eol` for CRLF
- [x] 6.7 No browser check. Nothing under `packages/` moves.
