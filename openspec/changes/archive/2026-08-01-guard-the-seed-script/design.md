<!-- antislop: allow-file passive-voice -->
<!-- A guard is described by what it refuses, not by who invokes it. -->

## Context

See proposal.md, section Why. Two facts shape the design.

The exposure is small and sharp. One script, one entry point, five accounts,
one of them `system:admin`. No other script in the repository provisions an
account with a known password.

The repository has no environment signal. A search for `NODE_ENV` across
`src/`, `scripts/` and `packages/` returns nothing that reads it. The
devcontainer sets `DATABASE_URL`, `SMTP_HOST` and `ALLOW_INSECURE_DEV_AUTH`.
Each one names a concrete capability rather than a mode.

## Goals / Non-Goals

**Goals:**

- A seed run against an unexpected database fails, and writes nothing.
- The refusal names the variable. A first-time contributor reads what to do
  from the error alone.

**Non-Goals:**

- No `NODE_ENV`, and no other mode signal. See the decision below.
- No change to what the script seeds. The processes, the accounts and the
  idempotency are the ones `add-database-seed-data` shipped.
- No inspection of the target database. A guard that reads the database to
  tell a production one from a development one is a heuristic. A heuristic
  that guesses wrong is worse than an explicit answer.

## Decisions

**A consent variable, not a mode variable**. `SEED_ALLOW` states one thing.
The person running the command accepts what it does to this database.
`NODE_ENV=development` states something about the whole process.
The repository has no other reader to keep that meaning consistent with. The
first reader of a mode signal defines it for every later one. That is a
project-wide decision this change has no reason to make.

`ALLOW_INSECURE_DEV_AUTH` is the local precedent. The devcontainer sets it,
its comment names the danger, and it turns off exactly one thing.

**The guard runs before `initSchema`.** A refused run therefore creates no
table on a database that had none. Placing it after would leave an empty
schema behind on a mistyped target.

**A subprocess test, not an exported `main`.** The guard sits inside `main()`,
behind the `import.meta.main` check that keeps `DEMO_USERS` importable. A test
that calls the guard directly would need `main()` exported. That widens the
module's surface for the test alone. `Bun.spawn` runs the real entry point
instead.

The subprocess inherits the suite's `DATABASE_URL`. `test/preload-db.ts` has
already pointed that at the `_test` database. A guard that stops working
therefore seeds the test database rather than a real one. The assertion on the
exit code fails in the same run.
