# Proposal

## Why

The background workers get slower with every instance the engine has ever run.
A finished child keeps `resolve_state = 'pending'`, so the resolution claim
scans it twice a second for good. At 300,000 instances, with 100,000 of them
finished and marked, the claim query took 1119 ms. A tenant with a hung target
also delays every tenant listed after it, on every tick.

The audit of 2026-10-10 reported these as B-6, B-7, B-8 and B-11. A seeded
database now gives the sizes the audit left as a guess.

## What Changes

- A commit that leaves an instance not `running` clears its re-resolution mark.
  This covers a terminal step, a `cancelled` override and the `faulted` flip.
  `initSchema` clears the mark on rows that already carry one.
- The resolution claim reads the `status` column and runs over a partial index
  of the rows that hold a mark. The index replaces `instances_resolve_idx`.
- The retention sweep selects by an expression index over the entry time of
  terminal, unredacted instances. It pages by entry time, then `instance_id`.
  The sweep keeps its 500 ms cadence, because one pass now costs under a
  millisecond (see `design.md`).
- Each worker starts one tick per tenant, at most `TENANT_TICK_CONCURRENCY` (8)
  at a time. The worker skips a tenant whose previous tick still runs. One
  tenant's slow target no longer delays another tenant.
- A new index `outbox_created_idx` serves the admin outbox list order.
- The retention index `instances_redacted_idx` goes away. Its comment claimed
  a small index, but it holds every unredacted row.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `automatic-transitions`: a commit that leaves an instance not `running`
  leaves it with no re-resolution mark.
- `persistence`: the claim, the retention sweep and the admin outbox list each
  get a supporting index. `initSchema` clears stale marks.
- `data-retention`: the sweep pages by entry time, then `instance_id`.
- `multi-tenancy`: a worker ticks tenants in parallel with a fixed bound.
  A slow tenant delays no other tenant.

## Impact

- `src/engine/transition.ts`: `applyStepEntry` and `markFaulted`.
- `src/engine/resolution.ts`: the claim query.
- `src/engine/retention.ts`: the sweep query and keyset.
- `src/engine/host.ts`: `eachTenant`, `TENANT_TICK_CONCURRENCY`.
- `src/engine/store.ts`: `initSchema` indexes and the stale-mark clear.
- Tests: `automatic`, `resolution`, `retention`, `tenancy-workers`, and one
  plan test per index.
- `docs/decisions.md`: the audit index entry for this change is struck.
  PERF-1 stays open and untouched, since the retention loop kept its cadence.
- No change to `src/schema/definition.ts`, no new environment variable and no
  HTTP change.
