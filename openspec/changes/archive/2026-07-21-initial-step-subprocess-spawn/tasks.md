## 1. Constants re-homing (no behavior change)

- [x] 1.1 Move `SPAWN_ACTION_TYPE` / `RETURN_ACTION_TYPE` to `src/engine/registry.ts`; re-export both from `src/engine/transition.ts` so `subprocess.ts` and tests are untouched. Verify with `bun run typecheck` and a full `bun test` (green baseline, no new tests).

## 2. Schema: the `subprocess.spawn-enqueued` event kind

- [x] 2.1 Add the `subprocess.spawn-enqueued` member to the `instanceEvent` discriminated union in `src/schema/definition.ts`: envelope fields, strict payload `{ stepId }`, optional `actions: actionOutcome[]` (mirroring `timer.fired`'s carrier comment — only kinds that enqueue actions carry outcomes).
- [x] 2.2 Add a `test/validate.test.ts` (or sibling) case: the new kind parses with and without `actions`; an extra payload key is rejected; existing kinds still parse.

## 3. `createInstance`: enqueue the initial spawn

- [x] 3.1 In `src/engine/store.ts::createInstance`, when the body's `initialStep` resolves to a step with `type === "subprocess"`: build the spawn action (`action_spawn_<stepId>`, config `{ subprocessStepId, parentSeq: 0 }`), the `subprocess.spawn-enqueued` event (seq 0, minted event id, `startedAt` as `at`), and insert the outbox row — key `idempotencyKey(instanceId, 0, actionId)`, `event_id` = the event's id — inside the existing transaction, strictly after the `RETURNING` guard, alongside the `timer.unarmed` events. Import `idempotencyKey` and `SPAWN_ACTION_TYPE` from their leaf modules (no import of `transition.ts`).
- [x] 3.2 Keep the guard semantics exact: a conflicting INSERT (row already existed) appends no event and enqueues no row.

## 4. Tests: creation-spawn end to end (all in `test/subprocess.test.ts` or a sibling, DB-backed)

- [x] 4.1 Creation spawns: create an instance (via `startInstance`) on a definition whose initial step is a subprocess step; drain the outbox; assert the child exists with the correct `parent` link and `inputMapping`-seeded data, and the parent is parked at seq 0.
- [x] 4.2 Return drives the seq-0 parent: complete the child; drain; assert the parent's `outputMapping` writeback landed and the parent advanced off its initial step along the `child.outcome`-guarded path.
- [x] 4.3 Outcome carrier: after delivery, assert the spawn's `ActionOutcome` is on the `subprocess.spawn-enqueued` event row, and no `history_entries` row exists at `(instanceId, 0)`; assert a transition-entered subprocess spawn still attaches its outcome to the transition's HistoryEntry and records no such event.
- [x] 4.4 Idempotency: re-run the spawn delivery (or re-call `createInstance` with the same deterministic id); assert exactly one child, one spawn outbox row, one event.
- [x] 4.5 Nested chain: a child whose own initial step is a subprocess step spawns a grandchild on drain; returns propagate upward to rest.
- [x] 4.6 Cancelled-before-delivery: cancel the freshly created parent before draining; assert delivery is a no-op and no child is created.
- [x] 4.7 Ordinary creation control: an instance on a non-subprocess initial step records no `subprocess.spawn-enqueued` event and enqueues nothing at creation.

## 5. Verification and docs

- [x] 5.1 `bun run typecheck` and a full `bun test` with `DATABASE_URL` set (full suite, not single-file — read the verdict off named failures, not the pass count).
- [x] 5.2 Update `CLAUDE.md` (remove the "subprocess step as the initial step does not spawn" Remaining item; note the new event kind and the constants' new home) and the README status table if it mentions the gap. Keep `openspec/config.yaml` context current if it restates the gap.
