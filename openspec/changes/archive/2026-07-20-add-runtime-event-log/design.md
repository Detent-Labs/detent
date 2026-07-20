## Context

`HistoryEntry` (`src/schema/definition.ts:621`) is the whole runtime record today.
Its shape assumes a hop: `toStepId` is non-nullable, `fromStepId` and `pathId`
describe where the instance came from and how. `cancelInstance` already stretches it
— a synthesized hidden path with `pathId: null` — and that is as far as the shape
bends before it breaks.

Persistence is `history_entries (id, instance_id, transition_seq, entry jsonb)`
(`src/engine/store.ts:23`). The outbox writeback finds the entry to annotate by
`(instance_id, transition_seq)` (`src/engine/outbox.ts:84`), which is exact for a
transition — the seq is the OCC token and unique per hop — and wrong for anything
that does not advance the seq.

Three events do not advance it. A reminder fire deliberately does not (`fireTimer`'s
reminder branch updates `timers[i].fired` gated on the observed seq, no bump). An
unarmed timer is a non-event today. A migration rewrites the pin without a hop.

## Goals / Non-Goals

**Goals:**
- One append-only record for runtime events that are not transitions, sitting beside
  `HistoryEntry` rather than deforming it.
- Make an omitted timer observable, closing the hole `add-deadline-timers` shipped
  with, without giving up arming totality.
- Give a reminder's action outcomes a home of their own.
- Leave room for migration to add its kind additively, without touching the record's
  shape a second time.

**Non-Goals:**
- Emitting a migration event. Migration is not built; its kind lands with it. A kind
  with no emitter would be a declared invariant with no test.
- Replacing or absorbing `HistoryEntry`. Transitions keep their record.
- A general-purpose log or telemetry sink. This is the audit backbone: facts about
  an instance that are not reconstructable later.
- Retention, pruning, or archival of events.

## Decisions

**A sibling record, not a widened `HistoryEntry`.** Making `toStepId` nullable and
adding a discriminator would put "did the instance move?" behind a runtime check at
every reader, and `toStepId` being non-null is load-bearing for exactly the readers
that matter (the audit trail resolves step ids against the entry's `version`). A
separate `InstanceEvent` with its own id brand (`evt_`) keeps each record honest
about what it is. The two interleave by `at`, and correlate by `transitionSeq`.

Alternative considered: one table with a `kind` column and a union payload.
Rejected — it makes the transition record's own invariants un-expressible in Zod
without a discriminated union whose transition arm restates every existing field.

**An event never advances `transitionSeq`; it records the seq in force.** This is
what makes an event orderable against the transition record without competing with
it. `transitionSeq` stays exactly what it is — the OCC token, monotonic per
instance, one per hop — and an event is understood as "this happened while the
instance was at seq N". Several events may share a seq; that is expected, not a
collision. Ordering within a seq is by `at`.

Events sharing a sequence *and* an instant have no defined order, and that is
reachable: `commitTransition` stamps every drop it records with one `at`, so two
`timer.unarmed` events from a single entry are unordered relative to each other. The
table carries no insertion column and the id is random, so there is nothing to break
the tie with. The spec promises ordering by instant and no more; a reader that needs a
total order within an instant would need a sequence column, which nothing needs today.

**The event carries `version`, like `HistoryEntry` does.** A step or timer id in a
payload must resolve against the definition that was active, which is the whole
reason `HistoryEntry` records it. Migration will make this matter acutely.

**`TimerState` stays "armed timers".** The earlier decision was to mark the omission
on the persisted `TimerState` (`unarmed: "unresolved" | "not-an-instant"`). Having
looked at all three consumers, that is the wrong home: it answers one of them, it
overloads a record whose whole meaning is "these are the timers that will fire", and
a timer that never armed has no `fireAt` to carry. The event log answers the same
question — "which instances lost a timer, and why" — as a query over one kind,
and answers the other two as well.

**Arming reports; the caller persists.** `armStepTimers` is a pure function today and
should stay one: it runs inside the transition commit, and giving it a database
handle would put a write behind a function whose contract is "compute the armed set".
It returns the drops alongside the armed set, and the two existing call sites
(`commitTransition`, `createInstance`) write them in the same transaction that
records the entry — so an event cannot survive a rolled-back entry, and an entry
cannot land without its events.

This changes `armStepTimers`' return type, which both call sites and the tests touch.
That is a smaller cost than the alternative (a second pass over the step's timers at
each call site, re-deriving what arming already knows) and it keeps "why was this
dropped" next to the code that decided it.

**Outcome routing is carried on the outbox row, not inferred.** The writeback
currently derives its target from `(instance_id, transition_seq)`. Adding a nullable
event reference to the outbox row and preferring it when set keeps the existing path
byte-identical for transitions and makes the reminder case exact. Inferring instead
— "if this seq has an event, prefer it" — would misroute as soon as a reminder and a
transition share a seq, which is precisely the situation that motivated the change.

The derivation fails in two ways, and the second is the one that settles the design.
On a step reached by a transition it misfiles: the reminder's outcome joins that
transition's entry. On a step an instance was *created* on there is no entry to
misfile onto — `createInstance` writes none and the instance rests at sequence 0 —
so the `UPDATE` matches no row, raises nothing, and the outcome is dropped. Verified
against a running engine: an initial wait-state with a reminder reports `delivered:
1` and zero outcomes recorded. Any scheme that keeps deriving the target from the
pair has to invent a record for sequence 0; carrying the reference is simpler and
exact.

**Instance creation is idempotent, so its events must be too.** `createInstance`
inserts `ON CONFLICT DO NOTHING` — a redelivered subprocess spawn is a deliberate
no-op on the deterministic child id. Events written alongside it must not double on
that replay.

The draft of this design proposed keying the event insert so a second attempt
conflicts rather than appends. Implementation found a better answer: the INSERT's own
`RETURNING` already says whether it inserted. `ON CONFLICT DO NOTHING` returns zero
rows precisely when it did nothing, so wrapping the insert and the append in one
transaction and returning early on zero rows satisfies both halves at once — a spawn
that inserted nothing records nothing, and a replay cannot double. Deterministic event
ids would have been a second mechanism to keep correct; the rows-affected check reuses
one the row already provides. The same shape guards the other emitter, where
`fireTimer`'s OCC predicate plays the role `RETURNING` plays here.

`appendInstanceEvent` still carries `ON CONFLICT (id) DO NOTHING`, but as a backstop
against double-appending one event object — not as the mechanism above. Ids are random
per call, so it never fires today; anything that later needs conflict-based idempotency
would have to derive its id deterministically.

**Two kinds, both with emitters.** `timer.fired` and `timer.unarmed` ship because
both have a caller in this change. `migration.applied` is named in the spec's
rationale but not declared: the project's rule is that every invariant that lands
ships with a test that rejects a violating input, and a kind nothing can emit has no
such test. Adding a kind later is an additive enum change — cheap, and the reason
this change is scoped to the record shape rather than to a list of kinds.

## Risks / Trade-offs

- **A new table and record is contract surface that must be right the first time** →
  Mitigated by keeping the payload kind-specific and the envelope minimal
  (`instanceId`, `transitionSeq`, `version`, `kind`, `at`, payload). Everything
  speculative is left out; migration will exercise the shape before anything depends
  on it broadly. One field beyond that list is carried, `actions` — the outcomes of
  the actions an event enqueued, mirroring `HistoryEntry.actions`. It sits on the
  `timer.fired` arm alone rather than on the shared envelope: an unarmed timer
  enqueues nothing, so on that arm the field could only ever be null and would invite
  a reader to expect outcomes that cannot exist.
- **`armStepTimers`' signature changes again**, one change after it last changed →
  Accepted. The alternative re-derives the drop reason at the call sites, which
  duplicates the arming logic and would drift from it. Both call sites are internal.
- **Events could grow unbounded for a long-lived instance with a frequent reminder**
  → Real but out of scope: `history_entries` has the same property today and no
  retention policy exists for either. Worth solving once, for both, when it bites.
- **An event is not a substitute for alerting.** Recording an unarmed timer makes the
  stranding *queryable*, not *noticed*. The instance still hangs until someone looks
  or cancels. Say so plainly in the spec rather than implying the hole is closed.
