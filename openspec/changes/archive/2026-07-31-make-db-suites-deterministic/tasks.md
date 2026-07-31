## 1. Capture a failure worth diagnosing

- [x] 1.1 Run the full suite twenty times in the devcontainer, each run's
  complete output kept to its own file. Do not stop at the first red run.
- [x] 1.2 From those files, tabulate every red test. Record its file, line,
  assertion text and expected-versus-received values, plus the rate.
- [x] 1.3 Keep collecting until one test yields a **second captured
  assertion**. One name plus one assertion is what the earlier evidence
  already holds, and it was not enough.
- [x] 1.4 Test H1 (design.md). For each red run, record two things. The red
  test's position down its file. The row counts in `outbox` and `instances`
  there. A late red test on a high count supports H1. An early one on a low
  count weakens it.
- [x] 1.5 Test the `LIMIT 100` half of H1 directly. Count the due rows the
  claim query sees on each `drainOutbox` call inside `test/subprocess.test.ts`.
  Report whether any call reaches the bound.
- [x] 1.6 For the outbox dead-letter case, dump the `outbox` rows at the point
  of the assertion: status, attempts, claimed_at. Confirm or discard H2, a row
  left `claimed` and recoverable only after `CLAIM_LEASE_MS`.
- [x] 1.7 Write the mechanism into design.md, under Decisions, with the
  captured evidence. If the twenty runs yield no second assertion, record that
  instead and stop before task group 2.

## 2. Separate the test database

- [x] 2.1 Add `bunfig.toml` with a `[test] preload` entry, and the preload
  module it names.
- [x] 2.2 In the preload, derive the test database from `DATABASE_URL` by
  appending `_test` to its database name. Leave `DATABASE_URL` untouched when
  it is unset, so the DB-backed suites keep skipping.
- [x] 2.3 Create the derived database when it does not exist, over a
  connection to the server's own maintenance database. Leave an existing one
  alone.
- [x] 2.4 Print the database the run will use, before the first suite.
- [x] 2.5 Cover the derivation itself. A URL with a path. A URL with query
  parameters. An already-suffixed URL. An unset variable.

## 3. Record the hazard where people read it

- [x] 3.1 Update `CLAUDE.md`. The claim that `bun test` wipes the demo state
  no longer holds. Name the reverse hazard instead. A running dev server drove
  the same tables the suite drives.
- [x] 3.2 Update `docs/current-state.md` with the split and its reason.

## 4. Verify

- [x] 4.1 Run the full suite twenty times **with a dev server running**. The
  pre-fix measurement was 3 red of 20 under exactly that condition. Every run
  should now agree.
- [x] 4.2 Confirm the separation in the other direction. Seed the development
  database, run the suite, and check the seeded rows survive.
- [x] 4.3 Confirm an unset `DATABASE_URL` still skips rather than failing.
- [x] 4.4 `bun run typecheck` and `bun run check` both pass, with the skip
  count checked.
- [x] 4.5 Rewrite the flake note in project memory. It currently blames the
  suite.
