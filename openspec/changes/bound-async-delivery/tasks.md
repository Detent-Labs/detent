## 1. Bound delivery with the claim lease

- [ ] 1.1 In `src/engine/outbox.ts`, add a `rejectAfter(ms)` helper and race it
  against `deliverFn(row, registry)` at `:179`, using the `leaseMs` parameter
  `drainOutbox` already takes
- [ ] 1.2 Let the rejection fall into the existing catch at `:180-183`, so it
  lands in the transient-failure branch with backoff — add no new branch and no
  new state
- [ ] 1.3 Clear the deadline timer when the delivery settles, so a completed
  pass does not keep a pending timer alive per delivered row
- [ ] 1.4 Comment the abandonment explicitly: `Promise.race` does not cancel
  the handler; the handler's own timeout is what releases its socket, and every
  state write happens on the racing path

## 2. Give `http.request` its own bound

- [ ] 2.1 In `src/handlers/http.ts`, add a module constant for the default
  timeout, set well under `CLAIM_LEASE_MS`, and build the `AbortController`
  unconditionally (`:61-64`) — the action's declared `timeout` overrides the
  default rather than deciding whether one exists
- [ ] 2.2 Move the `clearTimeout` out of the `finally` at `:74-76` to after the
  body is consumed at `:97`, so the abort stays armed across
  `response.json()` / `response.text()`
- [ ] 2.3 Refuse a response whose `content-length` exceeds a declared maximum
  before reading it, and read an unlabelled body against a byte budget;
  classify an over-size response as `PermanentError`
- [ ] 2.4 Declare both limits as named constants beside the timeout, each with
  a one-line comment naming what it is sized against

## 3. Make the dead-letter cap reachable

- [ ] 3.1 Add `attempts = outbox.attempts + 1` to the tx1 claim UPDATE
  (`outbox.ts:150`); `RETURNING attempts` at `:159` then yields the
  post-increment value
- [ ] 3.2 Replace `const attempts = row.attempts + 1` at `:171` with
  `row.attempts`, and check every later use (`:189`, `:226`, `:228`, `:229`,
  `:233`, `:236`, `:237`) reads the same value
- [ ] 3.3 Leave the per-row `catch {}` at `:242-245` as it is — it must still
  not mark the row; the increment now happens at claim, which is not a second
  write
- [ ] 3.4 Re-read the retry/backoff tests: `backoffMsFor(row.action, attempts)`
  now receives the same number by a different route, so any test asserting an
  exact backoff sequence must still hold — if one changes, the change is
  meaningful and must be understood, not adjusted

## 4. Progress markers in the timer and resolution workers

- [ ] 4.1 In `src/engine/timers.ts`'s per-instance `catch` (`:53-56`) and the
  two `continue` paths (resolver miss, no due timer — the miss only), push the
  row out of the scan:
  `UPDATE instances SET next_timer_at = now() + interval '1 minute'
   WHERE instance_id = $1 AND next_timer_at = $2`, predicated on the value this
  pass read
- [ ] 4.2 Do **not** push on the "no due timer" path — that is a normal
  outcome, not a failure
- [ ] 4.3 In `src/engine/resolution.ts`, remove the `requeue` calls at `:86`
  and `:100` and leave the row `claimed`, so the existing lease predicate at
  `:63` is the retry cadence
- [ ] 4.4 Update the comment at `:72-74`, which documents the removed requeue
  as deliberate
- [ ] 4.5 Confirm the writeback's `resolve_state = 'pending'` re-flag still
  wins over a `claimed` row left behind by a failure (it sets `pending`
  unconditionally), so a legitimately re-flagged instance is not delayed by a
  lease

## 5. Type-check the `Action.output` writeback

- [ ] 5.1 Extract the type rule `src/runtime/api.ts::typeMatches` applies so
  the outbox can call it without importing the submission path wholesale — a
  shared helper, not a copy
- [ ] 5.2 In `drainOutbox`'s writeback loop (`:199-224`), resolve each patch
  key to its `FieldDef` in the row's body and check the value; skip the
  `jsonb_set` for a mismatching entry
- [ ] 5.3 Record dropped targets in the `ActionOutcome` written at `:226`, and
  keep the row `succeeded` — the side effect already happened
- [ ] 5.4 Keep the suppression accounting correct: a patch whose entries were
  all dropped must not be reported as a version-suppressed writeback, since
  those are different facts

## 6. Make `evalFieldMap` total per entry

- [ ] 6.1 In `src/cel/eval.ts`, change `evalFieldMap` to return
  `{ patch, drops }` with a per-entry `try`, mirroring `evalTransforms`
  (`:122-146`) including its `coerceJson` failure branch
- [ ] 6.2 Rewrite the docblock at `:213-217`: the "not total, surfacing an
  authoring error" justification is what this change removes
- [ ] 6.3 Update both call sites in `src/engine/subprocess.ts` (`:100` spawn
  input, `:188` return output) to consume the new shape and write a
  `mapping.entry-dropped` event per drop, in the same transaction as the
  spawn's/return's commit
- [ ] 6.4 Check the third caller path (`evalOutputMap` at `eval.ts:205-206`,
  used for `Action.output`) — decide explicitly whether it takes the drops or
  keeps today's behavior, and say which in the code. It writes into the
  outbox writeback, which task 5 already gives a drop mechanism, so it should
  not grow a second one

## 7. The new event kind

- [ ] 7.1 Add `mapping.entry-dropped` to the `InstanceEvent` union in
  `src/schema/definition.ts`, payload `{ fieldId, direction, reason }` with
  `direction: "input" | "output"` and the same reason vocabulary
  `migration.transform-dropped` uses
- [ ] 7.2 Keep the payload `.strict()`, matching every sibling kind
- [ ] 7.3 Confirm the admin record view renders an unknown-to-it kind
  gracefully, or add the kind to its rendering — `packages/admin` reads the
  merged record

## 8. Tests

- [ ] 8.1 A handler that never settles: the drain pass completes, the row is
  marked transient with backoff, and a subsequent pass runs. Use a real
  never-resolving promise, not a mock — the suite has no mocking and must keep
  none
- [ ] 8.2 Unrelated rows, including a `core.spawnSubprocess` row, are
  delivered in the presence of a hung row
- [ ] 8.3 A row claimed and abandoned (lease expiry, no tx2) shows an
  incremented `attempts`, and repeated abandonment dead-letters it
- [ ] 8.4 `http.request` with no declared `timeout` against a never-responding
  capture server aborts at the default; a server that stalls after headers is
  also aborted
- [ ] 8.5 An over-size response dead-letters and writes nothing into `data`
- [ ] 8.6 A failing timer instance is not re-selected on the next pass, and a
  concurrently re-armed timer survives the push
- [ ] 8.7 A failing resolution instance is not re-claimed until its lease
  expires, and other claimed instances in the same pass still process
- [ ] 8.8 A handler returning `"5"` for a `number`-typed output target leaves
  `data` unchanged for that field, marks the row delivered, and records the
  drop in the outcome
- [ ] 8.9 A subprocess `inputMapping` over an unset optional field spawns the
  child without that field and records a `mapping.entry-dropped` event; the
  mirrored `outputMapping` case on return
- [ ] 8.10 A fully evaluable mapping records no event (the negative case that
  keeps the drop from becoming routine)

## 9. Documentation

- [ ] 9.1 `docs/current-state.md`: the outbox entry (deadline, claim-time
  increment, writeback type check), the timer and resolution worker entries
  (progress markers), and the runtime-events entry (the ninth... tenth kind —
  count it, do not guess)
- [ ] 9.2 `CLAUDE.md`: the runtime-record paragraph enumerates the event kinds
  and states which carry `ActionOutcome`s — add `mapping.entry-dropped` to
  both lists
- [ ] 9.3 `CLAUDE.md`: the guard-totality rule and the mapping fatality
  currently contradict each other; after this change they agree, so state the
  mapping rule beside it

## 10. Verification

- [ ] 10.1 Run `bun run typecheck` from the repo root and confirm it passes
- [ ] 10.2 Run the FULL `bun test` suite with `DATABASE_URL` set, from the
  repo root, and confirm it passes — check the skip count, not only the pass
  count
- [ ] 10.3 Verify each new test fails without its fix, on a scratch copy of the
  tree — never by mutating the shared working tree
- [ ] 10.4 Confirm the existing interleaved-transaction outbox tests
  (`test/outbox.test.ts:297` and its neighbours) still pass unchanged: they
  pin the claim/CAS contract this change edits
