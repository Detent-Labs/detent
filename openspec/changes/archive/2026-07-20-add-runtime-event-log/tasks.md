## 1. The record

- [x] 1.1 Add `instanceEventId` (brand, `evt_` prefix) and `instanceEvent` to
      `src/schema/definition.ts`: `{ id, instanceId, transitionSeq, version, kind,
      at, payload }`, plus `actions` (the outcomes the event's actions produced) on
      the `timer.fired` arm alone — an unarmed timer enqueues nothing, so that arm
      would carry a permanently-null field.
      Keep the envelope minimal and the payload kind-specific — a
      discriminated union over `kind`, so a payload cannot be attached to the wrong
      kind. Generate the id the way the other runtime ids are generated today
      (`crypto.randomUUID()`, i.e. v4): the contract calls for UUIDv7 but nothing
      uses it yet and `src/engine/store.ts` documents that deferral — do not
      introduce a third convention here.
- [x] 1.2 Declare exactly two kinds: `timer.fired` (payload names the timer) and
      `timer.unarmed` (payload names the timer and the reason: expression raised vs
      value was not an instant). Do NOT declare a migration kind — nothing emits it
      yet, so it would be an invariant with no test.
- [x] 1.3 Rejecting tests in `test/validate.test.ts` (or a new `test/events.test.ts`):
      a wrong id prefix, a payload that does not match its `kind`, and a missing
      `version`.

## 2. Persistence

- [x] 2.1 Add the `instance_events` table to `initSchema` in `src/engine/store.ts`,
      shaped like `history_entries` (id PK, instance_id, transition_seq, event jsonb).
      Index what the spec promises is queryable: instance_id, and the event kind.
- [x] 2.2 A small append helper, usable inside an existing transaction — every
      emitter writes in the same commit as the state change that caused it.

## 3. Arming reports what it dropped

- [x] 3.1 Change `armStepTimers` to return the armed set **and** the drops (timer id
      + reason) instead of the armed set alone. It stays pure — no database handle.
- [x] 3.2 `commitTransition` (`src/engine/transition.ts`) persists the drops as
      `timer.unarmed` events inside the transaction that writes the entry.
- [x] 3.3 `createInstance` (`src/engine/store.ts`) does the same inside the INSERT
      transaction, so an initial step's dropped timer is recorded too. Its INSERT is
      `ON CONFLICT DO NOTHING` (a redelivered subprocess spawn is a deliberate no-op
      on the deterministic child id) — a spawn that inserted nothing must record
      nothing, and a replay must not double the events. Both follow from the INSERT's
      own `RETURNING`: zero rows means it inserted nothing, so return before
      appending. Test the replay explicitly.
- [x] 3.4 Distinguish the two reasons at the point that knows them: the `catch`
      around evaluation versus a null from `instantFromValue`. Do not re-derive the
      reason later.
- [x] 3.5 Confirm arming is still total — a drop must not fail the entry. This is the
      guarantee most at risk from this change; assert it, do not assume it.

## 4. Reminder fire emits an event

- [x] 4.1 In `fireTimer`'s reminder branch, record a `timer.fired` event in the same
      transaction that sets the `fired` flag and enqueues the actions.
- [x] 4.2 Keep the existing guards intact: the update is still gated on the observed
      `transitionSeq` and on the timer not already being `fired`, so a redundant fire
      remains a no-op — and must not emit a second event.

## 5. Outcome routing

- [x] 5.1 Add a nullable event reference to the outbox row; the reminder path sets it,
      the transition path leaves it null.
- [x] 5.2 In `src/engine/outbox.ts`, write the `ActionOutcome` to the referenced event
      when set, to the `HistoryEntry` by `(instance_id, transition_seq)` otherwise.
      The transition path must stay byte-identical.
- [x] 5.3 Regression test: a reminder fire and a transition sharing one
      `transitionSeq` — each outcome lands on its own record, neither on the other's.
      This is the defect that motivated the change; it needs a test that fails without
      the routing.
- [x] 5.4 Regression test for the sharper case: a reminder on the step an instance
      was CREATED on (sequence 0, no `HistoryEntry`). Today the outcome is discarded
      entirely — verified: `delivered: 1`, zero outcomes recorded. Assert it now lands
      on the event. Without this test the total-loss case stays uncovered, since the
      misfiling test passes even when sequence 0 still drops.

## 6. Tests

- [x] 6.1 Ordering: several events at one `transitionSeq` are all retained and
      ordered by `at`; the instance's seq is unchanged by any of them.
- [x] 6.2 Atomicity: a failed commit leaves neither the state change nor its events.
- [x] 6.3 Queryability: the `timer.unarmed` kind returns every instance that dropped
      a timer, with timer and reason.
- [x] 6.4 A step whose timers all arm records no `timer.unarmed` event.
- [x] 6.5 Mutation-check each new assertion: revert the emitter, confirm a NAMED test
      fails, restore. A test not observed failing is not a test.
- [x] 6.6 `bun run typecheck` clean and `bun test` green **with `DATABASE_URL` set**.
      Without it the DB-backed suites skip silently and report a false green.

## 7. Documentation

- [x] 7.1 CLAUDE.md: remove "Record an unarmed deadline" from "Decided, not yet
      built"; describe `InstanceEvent` in the runtime-record section; resolve the
      open question about an audit event type for non-transition events, noting that
      migration adds its kind additively.
- [x] 7.2 Note in the migration roadmap entry that its audit event is now a kind to
      add, not a mechanism to design.
- [x] 7.3 Run `/opsx:verify`, then archive.
