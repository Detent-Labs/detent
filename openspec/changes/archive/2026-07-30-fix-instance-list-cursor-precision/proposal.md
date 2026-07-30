## Why

`listInstances`' keyset pagination silently drops instances from a walk
whenever two of them share a millisecond. A tight burst of instance
creation hits this in real workloads. `add-instance-comments` found and confirmed this bug. That change hit
and fixed the identical bug in its own new `listComments` first.

`instance-query`'s own spec already states the invariant this breaks.
An instance already returned on an earlier page is never returned
again, its wording says. Its converse holds too, though unstated. No
instance should silently drop out of the walk either.

This change's own `/opsx:verify` pass grew its scope. The first draft
claimed no third `timestamptz`-backed cursor existed in the codebase.
Checking that claim, instead of trusting it, found two more:
`listOutbox` and `listPendingTimers` (`src/engine/admin-queries.ts`),
both feeding the admin area's Outbox and Timers screens. See
design.md's Context for the full account.

## What Changes

- `listInstances`', `listOutbox`'s, and `listPendingTimers`' pagination
  cursors no longer round-trip through a JS `Date` (millisecond
  precision). Each now encodes from the relevant column cast to
  `::text` (Postgres's own microsecond-precision text), the same fix
  `add-instance-comments` already applied to `listComments`.
- No route, request, or response shape changes anywhere. All three
  functions' public signatures stay the same, as do `GET /instances`,
  `GET /admin/outbox`, and `GET /admin/timers`.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `instance-query`: `listInstances`' existing "keyset-paginated in a
  stable order" requirement gains a scenario pinning the
  same-millisecond case. Its normative text does not change.
- `admin-operations-api`: "Outbox rows are readable by status" and
  "Pending timers are readable" each gain the same kind of scenario.
  Neither requirement's normative text changes either.

  None of the three requirements needed new normative text. Each
  already covered the correct behavior; only the implementation was
  wrong.

## Impact

- Runtime API Layer: `listInstances` in `src/runtime/api.ts` (the
  `encodeCursor` call site only).
- Engine: `listOutbox` and `listPendingTimers` in
  `src/engine/admin-queries.ts` (their `encodeCursor` call sites only).
- No schema, route, or frontend change anywhere.
- Confirmed via a deterministic reproduction for each. Each forces two
  rows into the same millisecond, at different microsecond offsets.
  `listInstances` and `listOutbox` both order descending. Before the
  fix, both silently dropped rows from the walk. `listPendingTimers`
  orders ascending, like `listComments`. Its own already-confirmed
  symptom was different: a duplicated boundary row, not a dropped one.
