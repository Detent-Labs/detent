## Context

The schema already treats timers as first-class: `step.timers[]` (`duration` XOR
`deadline`, an `onFire` of `{ actions?, targetPath? }`), `instance.timers[]` as
`{ timerId, fireAt, fired? }`, `cause: "timer"` on `HistoryEntry`, and an
authoring invariant that a timer's `onFire.targetPath` is an outgoing path of its
step. The engine does not use any of it. `transition.ts` commits transitions
(`onExit -> onPath -> onEntry`, one HistoryEntry, actions to the outbox, OCC on
`transitionSeq`) and runs instances to rest via `resolveAutomatic`; `outbox.ts`
delivers actions at-least-once with a claim/lease worker; `store.ts` owns the
`instances`/`history_entries`/`outbox` tables. `cel/eval.ts` evaluates guards and
output mappings but has no expression-to-value evaluator for `deadline`.

Timers are the missing third trigger of a transition (manual and automatic exist)
and the only bound on an automatic wait-state.

## Goals / Non-Goals

**Goals:**
- Arm timers at entry and persist `fireAt` so firing survives a restart.
- Fire a transition timer as a guard-bypassing forced transition reusing the
  existing commit/history/outbox machinery.
- Fire a reminder timer (actions, no target) as a side effect that stays put.
- Fire each timer at most once under concurrency and after a crash.
- Reuse the outbox for timer-fired actions; add no second delivery mechanism.

**Non-Goals:**
- `deadline` timers — deferred to a later change (see the deadline decision below).
  v1 arms `duration` timers only.
- Re-resolving automatic paths after an async action writeback — a separate
  prerequisite (see Context / Open Questions), not built here.
- Recurring/cron timers — the schema fires each timer once; no recurrence.
- A distributed or high-precision scheduler — a poll loop like the outbox worker
  is sufficient for v1; fire time is a lower bound, not a deadline guarantee.
- Cancellation's timer interaction beyond disarm-on-exit (cancel is Design A; a
  cancel exits the step, which already disarms).
- A dedicated audit event for a reminder fire (see Open Questions).

## Decisions

### Arm/disarm inside the transition commit
Timer arming is folded into `commitTransition`: the same transaction that sets
`{currentStepId, transitionSeq, status}` also writes the target step's armed
`instance.timers[]` (replacing the source step's) and an indexed `next_timer_at`.
Rationale: entry and arming must be atomic — a crash between them would leave a
step with no bound. Alternative (arm in a separate post-commit step) reopens the
exact crash window timers exist to close.

The same atomicity rule applies to the **initial** step, which is entered by
`createInstance`, not a `commitTransition`: its timers are armed inside the same
INSERT (with `next_timer_at`), never a separate post-INSERT UPDATE — otherwise a
crash in that window strands the timer permanently, since no worker re-arms a
running instance with a NULL `next_timer_at`. Arming is deterministic (no guard, no
actor), so it stays within `createInstance`'s persistence-only remit. If the
instance immediately transitions off the initial step, the first commit re-arms the
resting step. (This atomicity slip — initial-step arming in a separate UPDATE — was
caught by the adversarial verification pass and corrected.)

`duration` → `fireAt = entryInstant + ISO8601(duration)`. `entryInstant` is the
commit's wall clock (same `new Date()` the HistoryEntry uses). `deadline` timers
are not armed in v1 (deferred; see below).

### Poll via an indexed `next_timer_at` column, not a timers table
Source of truth for a timer stays `instance.timers[]` (the schema mandates it). To
poll efficiently without duplicating that state, `instances` gains
`next_timer_at timestamptz` = the min unfired `fireAt` on the current step,
maintained at every arm/disarm, with an index. The scheduler scans
`WHERE next_timer_at <= now()`. Rationale: one indexed predicate, no second
table to keep consistent with the jsonb. Alternative (a promoted `timers` table
mirroring the outbox) buys per-timer indexing we do not need at one-active-step
scale and adds a consistency burden against `instance.timers[]`.

### Firing reuses OCC for idempotency; no timer lease
A transition-timer fire loads the instance, then calls the same commit path as an
automatic transition with `cause: "timer"` and the target resolved from
`onFire.targetPath` — skipping guard evaluation. The commit's `WHERE
transition_seq = <loaded seq>` predicate makes two concurrent fires or a
post-crash re-scan collapse to one: the loser hits `ConcurrencyConflict` and is
dropped. Rationale: the mechanism that already prevents double transitions
prevents double fires — no separate claim/lease table like the outbox needs.
A reminder fire has no transition, so it is guarded by a conditional update that
sets the `fired` flag **without bumping the seq**, keyed on both the observed
`transition_seq` and the timer not being fired yet
(`... WHERE transition_seq = <observed> AND timer not yet fired`), enqueuing its
actions in the same transaction so enqueue and mark are atomic. The seq predicate
is load-bearing: it serializes the reminder against any concurrent transition (via
the row lock on the same predicate), so if the instance has moved off the step —
replacing `instance.timers[]` — the reminder collapses to a correct no-op instead
of flipping `fired` on a stale array. The `fired` flag alone prevents a re-fire on
a later poll of the *same* resting instance.

### Trigger ordering for a transition timer
`onFire.actions` run before the target path's own triggers:
`onFire.actions -> onExit(source) -> onPath(targetPath) -> onEntry(target)`. A
timer is a normal (if forced) exit of the step, so `onExit` still runs; the timer
actions lead because they are the reason the timer exists (escalate, notify).
Alternative (skip `onExit`, as cancel does) is rejected: cancel is an abnormal
teardown with its own `onCancel`; a timer is an ordinary transition with a
bypassed guard.

### Defer `deadline` evaluation; ship `duration` only
`deadline` is kept in the schema and stays authoring-validated (`check.ts` already
type-checks `timer.deadline`), but the engine will not arm it in v1. Rationale:
`now()`/`timestamp()`/`duration()` are forbidden in every CEL expression
(`check.ts` `FORBIDDEN_FUNCS`), so a `deadline` cannot compute a time — it can only
pass through a field that already holds an absolute timestamp, and there is no
timestamp field type to constrain that, so it type-checks as an unconstrained
string. No example uses `deadline`. Building the evaluator now would mean resolving
the field-type/coercion story for an unexercised feature. Alternative (build it
anyway) is rejected as speculative; the deferral costs nothing because the schema
and validation already stand. When a real deadline use case lands, add the
value-returning evaluator to `cel/eval.ts` and decide the timestamp coercion then.

## Risks / Trade-offs

- [Poll latency] A timer fires on the next poll tick, not exactly at `fireAt`. →
  Acceptable: business deadlines tolerate seconds of slack; the tick interval is
  configurable, mirroring the outbox worker.
- [Full-scan without the index] Scanning every running instance each tick does not
  scale. → The `next_timer_at` index makes the poll a bounded range scan.
- [Clock skew on duration] `entryInstant` is app wall-clock, not the DB clock, so
  arming and polling can use slightly different clocks. → Firing is a lower bound,
  not a hard deadline; skew only shifts the fire slightly. Revisit with `now()` at
  the DB if precision ever matters.
- [Reminder fire has no HistoryEntry] A side-effect-only fire does not fit the
  transition-shaped history. → For v1 the `fired` flag is the record; a dedicated
  audit event is deferred (Open Questions), consistent with the existing deferral
  for version-migration audit events.
- [onFire action ordering] Where `onFire.actions` sit relative to
  `onExit/onPath/onEntry` looks like a semantic choice. → Low-stakes: all actions
  deliver async post-commit via the outbox, so ordering is enqueue/audit order
  only and cannot affect the same transition's guard evaluation. Chosen order is
  `onFire.actions -> onExit -> onPath -> onEntry`.
- [Wait-state happy path absent] The engine does not re-resolve automatic paths
  after an async writeback, so an armed wait-state only ever fires its timer, never
  its result-driven path. → Out of scope here; called out as an explicit
  prerequisite (Context / Open Questions) so timers are not mistaken for a complete
  wait-state solution.

## Migration Plan

Additive only. `store.ts#initSchema` gains an idempotent `ALTER TABLE instances
ADD COLUMN IF NOT EXISTS next_timer_at timestamptz` plus its index, matching the
existing idempotent-DDL pattern. No schema-contract change, no data migration;
existing instances have `next_timer_at` NULL (no armed timers) until they next
enter a timer-bearing step. Rollback is stopping the scheduler — arming is inert
without a poller consuming it.

## Open Questions

- **Sequencing (prerequisite):** re-resolving automatic paths after an async action
  writeback is required for a wait-state's result-driven path to fire, and does not
  exist yet (`resolveAutomatic` runs only on a manual transition and at start). It
  is a separate change; this one should land after it, or ship knowing the `book`
  example's happy path stays inert until it does.
- Does a reminder-timer fire warrant a dedicated audit event, or is the `fired`
  flag plus the delivered action's `ActionOutcome` enough? Deferred; ties into the
  same open question as version-migration audit events.
- Should the scheduler and outbox worker share one poll loop/process, or run
  independently? Start independent (each has its own interval and claim model);
  consolidate only if operationally warranted.
