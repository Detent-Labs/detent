## Context

The engine's asynchronous side is three poll loops over Postgres: the outbox
worker (claim-with-lease, deliver, CAS-mark), the timer scheduler (scan due
`next_timer_at`, fire one timer per instance per pass), and the resolution
worker (claim-with-lease, re-drive automatic evaluation). All three were built
with per-row error boundaries, which is why a single corrupt row does not
abort a pass. What none of them has is a *progress marker*: something that
changes as a result of a failed attempt, so the next pass sees a different
state than the last one.

The outbox has the machinery — `attempts`, `next_attempt_at`, `backoffMsFor`,
a dead-letter terminal state — but the increment lands only on the paths that
complete, so the machinery is bypassed exactly when the failure is severe
enough to skip it. The timer and resolution workers have none of it and
requeue at once. And the delivery call itself has no upper bound at all, which
turns "one slow target" into "the engine's asynchronous half stopped".

The two data-mapping defects are the same shape one level up: a value crosses
a boundary without being checked (`Action.output` into `data`), or a mapping
that should degrade instead terminates (`evalFieldMap`). The repo has already
made both calls correctly elsewhere — participant submissions are validated
field-by-field, and `evalTransforms` drops per entry with a recorded event —
so both fixes are "apply the decision that already exists" rather than new
policy.

## Goals / Non-Goals

**Goals:**

- No single row, instance or remote target can stop or starve a worker.
- Every failed attempt makes observable progress: a counter, a delay, or a
  terminal state.
- A value entering `instance.data` from a handler is checked the way a value
  entering it from a participant is.
- A mapping over an unwritten optional field degrades like a guard does,
  visibly.

**Non-Goals:**

- Structured logging or metrics. Observability is ROADMAP stage 15 and
  deliberately deferred; this change adds *state* a future observer can read
  (attempts, dead-letter, events), not the observer.
- Multiple outbox workers, or a worker pool. One worker per process is the
  current design; the deadline makes that design safe rather than replacing
  it.
- Reworking the SSRF posture of `http.request`. It is a documented, argued
  trade-off whose revisit condition has arguably been met now that Studio
  publishes from a browser — recorded as an open question, not decided here.
- Publish-time `expect` typing for `Action.output` expressions. It catches
  very little on its own (the output environment registers `result` as `dyn`,
  so `result.foo` infers `dyn` and passes regardless) and would create the
  impression the delivery-time check is redundant.
- Changing guard totality, `evalTransforms`, or the wait-state idiom. Those
  are the model this change conforms *to*.

## Decisions

**Bound delivery with the lease the claim already carries.**
`patch = await Promise.race([deliverFn(row, registry), rejectAfter(leaseMs)])`
puts the rejection into the existing transient-failure branch, so a hung
handler retries with backoff and eventually dead-letters like any other
failure — no new state, no new branch. The lease is the right value because it
is already the point at which a peer may reclaim the row: a delivery still
running past its lease is a delivery whose row is no longer exclusively its
own, so continuing to await it is meaningless. Choosing a *shorter*
engine-wide constant would be an arbitrary second timeout that the lease then
contradicts.

**The race does not cancel the handler.** `Promise.race` abandons the promise;
it does not abort the underlying `fetch`. That is acceptable because the row
is marked from the racing path and redelivery is idempotency-keyed, and it is
why the handler *also* gets its own timeout (below) — the handler-side timeout
is what actually releases the socket. Stating this explicitly matters: a
reader who assumes `Promise.race` cancels would think the handler-side default
timeout is redundant.

**`http.request` gets a default timeout, armed across the body read.** Today
the `AbortController` exists only when the author declared a `timeout`, and it
is cleared in a `finally` that runs *before* `await response.json()`. Both are
fixed: a module constant applies when the action declares none, and the timer
is cleared after the body is consumed. The constant is set well under
`CLAIM_LEASE_MS` so the handler-side bound fires first and produces a clean
`AbortError` rather than the engine's less specific deadline rejection.

**Cap the response body.** The handler reads an arbitrary remote response and
persists it into jsonb via `Action.output`. Rejecting an over-limit
`content-length` covers the honest case, and reading with a byte budget covers
the chunked one; both classify as a permanent failure, since a target that
returns more than the cap will do so again.

**Increment `attempts` in the tx1 claim UPDATE.** Adding
`attempts = outbox.attempts + 1` makes `RETURNING attempts` yield the
post-increment value, so `row.attempts` replaces the in-memory
`row.attempts + 1` at every use. Every claim then costs one attempt whether or
not it completes — which is precisely the property the dead-letter cap needs.
This does not conflict with the deliberate "do not mark the row from the
catch" rule: it is not a second write, it is the same write the claim already
performs. The cost is that a row whose delivery succeeds after a lease-expiry
reclaim shows an attempt count one higher than deliveries actually attempted;
the counter's job is to terminate a bad row, not to be an exact delivery
census.

**Timers: push the row out of the scan, predicated on the observed value.**
`UPDATE instances SET next_timer_at = now() + interval '1 minute'
WHERE instance_id = $1 AND next_timer_at = $2` — the predicate is what makes
it safe. A concurrent `fireTimer` or a step entry that re-armed the timer has
already changed `next_timer_at`, so the push matches zero rows and clobbers
nothing. One minute is chosen as "long enough that a stuck row stops being a
2 Hz write loop, short enough that a transient fault self-heals within a
human's attention span"; it is not tuned and does not need to be.

**Resolution: stop requeueing to `pending`; leave the row `claimed`.** The
existing lease predicate already reclaims a `claimed` row after
`leaseMs`, which is exactly the retry cadence the requeue was trying to
provide — except the requeue makes the row *immediately* eligible again, which
is the bug. Leaving it claimed reuses machinery that is already tested rather
than adding a `resolve_next_at` column. The trade-off is that a genuinely
transient failure now waits up to one lease instead of retrying at once; for a
worker whose job is to re-drive a parked wait-state, that is not a latency
anyone can observe.

**Validate the writeback at delivery, not only at publish.** Delivery is where
the value actually exists — publish sees `dyn`. The check reuses `api.ts`'s
`typeMatches` logic so a handler-supplied value faces the same rule a
participant-supplied one does; there is no argument for two different
definitions of "a number field holds a number". A mismatching entry is
**dropped and recorded in the `ActionOutcome`**, not written and not retried:
retrying would call the handler again for a result that will fail the same
way, and writing would leave `data` in a state the submission validator would
reject.

**Drop the entry, do not fail the row, on a type mismatch.** The delivery
itself succeeded — the remote side did its work — so failing the row would
re-run a side effect that already happened. Recording the drop in the outcome
keeps the fact in the audit record, which is where an operator looks.

**`evalFieldMap` becomes total per entry, mirroring `evalTransforms`.** Same
return shape (`{ patch, drops }`), same per-entry `try`, same reason. The
current docblock justifies fatality as "surfacing an authoring error rather
than silently dropping the field"; that justification is false for the case
that actually occurs, because publish *cannot* distinguish a field that is
declared from one that is always written — the catalog has no such notion and
requiredness lives per-step in the view. So the "authoring error" the fatality
claims to surface is often not an error at all, and the surfacing mechanism
(a dead-lettered spawn and a parked parent with no fault event) is the worst
available one. The drop is not silent: it is an `InstanceEvent`.

**A new event kind, `mapping.entry-dropped`, rather than reusing
`migration.transform-dropped`.** The record's kinds are a discriminated union
with kind-specific payloads and an explicitly additive policy. Reusing the
migration kind would misattribute the event to a migration that did not
happen. The payload names the `fieldId`, the direction (`input` | `output`),
and the reason, matching the transform kind's shape. Like its sibling it
enqueues no action, so it carries no `ActionOutcome`.

## Risks / Trade-offs

- **Rows that retried forever now dead-letter**, and will show up in the admin
  outbox listing on the first deployment after this lands → Intended; that is
  the finding. Worth announcing, because the listing will look worse before it
  looks better.
- **A slow-but-legitimate handler that runs past the lease now fails** →
  Correct behavior: past the lease its row can be claimed by a peer, so the
  work was already unsafe to complete. An action that legitimately takes
  minutes should declare its own `timeout` and the deployment should raise
  `CLAIM_LEASE_MS`, which is a deliberate, visible knob.
- **The abandoned promise keeps running after the race rejects** → Named in
  Decisions; the handler-side timeout is what releases the socket. The
  abandoned continuation writes nothing, since all writes happen on the
  racing path.
- **The attempt counter overcounts** for a delivery that completed after a
  reclaim → Accepted; see Decisions.
- **The one-minute timer push delays a legitimately re-armed timer** if the
  predicate ever fails to match for an unexpected reason → Bounded to one
  minute, and the predicate is exact equality on a value the same pass just
  read.
- **A mapping drop can leave a child instance missing an input the child's own
  required-check would have demanded** → The child's step-level required check
  still applies at its first submission, so the failure surfaces there, to a
  participant, with a validation message — instead of as a dead-lettered spawn
  no participant can see. That is a strict improvement in where the error
  lands.
- **Two behavior changes are visible to authors at once** (mapping drops,
  writeback drops) and both are silent-by-design in the happy path → Both are
  recorded: one as an `InstanceEvent`, one in the `ActionOutcome`. The admin
  record is the surface where an author sees them, and it already renders both
  kinds of row.

## Migration Plan

No schema migration for the workers: `attempts`, `next_attempt_at`,
`next_timer_at`, `resolve_state` all exist. The new event kind is additive to
a jsonb-stored union, so no DDL.

1. Land the outbox changes (deadline, claim increment, writeback check) and
   the handler changes together — the deadline without the handler timeout
   would leave sockets open, and the handler timeout without the deadline
   would still not bound a non-`http` handler.
2. Land the worker progress markers in the same change; they are independent
   of each other but share the "no unbounded retry" requirement.
3. Before deploying, check the outbox for rows with a high `attempts` and a
   repeating `last_error` — those are the rows that will dead-letter first.
   The admin console's retry/discard controls already exist for them.
4. Rollback is reverting the commit. Dead-lettered rows stay dead-lettered
   (they are a terminal state by design) and can be retried from the admin
   console; recorded `mapping.entry-dropped` events remain readable because
   the event schema tolerates unknown kinds on read only if it already does —
   verify this before rollback, since the record's kinds are `.strict()`.

## Open Questions

- Should the `http.request` SSRF trade-off be re-opened now that Studio
  publishes definitions from a browser? Its design spec's own revisit
  condition ("if definitions could originate from a less-trusted authoring
  source") has arguably been met. Deliberately not decided here: it is a
  policy decision about outbound network access, not a boundedness fix, and it
  deserves its own change.
- Should a dead-lettered `core.spawnSubprocess` / `core.returnSubprocess` row
  also park its parent `faulted`, rather than leaving it waiting forever? The
  parent currently waits with only an `ActionOutcome` in its record. Out of
  scope here, but the `mapping.entry-dropped` event makes the failure visible
  enough to decide it later on evidence.
