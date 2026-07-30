## 1. listInstances fix

- [x] 1.1 In `src/runtime/api.ts`'s `listInstances` (around line 753),
      select `created_at::text AS created_at_cursor` alongside the
      existing `created_at`, matching `listComments`' own fix in the
      same file.
- [x] 1.2 Update the row cast to include `created_at_cursor: string`,
      and build the returned cursor from
      `encodeCursor([last.created_at_cursor, last.instance_id])`
      instead of `new Date(last.created_at).toISOString()`. Leave
      `toSummary`'s `createdAt` display field on `.toISOString()`
      unchanged — display precision does not need to match cursor
      precision.
- [x] 1.3 Add a test to `test/runtime-api.test.ts`, beside the existing
      `listInstances` pagination tests (around line 1244): create two
      instances, then force both `instances.created_at` rows to the
      same millisecond at different microsecond offsets via a raw
      `UPDATE` (deterministic, not a timing race — see design.md
      "Risks"). Page with `limit: 1` twice and assert both instances
      appear across the two pages, in newest-first order, with neither
      dropped nor duplicated.

## 2. listOutbox fix (found during this change's own /opsx:verify)

- [x] 2.1 In `src/engine/admin-queries.ts`'s `listOutbox` (around line
      87), select `created_at::text AS created_at_cursor` alongside
      the existing `created_at`.
- [x] 2.2 Update the row cast to include `created_at_cursor: string`,
      and build the returned cursor from
      `encodeCursor([last.created_at_cursor, last.idempotency_key])`
      instead of `new Date(last.created_at).toISOString()`.
- [x] 2.3 Add a test to `test/admin-queries.test.ts`, beside the
      existing `listOutbox` pagination test (around line 110): insert
      two outbox rows via the file's existing `insertRow` helper, then
      force both rows' `created_at` to the same millisecond at
      different microsecond offsets via a raw `UPDATE`. Page with
      `limit: 1` twice and assert both rows appear across the two
      pages, newest-first, with neither dropped nor duplicated.
      Confirmed: descending order, same as `listInstances` — the
      pre-fix symptom would be a dropped row.

## 3. listPendingTimers fix (found during this change's own /opsx:verify)

- [x] 3.1 In `src/engine/admin-queries.ts`'s `listPendingTimers`
      (around line 119), select `next_timer_at::text AS
      next_timer_at_cursor` alongside the existing `next_timer_at`.
- [x] 3.2 Update the row cast to include `next_timer_at_cursor:
      string`, and build the returned cursor from
      `encodeCursor([last.next_timer_at_cursor, last.instance_id])`
      instead of `new Date(last.next_timer_at).toISOString()`.
- [x] 3.3 Add a test to `test/admin-queries.test.ts`, beside the
      existing `listPendingTimers` test (around line 220): create two
      running instances, then force both `instances.next_timer_at`
      values to the same millisecond at different microsecond offsets
      via a raw `UPDATE`. Page with `limit: 1` twice and assert both
      instances appear across the two pages, with neither dropped nor
      duplicated. Confirmed: ascending order, same as `listComments` —
      the pre-fix symptom would be a duplicated boundary row, matching
      proposal.md/design.md's prediction; neither needed correcting.

## 4. Verification

- [x] 4.1 Run `bun run typecheck` inside the devcontainer; fix any
      reported error. Clean on both the engine and all four frontend
      packages.
- [x] 4.2 Run the full `bun test` suite inside the devcontainer with
      `DATABASE_URL` set (never a single-file rerun — see CLAUDE.md).
      Confirm zero failures and that the DB-backed suites did not skip.
      1300/1300 pass (two more than the `listInstances`-only run: the
      two new `listOutbox`/`listPendingTimers` regression tests).
