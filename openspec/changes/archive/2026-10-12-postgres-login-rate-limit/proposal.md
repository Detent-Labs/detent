# Proposal

## Why

The two login rate-limit windows are `Map`s in process memory. A tenant may run
more than one engine process. Each extra process doubles every threshold, and a
restart clears both windows (SEC-5, decided 2026-09-23 in
`decide-security-findings-before-1-0`).

The `Map`s are also module-global, so in SaaS mode the email window ignores the
tenant (audit finding C-7). A successful login in tenant `acme` clears the
window of the same address in tenant `beta`. Failed tries in one tenant lock the
address in every other.

## What Changes

- Both windows move into one table, `login_attempts`, in the tenant's own
  database. One statement per window checks and records a try together. That
  keeps the atomicity of the synchronous `Map` code, and extends it to
  concurrent processes.
- The table lives in the tenant's database, so one tenant's windows never see
  another's. No tenant column exists.
- Thresholds stay as they are: 5 tries per email, 50 per address, 15 minutes.
- The capacity caps (`MAX_TRACKED_EMAILS`, `MAX_TRACKED_ADDRESSES`) and the
  eviction logic go. Each check deletes expired rows instead.
- A database error during the limiter's check now fails the login with `500`.
  The limiter fails closed, because it can now fail at all.
- The deployment runbook drops its entry for process-local limiter state. The
  `local-user-accounts` Purpose line drops "in-memory".
- **BREAKING** for callers of `checkAndRecordAttempt`: it takes a database
  handle and returns a promise. Only `handleLogin` and its tests call it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-user-accounts`: the rate-limit requirement drops "per-process and
  in-memory" and gains the cross-process and per-tenant guarantees. An expiry
  requirement replaces the memory-footprint requirement. A new requirement
  states the fail-closed rule. The Purpose line changes in the main spec.
- `deployment-runbook`: the replica requirement no longer names the login
  windows as process-local state.

## Impact

- `src/auth/login.ts`: the `Map`s, the capacity constants and the eviction go.
  `checkAndRecordAttempt` becomes one SQL statement.
- `src/engine/store.ts`: the schema builder gains the `login_attempts` table
  and its index.
- `test/auth-login.test.ts`: the map-based unit tests become database tests.
  A new test runs two tenant databases with one shared email.
- `test/auth-server.test.ts`: its `beforeEach` truncates `login_attempts`.
- `docs/runbooks/deployment.md`, `docs/decisions.md` and
  `docs/decisions-archive.md` (SEC-5 moves to the archive, and the audit index
  entry for C-7 goes).
- `openspec/specs/local-user-accounts/spec.md`: the Purpose line.
- No new dependency. No change to the definition contract.
