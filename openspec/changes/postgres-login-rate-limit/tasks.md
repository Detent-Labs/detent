# Tasks

## 1. The table and the limiter

- [x] 1.1 Add `login_attempts` and its `window_start` index to `initSchema` in `src/engine/store.ts`. Verify a second schema build changes nothing.
- [x] 1.2 Rewrite `checkAndRecordAttempt` in `src/auth/login.ts` as the async upsert of design D3. Verify tries 1 to 5 return `ok` and try 6 returns `limited`.
- [x] 1.3 Add the expired-row delete of design D5 before the first window statement. Verify an ended window's row is gone after another email's try, and a locked row does not block it.
- [x] 1.4 Make `handleLogin` await both windows in the old order. A success deletes the email row only. Verify a success leaves the address row.
- [x] 1.5 Delete both `Map`s, the `ponytail:` comment, `MAX_TRACKED_EMAILS`, `MAX_TRACKED_ADDRESSES` and the eviction code. Verify `git grep -n 'MAX_TRACKED\|loginAttempts\|addressAttempts' -- src test` prints nothing.
- [x] 1.6 Replace the `Map` unit tests in `test/auth-login.test.ts` with database tests. Add `login_attempts` to the `beforeEach` truncation there and in `test/auth-server.test.ts`. Backdate `window_start` by `UPDATE` instead of injecting a clock. Verify the window-rollover test passes.
- [x] 1.7 Add a test with two tenant databases and one shared email. Cover both directions of finding C-7. Verify a `beta` lockout leaves `acme` free, and an `acme` success leaves `beta` locked.
- [x] 1.8 Add a test with two `createServer` instances on one database that share one count. The second instance stands for a restart. Add a concurrency test with 20 simultaneous requests. Verify at most five reach `verifyLogin`.
- [x] 1.9 Add a test that a database error in the check answers `500` and never calls `verifyLogin`. Verify `test/http-error-path.test.ts` still passes unchanged.

## 2. Specs and documents

- [x] 2.1 Drop "in-memory" from the Purpose line of `openspec/specs/local-user-accounts/spec.md`. Verify `git grep -n 'in-memory' -- openspec/specs/local-user-accounts` prints nothing.
- [x] 2.2 Delete the login-limiter paragraph from "Running more than one engine process" in `docs/runbooks/deployment.md`. Name the `login_attempts` table in the tenant schema upgrade paragraph. Verify the section names no process-local state.
- [x] 2.3 Move the SEC-5 entry word for word to `docs/decisions-archive.md` with a closing line, and leave a pointer in `docs/decisions.md`. Strike the `postgres-login-rate-limit` line of the audit index. Verify `git grep -n 'SEC-5' -- docs/decisions.md` shows only the pointer.
- [x] 2.4 Search `docs/`, `README.md`, `ROADMAP.md` and `.claude/rules/` for "in-memory" and "per-process" statements about login. Fix each one. Verify the search prints no stale line.

## 3. Verification

- [ ] 3.1 Run `bun run typecheck`, then `bun run build`, then the full `bun test` with `DATABASE_URL` set through `scripts/test-gated.sh`.
- [ ] 3.2 Run the antislop gate: `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`.
- [ ] 3.3 Run the whitespace gate: `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh`.
- [ ] 3.4 Run `openspec validate postgres-login-rate-limit` and verify it passes.

## Workflow follow-up

- Verify, sync the specs, archive the change, then push and open the PR.
- This change has no UI, so it has no browser check.
