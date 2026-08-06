## 1. The boundary in the spec

- [x] 1.1 Sync the modified `jwt-authentication` requirement into
      `openspec/specs/jwt-authentication/spec.md`. The block replaces the
      requirement whole, so carry every existing scenario across unchanged.

## 2. The tests behind the two new scenarios

- [x] 2.1 In `test/auth-login.test.ts`, beside the existing
      token-before-disable test: an actor holding `system:admin` posts
      `/admin/users/:id/disable` for its own id. Assert `200`, assert the row
      is disabled, then assert `401` for the next request with that same
      token. The self-strip guard covers the roles route alone, so this
      request is allowed.
- [x] 2.2 In `test/outbox.test.ts`: enqueue a row from an account's
      submission, disable that account, then run the worker. Assert the row
      reaches `delivered` and its handler ran.
- [x] 2.3 Before applying, check whether `close-the-browser-verification-debt`
      has already landed its `test/outbox.test.ts` case (its section 3, tasks
      3.1-3.4, the refused-host dead-letter case). If not yet applied,
      coordinate ordering: apply one change fully, then the other, rather
      than editing the file from two worktrees in parallel.

## 3. Verification

- [x] 3.1 `bun run typecheck`.
- [x] 3.2 The FULL `bun test` with `DATABASE_URL` set, inside the
      devcontainer. Report the pass and skip counts, not just a green.
- [x] 3.3 The antislop linter over every Markdown file this change touched.
- [x] 3.4 `git diff --check`, and `git ls-files --eol` for CR bytes in the
      worktree.
