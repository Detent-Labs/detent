# Make asynchronous execution bounded, terminating and visible

## Why

The engine's synchronous half is carefully bounded: transactions, row locks,
optimistic concurrency, lease-based claims. Its asynchronous half — the outbox
worker, the timer scheduler, the resolution worker — has five places where a
single bad row or a single unresponsive target is unbounded, non-terminating,
or silently wrong.

**One unresponsive HTTP target stops all delivery, engine-wide.** `drainOutbox`
awaits `deliverFn(row, registry)` with no engine-imposed deadline
(`outbox.ts:179`), and `pollForever` awaits the whole tick before scheduling
the next (`poll.ts:8-16`) — a tick that never returns is never followed by
another. The only bound on handler runtime is author-supplied and optional:
`const controller = ctx.action.timeout ? new AbortController() : undefined`
over an optional `timeout`, so the default is an unbounded `fetch`.
`startEngine` creates exactly one outbox worker, so a target that accepts the
connection and never responds stops **all** action delivery — including the
engine-internal `core.spawnSubprocess`/`core.returnSubprocess` rows, so every
subprocess parent parks permanently and every `Action.output` writeback stops.
`stop()` does not recover it (it clears a `setTimeout` that is not pending),
and lease reclaim does not either (the only worker that could reclaim is the
stuck one). Two aggravating details: the abort timer is cleared in `finally`
*before* the body is read (`http.ts:74-76`), so even an action that *does*
declare a timeout can hang at `await response.json()`; and the response body
is read with no byte budget before being persisted into jsonb.

**The dead-letter cap is unreachable for the failure class that needs it
most.** The tx1 claim UPDATE sets only `status`/`claimed_at`; the increment is
in-memory (`const attempts = row.attempts + 1`) and persisted only by the
three tx2 branches. Any delivery that never reaches tx2 — the handler killed
the process, or the lease expired and a peer reclaimed — leaves `attempts`
unchanged, so the row is re-claimed at the same count forever and
`attempts >= maxAttemptsFor(...)` is never satisfied. The per-row `catch {}`
has the same effect for a systematically failing tx2. Because the claim query
is `ORDER BY created_at`, the poison row is claimed first on every pass.

**Timer and resolution workers requeue a failing instance with zero delay.**
`drainTimers` selects due rows `ORDER BY next_timer_at LIMIT 100` and, on any
per-instance failure, leaves the row untouched — `next_timer_at` is still due,
so it is re-selected every 500 ms forever. `drainResolutions` has the same
shape with an *explicit* immediate requeue to `pending`, against a scan
ordered `ORDER BY instance_id LIMIT 100`. Neither has a delay or an attempt
counter, unlike the outbox. Both scans are capped at 100 and ordered by a key
a stuck row keeps winning, so one hundred stuck rows starve every other
instance permanently, and one stuck row is a 2 Hz write loop with no
diagnostic. The triggers are ordinary: a stored body failing `instanceSchema.parse`
after a schema tightening, a missing `definitions` row after a partial
restore, the hash-mismatch throw in `resolution.ts:92-93`.

**`Action.output` writebacks are shape-checked nowhere.** Output sites are
collected with no `expect` type at publish, and at delivery the writeback is a
raw `jsonb_set` with no validation — unlike a participant submission, which
goes through `typeMatches`/`optionValuesValid`/`checkConstraints`. A handler
returning `"5"` for a `number` field writes a string into `data` permanently;
guards reading it were type-checked as `double`, so at runtime the comparison
raises, `evalGuard` catches it and returns `false`, and the instance parks on
its wait-state with no fault event and no dead-letter — the exact "silent,
per-instance, parked forever" failure `definitions.ts:176-181` names as the
reason publish-time validation exists.

**A declared-but-unwritten field is total in a guard and fatal in a mapping.**
`buildGuardContext` populates `data` only with keys present in `instance.data`,
and cel-js raises on a missing map key. `evalGuard` swallows it (the documented
wait-state idiom) and `evalTransforms` swallows it per entry — its docblock
naming the cause: "a transform that raises — most often reading a field the
mid-flight instance never wrote". `evalFieldMap`, used for both subprocess
`inputMapping` and `outputMapping`, throws instead. Nothing at publish can
distinguish "declared" from "always written". So a subprocess step whose
`inputMapping` reads an *optional* field publishes cleanly and fails at
runtime whenever that field is unset: the spawn row throws, retries — redoing
the handler's work each time — dead-letters, and leaves the parent parked with
no `instance.faulted` event. The same input that parks a guard benignly kills
a mapping terminally, and the repo already conceded the identical hazard on
the transforms path.

## What Changes

- `drainOutbox` races `deliverFn` against a deadline derived from the claim
  lease, so a hung handler becomes an ordinary transient failure instead of a
  stopped engine.
- `http.request` gets an unconditional default timeout (a module constant well
  under `CLAIM_LEASE_MS`) when the action declares none, keeps its
  `AbortController` armed across the body read rather than clearing it in
  `finally`, and caps the response body it will read.
- The outbox tx1 claim UPDATE increments `attempts`, so every claim —
  completed or abandoned — costs one attempt and the dead-letter cap is
  reachable for a worker-killing handler.
- The timer scan pushes a failing instance out of the batch with a bounded
  delay, predicated on the observed `next_timer_at` so a concurrent re-arm is
  not clobbered. The resolution worker stops requeueing to immediately-eligible
  `pending` and lets its existing lease be the retry cadence.
- The `Action.output` writeback checks each patch value against its target
  field's declared type at delivery, and drops-with-an-outcome rather than
  writing a value the submission validator would have rejected.
- `evalFieldMap` becomes total per entry the way `evalTransforms` is: it
  returns `{ patch, drops }`, skips a target whose expression raises, and the
  caller records a `mapping.entry-dropped` event — a sibling of
  `migration.transform-dropped`.

## Capabilities

### Modified Capabilities

- `transactional-outbox`: delivery is deadline-bounded; the attempt count
  advances at claim time rather than only at completion; a writeback value is
  type-checked against its target field before it is written.
- `http-action-handler`: a timeout always applies, spans the response body
  read, and the response body is size-bounded.
- `timers`: a failing instance leaves the due scan for a bounded interval
  instead of being retried immediately and forever.
- `writeback-reresolution`: a failing instance is not returned to
  immediately-eligible `pending`.
- `subprocess-execution`: an input/output mapping entry that raises is dropped
  rather than failing the whole spawn or return.
- `runtime-events`: adds the `mapping.entry-dropped` kind.

## Impact

- `src/engine/outbox.ts` — the deadline race, the tx1 increment, the writeback
  type check. This file carries most of the change.
- `src/handlers/http.ts` — default timeout, abort across the body read,
  response-size cap.
- `src/engine/timers.ts`, `src/engine/resolution.ts` — the progress markers.
- `src/cel/eval.ts` — `evalFieldMap`'s return shape; `src/engine/subprocess.ts`
  — both call sites and the event write.
- `src/schema/definition.ts` — the new `InstanceEvent` kind (additive, per the
  record's stated additive-kind rule).
- **Behavior change visible to operators**: rows that previously retried
  forever now dead-letter, which is the point — they will appear in the admin
  outbox listing. A deployment carrying such rows today will see them
  terminate after this lands.
- **Behavior change visible to authors**: a subprocess mapping over an unset
  optional field now spawns/returns with that field omitted and an event
  recorded, instead of dead-lettering. Guards on the parent that expected the
  value stay parked exactly as a guard over an unwritten field already does.
- Tests: an interleaved-transaction test for the deadline (a handler that
  never resolves must not stop the next tick), a claim/abandon test for the
  attempt increment, per-worker progress-marker tests, a writeback
  type-mismatch test, and a mapping-drop test with its event assertion.
