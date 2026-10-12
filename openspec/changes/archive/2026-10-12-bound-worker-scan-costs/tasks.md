# Tasks

## 1. Finished instances have no mark (B-6)

- [x] 1.1 Write `ELSE 'idle'` in `applyStepEntry` and rewrite its doc comment. Verify a child that completes in its creation cascade reads `idle`.
- [x] 1.2 Set `resolve_state = 'idle'` in `markFaulted`. Verify a looping cascade leaves a `faulted` instance `idle`.
- [x] 1.3 Test the cancelled override and a worker pass ending on a terminal step. Verify both read `idle`.
- [x] 1.4 Create `instances_resolve_open_idx`, clear stale marks, drop `instances_resolve_idx`, after the `status` column. Verify the stale-mark test.
- [x] 1.5 Claim on the `status` column in `drainResolutions`. Seed 20,000 finished rows and verify the plan filters no row.
- [x] 1.6 Correct `automatic.test.ts`, which asserts a terminal instance stays `pending`. Verify the new assertion reads `idle`.

## 2. The retention sweep keys on entry time (B-7)

- [x] 2.1 Replace `instances_redacted_idx` with the entry-time partial index. Verify `initSchema` twice leaves one index.
- [x] 2.2 Rewrite `sweepRetention` to page by `(entry, instance_id)` on the `status` column. Verify the retention suite passes.
- [x] 2.3 Test a failing instance with later eligible instances behind it. Verify they redact and the next tick retries the first.
- [x] 2.4 Add a plan test for a tick with nothing eligible. Seed 20,000 rows and verify the index serves it.

## 3. The admin outbox list has an index (B-11)

- [x] 3.1 Create `outbox_created_idx`. Verify `initSchema` twice leaves one index.
- [x] 3.2 Add a plan test for the unfiltered list and a deep page. Seed 20,000 rows and verify an index scan with no sort node.

## 4. Tenants tick in parallel (B-8)

- [x] 4.1 Add `TENANT_TICK_CONCURRENCY = 8` and rewrite `eachTenant` with an in-flight set. Verify `tenancy-workers.test.ts` passes.
- [x] 4.2 Test a tenant whose drain never ends beside a healthy one. Verify the healthy tenant gets served on every tick.
- [x] 4.3 Test that a running drain starts no second drain, and that nine tenants run at most eight at once.
- [x] 4.4 Keep `ponytail:` comments out unless a shortcut is real. Verify `git grep -n 'ponytail:' -- src` lists none new.

## 5. Records

- [x] 5.1 Strike this change's entry in the audit index of `docs/decisions.md`. Verify the entry is gone and no citation breaks.
- [x] 5.2 Fix the comment that said `instances_redacted_idx` stays small. Verify `git grep instances_redacted_idx -- src docs` finds nothing live.
- [x] 5.3 Check `docs/current-state.md`, `docs/runbooks` and `README.md` for the three index names. Verify each hit names the new index.

## 6. Verification

- [x] 6.1 Run `bun run typecheck`, then `bun run build`, then the full gated `bun test` with `DATABASE_URL` set. Verify all three exit 0.
- [x] 6.2 Run the prose and whitespace gates over the push range. Verify both print nothing and exit 0.
- [x] 6.3 Run the audit's R6 and R7 queries again on the final schema. Verify the plans match the design table.

## Workflow follow-up

- Verify the change, sync its specs, archive it, push, open the PR and merge on green CI.
