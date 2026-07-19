## 1. Idempotency key primitive

- [x] 1.1 Add `src/engine/idempotency.ts`: `idempotencyKey(instanceId, transitionSeq, actionId)` = UUIDv5 (sha1 via `node:crypto`) of the three joined coordinates under a fixed namespace UUID. No new dependency.
- [x] 1.2 Test: the key is deterministic (same inputs → same UUIDv5) and is a valid v5 UUID; different `actionId` yields a different key.

## 2. Outbox table

- [x] 2.1 Extend `initSchema` (`src/engine/store.ts`) with an idempotent `CREATE TABLE IF NOT EXISTS outbox`: `idempotency_key` (PK/UNIQUE), `instance_id`, `transition_seq`, `action_id`, `action` (jsonb `{type,config}`), `status` (`pending`/`delivered`/`dead-letter`, default `pending`), `attempts` (int, default 0), `next_attempt_at` (timestamptz, default now()), `created_at`, `delivered_at` (nullable). Index for the claim query (`status`, `next_attempt_at`).
- [x] 2.2 Test: `initSchema` is idempotent (runs twice, no error) and the `outbox` table exists with the UNIQUE `idempotency_key`.

## 3. Enqueue in the commit transaction

- [x] 3.1 In `executeManualTransition` (`src/engine/transition.ts`), replace the pre-commit no-op `dispatch` loop: build one outbox row per `orderedTriggerActions` entry (idempotency key from task 1, `transition_seq = nextSeq`), and INSERT them **inside the existing `db.begin` block**, after the history insert.
- [x] 3.2 Delete the `dispatch` seam and its `ponytail:` comment (`transition.ts:33-34`).
- [x] 3.3 Test: a committed transition with K ordered actions persists exactly K `pending` outbox rows tagged with the committed `transitionSeq`, one per action.
- [x] 3.4 Test: a transition rejected as a concurrency conflict (stale `transitionSeq`) writes zero outbox rows (no partial write).

## 4. Delivery worker

- [x] 4.1 Add `src/engine/outbox.ts`: `deliver(row)` handler seam (invoke + return; trivial/idempotent for now — the handler-registry change replaces the body) and `startOutboxWorker(db)` returning a stop handle.
- [x] 4.2 Claim loop: `SELECT … WHERE status='pending' AND next_attempt_at <= now() … FOR UPDATE SKIP LOCKED`, invoke `deliver`, on success mark `delivered` (+ `delivered_at`).
- [x] 4.3 Failure path: on a thrown delivery, increment `attempts` and set `next_attempt_at` to an exponential backoff; at `attempts >= MAX_ATTEMPTS` set `status='dead-letter'`. Pick concrete `MAX_ATTEMPTS` and backoff constants here.
- [x] 4.4 Test: a `pending` row is delivered once and marked `delivered`; a second poll does not redeliver it.
- [x] 4.5 Test: undelivered rows survive a simulated restart (rows remain `pending`, a fresh worker delivers them).
- [x] 4.6 Test: a `deliver` that always throws increments `attempts` with backoff and, after `MAX_ATTEMPTS`, lands in `dead-letter` and is no longer claimed.

## 5. Verify

- [x] 5.1 `bun test` green (including the Postgres-backed outbox tests) and `bun run typecheck` clean.
- [x] 5.2 `openspec validate transactional-outbox --type change` passes.
