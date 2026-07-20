## Context

`Timer` has carried `duration` XOR `deadline` since the contract landed. The
engine implements only the `duration` half: `armStepTimers` (src/engine/duration.ts)
filters `(t) => t.duration` and drops everything else. A published definition with
a deadline timer is accepted by both `processVersion.safeParse` and
`validateProcessBody` (src/cel/check.ts already collects and type-checks
`timers[].deadline` in guard scope) and then silently never fires.

Everything downstream of arming is already deadline-agnostic. `TimerState` is
`{ timerId, fireAt, fired? }` with no notion of where `fireAt` came from;
`minFireAt`, the `next_timer_at` column, the poll scheduler, `fireTimer`, and the
fire-once OCC all operate on `fireAt` alone. So the whole change is confined to
the moment of arming.

There are exactly two arming call sites, and both already hold what a deadline
needs: `commitTransition` (src/engine/transition.ts) has the `ProcessBody` and the
pre-transition `Instance`; `createInstance` (src/engine/store.ts) has the body and
the seed data.

## Goals / Non-Goals

**Goals:**
- Arm `deadline` timers at step entry from a CEL expression over the entry-time
  context, producing the same `TimerState` a duration timer produces.
- Keep arming total: a deadline that cannot be resolved or parsed must not throw,
  because it runs inside the transition commit path.
- Keep `fireAt` a UTC ISO-8601 instant so lexical sorting (`minFireAt`) and the
  `next_timer_at` scheduler stay correct.
- No schema change, no database change, no change to firing semantics.

**Non-Goals:**
- Re-evaluating a deadline after entry (a later writeback changing the source
  field does not move an armed `fireAt`).
- Calendar arithmetic, business calendars, or timezone-aware "end of day"
  semantics.
- Accepting anything but a string instant (no epoch numbers, no CEL `timestamp`
  — the constructor is deliberately blocked in `src/cel/check.ts`).

(An earlier draft listed the deadline result-type check as a non-goal. The review
reversed that — see "Resolved during implementation": it ships, together with
withholding data sources at the deadline site.)

## Decisions

**Evaluate at entry, once, and persist.** The contract already states that a
timer's fire time is computed at entry and persisted; deadline follows the same
rule as duration rather than becoming a re-evaluated live expression. This keeps
one arming model, keeps the scheduler purely `fireAt`-driven, and avoids a
deadline that moves under a running instance. Alternative considered: re-evaluate
on every writeback (like `resolution.ts` re-resolves automatic paths). Rejected —
it makes `fireAt` non-authoritative, requires re-arming logic in the writeback
path, and no v1 use case needs a moving deadline. A process that genuinely needs
one models it as a wait-state plus a data-driven automatic path.

**Guard scope, system actor.** A deadline is evaluated with `buildGuardContext`
(`data` re-keyed to field keys, projected `instance`, `actor`). The actor is
`SYSTEM_ACTOR`: `createInstance` genuinely has no acting user, and using the same
identity at both call sites keeps arming deterministic and identical whether a step
is entered as the initial step or via a transition. A deadline that reads `actor`
is an authoring smell, not a supported pattern.

**Narrow the authoring scope to match: no `child` in a deadline.**
`src/cel/check.ts` collects a deadline site with `child: s.type === "subprocess"`,
so on a subprocess step a deadline currently type-checks with `child.outcome` /
`child.data` registered. That is unreachable at runtime by construction: a deadline
is evaluated when the step is *entered*, and a child only exists once the step is
left. Left as-is, this change would ship a body that passes publish validation and
whose timer silently never arms — the exact failure mode the totality decision
below makes invisible. So the deadline site moves to `child: false`. This is a
validation tightening (a previously-accepted body can now be rejected), but only
for bodies that were already non-functional, and the `cel-expressions` spec already
scopes `child` to a subprocess step's *guards*. The alternative — leaving the check
permissive and documenting the trap — was rejected: it makes the authoring check
assert something the engine cannot honour.

**Entry-time data, not post-transition data.** The context is built from the
instance's data as of the commit. Action writebacks are post-commit and
asynchronous by design, so a deadline cannot depend on a value an entry action is
about to produce — it would be a race regardless of how arming were written. The
one case that *does* work is a step entered after a subprocess returns: the return
handler persists the `outputMapping` patch and then re-loads the parent before
committing the advance (`src/engine/subprocess.ts`), so a deadline on the step
following a subprocess step reads the child's mapped outputs from `data` normally.

**Unresolvable or unparseable ⇒ not armed.** Arming runs inside the transition
commit. A deadline reading a field that is not yet written throws in cel-js; a
deadline yielding a non-string or an unparseable string is equally an author-time
mistake surfacing at runtime. Throwing would fail the whole transition and wedge
the instance. Guards already resolve this tension with totality (an error is
`false`, the wait-state idiom), and arming takes the same stance: the timer is
simply absent from `instance.timers[]`, exactly as it is today. Alternative
considered: arm with a sentinel far-future `fireAt`, or dead-letter the timer.
Both add state that nothing reads. The trade-off (silent non-arming) is the same
one the current code already makes for every deadline timer, and it is bounded by
the authoring-time check and by making non-arming observable in tests.

**UTC normalization at parse.** The parse helper accepts a date-only string
(`2026-07-20` → `2026-07-20T00:00:00.000Z`), an offset-bearing instant
(`2026-07-20T10:00:00+02:00`), and a `Z`-suffixed instant. A naive datetime with
no offset (`2026-07-20T10:00:00`) is interpreted as **UTC**, not host-local — JS
`new Date()` would make it host-local, which would make an armed `fireAt` depend
on which machine committed the transition. Everything is normalized through
`.toISOString()`, so `fireAt` is always the same UTC ISO-8601 shape a duration
timer produces. This mirrors how `date`/`datetime` catalog fields already map to
CEL `string`.

**Past deadline arms as-is.** No clamping to now, no immediate synchronous fire.
The scheduler's existing "overdue timer fires after restart" path already handles
a `fireAt` in the past on the next poll, so a deadline that has already elapsed at
entry needs no special case — it just fires promptly.

**Signature change over a second function.** `armStepTimers(step, entryInstant)`
becomes `armStepTimers(step, entryInstant, body, entering)` rather than adding a
parallel `armDeadlineTimers`. One function keeps "the armed set replaces the
previous step's timers" as a single atomic statement and prevents a call site from
arming one kind and forgetting the other. Both call sites are internal.

`entering` is the full entry-time `Instance`, not just its `data`. Passing bare
`data` would force `armStepTimers` to fabricate an instance-shaped object for
`buildGuardContext`, and `projectInstance` would then publish invented
`instance.id`/`status`/`transitionSeq`/`currentStepId` into the CEL context — a
silent lie to any deadline reading `instance.*`. Both call sites can produce a
truthful entry-time instance with a small reorder (`commitTransition` builds the
advanced instance before arming and folds the armed set in; `createInstance` parses
the seed, arms against it, then returns it with the timers), so
`buildGuardContext`'s contract stays untouched and no fake instance exists.
`entering.timers` is `[]` during evaluation, which is unobservable: INSTANCE_SCHEMA
exposes only id/status/transitionSeq/currentStepId.

## Risks / Trade-offs

- **A mistyped deadline silently never fires** → The failure is invisible at
  runtime by design (see the totality decision). Mitigation: the authoring-time
  CEL check already rejects an unparseable or unresolvable-reference deadline
  expression, so the remaining hole is a well-formed expression producing a
  non-instant string. Narrowing this further is the open question below.
- **`armStepTimers` gains a CEL dependency** → `src/engine/duration.ts` currently
  imports only types. It will import `src/cel/eval.ts`, which the transition and
  resolution modules already depend on, so this adds no new package dependency
  and no cycle (`eval.ts` imports from `src/cel/check.ts` and the schema only).
- **A deadline reading `actor` resolves to the system identity** → Accepted, and
  the same choice `resolution.ts` and timer-forced transitions already make.
  Documented in the module comment rather than blocked.
- **Naive-datetime-as-UTC may surprise an author expecting local time** →
  Deliberate: determinism beats intuition for a persisted fire time. Authors who
  need a specific zone write an offset, which is fully supported.

## Pre-existing findings, deliberately out of scope

Reviewing the arming context surfaced two authoring/runtime asymmetries that this
change neither introduces nor worsens. Both are noted so they are not rediscovered
as "deadline bugs":

- **Data sources are registered at authoring but absent at runtime.**
  `buildEnv` (`src/cel/check.ts`) registers every `body.dataSources[].key` as
  `dyn`, but `buildGuardContext` (`src/cel/eval.ts`) returns only
  `{ data, instance, actor }`. A guard referencing a data source therefore
  type-checks at publish and throws at evaluation — which guard totality converts
  to `false`. Resolving data sources at evaluation time is its own change.

  For a **deadline** this asymmetry was not survivable and is closed here (see
  "Resolved during implementation"): unlike a guard, which merely evaluates false
  and is retried on the next resolution pass, a deadline referencing a data source
  throws at every arming, so the timer never fires for any instance of the
  definition — permanently. The namespace is therefore withheld at the deadline
  site, making it a publish error. It remains registered for every other site,
  where the pre-existing behaviour is unchanged.
- **`child` is registered for Action.output sites inside a subprocess step**
  (`outputs(...)` passes the step's `child` flag), but `buildOutputContext`
  supplies only `result`. Unlike a guard, `evalFieldMap` is not total, so such an
  output throws and the writeback dead-letters. Same class of problem as the
  deadline scope narrowed above; not fixed here because it touches the outbox
  writeback path rather than arming.

## Verified non-impacts

- **No import cycle.** `src/cel/eval.ts` imports only `@marcbachmann/cel-js`,
  `./check.js`, and the schema; `src/engine/transition.ts` already depends on it,
  so `duration.ts -> eval.ts` adds no package dependency and no cycle.
- **Nothing downstream of arming changes.** `minFireAt`, the `next_timer_at`
  column, `drainTimers`, and both `fireTimer` branches read `fireAt` alone and
  never ask how a timer was armed. UTC normalization is what keeps `minFireAt`'s
  lexical sort chronological across mixed duration/deadline timers.
- **Only two call sites.** `armStepTimers` is called from `commitTransition` and
  `createInstance`; the cancel path reaches it through `commitTransition` with the
  synthesized sink, which declares no timers, so it arms an empty set as today.

## Resolved during implementation

A multi-lens adversarial review of the first implementation confirmed nine defects.
Three decisions came out of it that were not in the original design:

**Parse by whitelist, never by sniffing.** The first implementation used a regex to
*detect* the naive-datetime form and otherwise handed the string to `new Date()`.
That left the legacy parser reachable, which is both host-local for non-ISO forms
("2026-08-01 10:00:00" spread 16 hours across three host zones) and willing to
accept strings denoting no date at all ("5" → 2001-04-30, "2026" → 2026-01-01) —
the latter arming a timer decades in the past that the scheduler fires immediately,
forcing a guard-bypassing transition off a wait-state. `instantFromValue` now
matches a strict whitelist first and normalizes explicitly, so `new Date()` only
ever sees an ISO string with an explicit zone. The space separator is accepted
deliberately (it is what a Postgres `timestamp` stringifies to) and read as UTC.

**Bound the year, and assert the output width.** `toISOString()` emits the 27-char
expanded-year form outside 0001-9999, and `+` (0x2B) sorts before every digit — one
such `fireAt` wins `minFireAt`'s lexical sort and suppresses every other timer on
the step. This disproved the original design's claim that a deadline `fireAt` always
sorts correctly against a duration `fireAt`. The whitelist's 4-digit year prevents
it; the 24-char output check asserts the invariant rather than assuming it.

**The result-type check is required, not opportunistic.** The original open question
asked whether cel-js exposes a site's inferred type. It does — `env.check()` returns
`{ valid, type }` — so a `deadline` site now declares `expect: "string"`. This was
scoped as optional; the review showed it is not. A deadline over a `number` field
published cleanly and then silently never armed, and if that timer was the only
bound on an all-automatic wait-state the instance hung with no history entry, no
dead-letter, and no log. The same reasoning extended the scope narrowing: a deadline
also sees no data sources, because `buildGuardContext` does not resolve them, so
such a deadline throws at *every* arming — definition-wide and permanent, not
per-instance. Both are publish errors now.

## Known limitation, deferred by decision

Arming stays total, so a deadline that yields no instant at entry is dropped from
the armed set — and that omission is invisible: `next_timer_at` stays NULL, no
history entry, no dead-letter, no log. Two causes survive the publish-time checks:
a correctly-typed field simply not yet written at entry (the documented intended
case), and a `date`/`datetime`/`string` field holding a non-instant value, which
nothing in the stack validates. On an all-automatic wait-state whose only bound is
that timer, the instance hangs until someone cancels it.

The original design justified the silence by analogy to guard totality. The analogy
is incomplete: a guard that evaluates false is re-evaluated on every resolution
pass, whereas an omitted timer is never retried. Decision taken: mark the omission
on the persisted `TimerState` so it is queryable, without arming or firing. That
touches the runtime record in `definition.ts` — the contract — so it ships as its
own OpenSpec change rather than as a side effect of this one. Tracked in CLAUDE.md
under "Decided, not yet built". The `Timer.duration` gap the same review surfaced —
the duration branch sharing the width defect and, being unvalidated, not being total
— was taken up separately as `harden-duration-timers`.
