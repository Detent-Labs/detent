# Design

## Context

Take `eve@corp.example`. Tenant `acme` and tenant `beta` each hold an account
under that address. Today `loginAttempts` is one module-global `Map` keyed by
the normalized email. So `eve@corp.example` is one entry for both tenants.
An attacker tries four passwords on `beta`'s host. Then they log in to their
own `acme` account, which clears the shared entry through
`loginAttempts.delete(normalizedEmail)`. The `beta` account is then free to
guess again (finding C-7). Two engine processes of one tenant split the count
the same way, since each keeps its own `Map` (SEC-5).

`handleLogin` already receives `db`, and `db` is the tenant's own handle: the
dispatcher resolves it from the host (`src/http/server.ts`, the
`/auth/login` route). Every other login read, `verifyLogin` included, goes
through that handle.

`checkAndRecordAttempt` is synchronous today. That is the whole atomicity
argument in its doc comment: no `await` sits between the check and the
increment. A database call is asynchronous, so the guarantee has to move into
the statement. Row locks in Postgres give it across processes too.

See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**

- One table holds both windows. One statement per window checks and records.
- Tenants cannot see each other's windows, with no tenant column to forget.
- Every process of a tenant shares the windows, and a restart keeps them.
- The table stays small without a cap.

**Non-Goals:**

- No new threshold. 5 per email, 50 per address and 15 minutes carry over.
- No change to how `TRUST_PROXY` supplies the caller address.
- No per-tenant view of the windows for an operator, and no unlock route.
- No cross-tenant limit on one address. A caller who spreads attempts over
  tenants meets each tenant's own windows.

## Decisions

### D1: The table lives in the tenant's own database

`login_attempts` is created by `initSchema` in `src/engine/store.ts`, so the
provisioning command builds it for each tenant, the way it builds
`auth_users`. The `db` handle `handleLogin` already holds reaches it. Two
tenants therefore hold two tables, and the C-7 collision cannot occur.

Alternative: one shared table with a `tenant` column. It needs a handle to a
database that is not the tenant's, and one missed `WHERE tenant = ...` brings
the bug back. Rejected. The same reasoning put `auth_users` and
`permission_grants` into the tenant's database.

The address window follows. It counts per tenant database, so an address
spread over tenants meets one window per tenant. The caller picks the
tenant host. A shared address window would give that caller no extra reach.
It would only couple the tenants.

### D2: One generic table, one row per window

```
login_attempts (
  scope        text        NOT NULL,   -- 'email' or 'address'
  key          text        NOT NULL,   -- SHA-256 hex of the normalized email, or of the caller address
  attempts     integer     NOT NULL,
  window_start timestamptz NOT NULL,
  PRIMARY KEY (scope, key)
)
```

plus an index on `window_start` for the cleanup. Two tables would repeat one
shape. Separate `email` and `address` columns would need a partial key.

The key is a digest because an email has no length bound. A long value would
exceed the index row limit and answer `500`, where `verifyLogin` answers `401`.
The digest also keeps plaintext emails out of the table.

`scope` carries no `CHECK`. Only `src/auth/login.ts` writes the table, with
two literals.

### D3: One statement checks and records

```sql
INSERT INTO login_attempts (scope, key, attempts, window_start)
VALUES ($1, $2, 1, now())
ON CONFLICT (scope, key) DO UPDATE SET
  attempts     = CASE WHEN login_attempts.window_start <= now() - $4 * interval '1 millisecond'
                      THEN 1 ELSE LEAST(login_attempts.attempts + 1, $3 + 1) END,
  window_start = CASE WHEN login_attempts.window_start <= now() - $4 * interval '1 millisecond'
                      THEN now() ELSE login_attempts.window_start END
RETURNING attempts
```

`$3` is the threshold and `$4` is `WINDOW_MS`. The try passes when the
returned `attempts` is at most the threshold. The count stops at threshold
plus one, so a flood cannot overflow it. A refused try leaves `window_start`
alone, so refusals do not extend the window. That matches the
in-memory code.

A concurrent try for the same key waits on the row lock and then sees the
committed count. That gives the atomicity the synchronous `Map` code had, and
it holds across processes.

The window's age compares with `now()` on the database. Process clocks never
enter, so two processes cannot disagree about when a window ended.

Alternative: `SELECT` then `UPDATE` in a transaction. It needs `FOR UPDATE`
and a second round trip, and a missing row still races on the insert.
Rejected.

### D4: `handleLogin` keeps its order and its two windows

The address window runs first, then the email window, as today. A caller past
its address threshold never adds an email row. A success deletes the email row
and leaves the address row. `checkAndRecordAttempt` keeps its name and becomes
`checkAndRecordAttempt(db, scope, key, maxAttempts)`, returning a promise of
`"ok" | "limited"`. The two callers are `handleLogin` and its tests.

### D5: Each check deletes expired rows

`handleLogin` runs one delete per request, before the first window statement.
It selects the expired rows by the `window_start` index. It locks them with
`FOR UPDATE SKIP LOCKED`, so two cleanups never wait on each other and cannot
deadlock. The retention sweep cannot do this job. It stays off unless
`DATA_RETENTION_DAYS` is set.

`MAX_TRACKED_EMAILS`, `MAX_TRACKED_ADDRESSES` and the eviction code go. They
bounded process memory. The address window limits how fast one caller adds
email rows. One address adds at most `MAX_ADDRESS_ATTEMPTS` rows per window.

Alternative: delete only now and then, with a random draw. The delete is cheap
at the table's size, and a random draw makes a test depend on luck. Rejected.

### D6: The limiter fails closed

A database error in the check propagates. The server maps it to `500`, as it
does for an error in `verifyLogin`. Skipping the check on error would let a
caller who can cause database errors lift the control. The in-memory limiter
could not fail, so this is a new case, with a new scenario in the spec.

### D7: The old tests change shape

The `Map` unit tests, which inject a clock and fill the map, become database
tests. Time moves by an `UPDATE` of `window_start`. The capacity and eviction
tests go with the code they covered.

Rows now outlive the test process. Every suite that calls the login route
therefore truncates `login_attempts` in its `beforeEach`. A new test runs two
tenant databases with one shared email and checks both directions of C-7.
Another runs the same tries from two `createServer` instances against one
database.

## Risks / Trade-offs

- A login try now costs up to three statements. They are the cleanup, the
  address window and the email window. → Each is a primary-key or range-index access.
  A login already runs an argon2 hash that dwarfs them.
- An existing tenant database has no `login_attempts` table until its schema
  step runs. Logins there answer `500` until then. → After an upgrade, the runbook
  already tells the operator to re-run the schema step. That step runs once
  per tenant database. The upgrade paragraph names the table.
- A database outage now also blocks logins. → An outage already blocks them,
  because `verifyLogin` reads `auth_users` from the same database.

## Migration Plan

1. Deploy the engine. A single-tenant start builds the table in `initSchema`.
2. In SaaS mode, re-run the provisioning command's schema step once per tenant
   database, before or right after the deploy.
3. Rollback: the older engine ignores the table. Its `Map`s start empty. The
   table can stay.

## Open Questions

None.
