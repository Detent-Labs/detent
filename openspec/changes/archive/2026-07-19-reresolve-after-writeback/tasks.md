## 1. Storage

- [x] 1.1 In `store.ts#initSchema`, add idempotent `ALTER TABLE instances ADD COLUMN IF NOT EXISTS resolve_state text NOT NULL DEFAULT 'idle'`, a `resolve_claimed_at timestamptz` lease column, and a `CREATE INDEX IF NOT EXISTS` on `resolve_state`.

## 2. Flag on writeback

- [x] 2.1 In `outbox.ts` tx2, extend the writeback `UPDATE instances` to also set `resolve_state = 'pending'` in the same statement, so it is set iff the row is affected (non-terminal). Do not flag when `affected === 0`.

## 3. Re-resolution worker

- [x] 3.1 Add `src/engine/resolution.ts` with `drainResolutions(db, resolveBody)`: (tx1) claim `resolve_state='pending'` rows `FOR UPDATE SKIP LOCKED` -> `'claimed'`, returning `instance_id`, `process_id`/`version` (or read them from the body row).
- [x] 3.2 For each claimed row: rehydrate the instance, load its frozen body via the injected `resolveBody(processId, version)`; if `undefined`, leave it claimed-cleared back to `'pending'` (or simply skip so a later pass retries) and continue.
- [x] 3.3 Run `resolveAutomatic(instance, body, SYSTEM_ACTOR, db)` with `SYSTEM_ACTOR = { id: "system", roles: [] }`.
- [x] 3.4 CAS-clear: `SET resolve_state='idle' WHERE instance_id=? AND resolve_state='claimed'`, so a writeback that re-flagged `'pending'` mid-pass is preserved.
- [x] 3.5 Add `startResolutionWorker(db, resolveBody, intervalMs)` mirroring `startOutboxWorker`; swallow per-instance errors (a lost OCC race, a resolver miss) and continue.
- [x] 3.6 Lease/reclaim (crash recovery): stamp `resolve_claimed_at = now()` on claim; the claim also reclaims `resolve_state='claimed'` rows past `CLAIM_LEASE_MS`, so a pass that crashes between claim and clear does not strand the instance. `test/resolution.test.ts` covers reclaim-of-stale and no-steal-of-fresh.

## 4. Tests

- [x] 4.1 `test/resolution.test.ts`: a writeback that satisfies a parked wait-state's automatic guard causes the worker to transition it to rest (drive via an injected `resolveBody`).
- [x] 4.2 A writeback that satisfies no guard leaves the instance parked, `resolve_state` back to `idle`.
- [x] 4.3 Re-resolving an instance already advanced (e.g. by a manual transition) is a no-op, no error.
- [x] 4.4 Race: mark an instance `pending` while it is `claimed`; the CAS-clear does not clear it and a second pass re-resolves.
- [x] 4.5 `resolveBody` returning `undefined` leaves the instance markable for a later pass (no crash).

## 5. Discovered prerequisite: total guards

- [x] 5.1 Make `evalGuard` total (`src/cel/eval.ts`): a runtime error — most commonly a field not yet written into `data` — evaluates to `false`, not a throw. Required for any wait-state guard (`data.booking_status == 'booked'` is unset until the writeback lands); without it the first `resolveAutomatic` on entering the wait-state throws. Regression tests in `test/eval.test.ts`; the existing "result is out of scope" test updated from throws to `false` (scope still enforced at authoring time by `check.ts`).

## 6. Verify

- [x] 6.1 `bun run typecheck` clean; `bun test` green against a live Postgres (92 pass, 0 fail).
