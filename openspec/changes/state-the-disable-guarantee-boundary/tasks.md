## 1. The boundary in the spec

- [ ] 1.1 Sync the modified `jwt-authentication` requirement into
      `openspec/specs/jwt-authentication/spec.md`. The block replaces the
      requirement whole, so carry every existing scenario across unchanged.

## 2. The tests behind the two new scenarios

- [ ] 2.1 In `test/auth-login.test.ts`, beside the existing
      token-before-disable test: an actor holding `system:admin` posts
      `/admin/users/:id/disable` for its own id. Assert `200`, assert the row
      is disabled, then assert `401` for the next request with that same
      token. The self-strip guard covers the roles route alone, so this
      request is allowed.
- [ ] 2.2 In `test/outbox.test.ts`: enqueue a row from an account's
      submission, disable that account, then run the worker. Assert the row
      reaches `delivered` and its handler ran.

## 3. Verification

- [ ] 3.1 `bun run typecheck`.
- [ ] 3.2 The FULL `bun test` with `DATABASE_URL` set, inside the
      devcontainer. Report the pass and skip counts, not just a green.
- [ ] 3.3 The antislop linter over every Markdown file this change touched.
- [ ] 3.4 `git diff --check`, and `git ls-files --eol` for CR bytes in the
      worktree.
