<!-- antislop: allow-file sentence-length run-ons passive-voice em-dash synonym-rotation -->
<!-- synonym-rotation pairs "create" with "build". Every "create" here is an
     identifier this document cannot rename — the `created_at` column and the
     `createInstance` function — while "build" is ordinary prose about
     building a map. The rule spans the whole document, so a block-scoped
     `allow` at one site would not cover it. -->
<!-- This design matches the dense technical-prose convention every other
     design document in this repo uses, and extends an approved design
     written end-to-end in that convention
     (docs/superpowers/specs/2026-07-30-reporting-analytics-design.md).
     Per the antislop-targeted-allow-not-file-all memory: named rules, not
     a blanket allow-file all. -->

## Context

See `proposal.md` — Why, and the approved design at
`docs/superpowers/specs/2026-07-30-reporting-analytics-design.md`, which this
document extends rather than restates. That design settled the product shape
(four packages, one new role, three views, one shared timeline primitive, live
queries only). What it left open are the storage-level questions the code has
to answer, which this document decides.

The constraints that shape those answers, read out of the code rather than
assumed:

- `instances` is `(instance_id, transition_seq, body jsonb, created_at,
  next_timer_at, resolve_state, redacted_at)`. `processId`, `status`,
  `version`, `startedAt` and `currentStepId` all live inside `body`.
  `instances_selection_idx` covers `((body->>'processId'), (body->>'version'),
  (body->>'status'))`; nothing indexes `body->>'startedAt'`.
- `history_entries` is `(id, instance_id, transition_seq, entry jsonb)` with an
  index on `(instance_id, transition_seq)`. `toStepId` and `at` are inside
  `entry`.
- `instance_events` has the same shape plus a promoted `kind text` column and
  an index on it, so `timer.fired` rows are selectable without a jsonb scan.
- Redaction (`src/engine/retention.ts`) clears `body.data` and deletes comments
  and attachments. It deletes no `history_entries` and no `instance_events`
  row, and leaves `startedAt` and `status` intact.
- `resolveBody` (`src/engine/definitions.ts`) resolves a compiled body for a
  `(processId, version)` pair and is reused unchanged.

## Goals / Non-Goals

**Goals** (design-level, beyond the proposal's scope):

- One timeline walk in one place, consumed by both the cycle-time step
  breakdown and the bottleneck ranking, so the two cannot drift apart.
- No new table, no new column, no migration — every number comes from relations
  that already exist.
- Query cost bounded by the requested date range and one process, with the
  point where that no longer holds named rather than discovered in production.

**Non-Goals** (design-level):

- Pushing the aggregation into SQL window functions. See Decisions.
- Adding an index speculatively. See Decisions and Risks.
- Any change to `resolveBody`, `listProcesses`, or any existing engine
  function. This change adds modules; it edits `src/auth/authorize.ts` for one
  constant and `src/http/server.ts` for one route-file mount, and nothing else.

## Decisions

### Row selection in SQL, aggregation in TypeScript

Each view runs two indexed selects — the in-range instances of the process,
then their history entries by `instance_id` — and does the timeline walk,
the traversal derivation, the percentile computation and the ranking in
TypeScript.

*Why not SQL window functions.* A `LEAD(...) OVER (PARTITION BY instance_id
ORDER BY transition_seq)` over `entry->>'at'` would compute traversal durations
in one statement, and it was the first shape considered. It loses on two
counts. The initial step is not in `history_entries` at all — it has to come
from the resolved body's `workflow.initialStep` at `instances.startedAt` — so
the SQL version still needs a per-version lookup grafted onto it in
application code, and the "one statement" advantage evaporates. And the
resulting statement is materially harder to read than the walk it replaces,
against a workload the date range already bounds. `admin-queries.ts` sets the
precedent both ways: it uses SQL aggregation where the predicate is flat
(`countOutboxByStatus`) and application code where the shape is nested.

*Consequence, stated rather than hidden:* the in-range instances and their
history entries are held in memory for the duration of one request. See Risks.

### The date-range predicate reuses the process index and adds none of its own

The instance select filters `body->>'processId'` — covered by
`instances_selection_idx`'s leading column — and then
`(body->>'startedAt')::timestamptz` between the range bounds, unindexed.

*Why not `created_at`.* The table does carry an indexed `created_at
timestamptz` column, set at insert, which for every row the engine writes is
the same instant as `body.startedAt`. Filtering on it would be indexed for
free. It is rejected because the two are only incidentally equal: `created_at`
was added for the instance listing's paging key and defaults to `now()` for any
row that predates it, whereas `startedAt` is the field the specs, the retention
sweep and the instance record all treat as when the instance began. Reporting
on a column that happens to agree today invites a silent divergence later.

*Why not add an expression index now.* `CREATE INDEX ... ON instances
((body->>'startedAt'))` is one line and would be the obvious addition. It is
deliberately not part of this change: the leading process predicate already
reduces the scan to one process's instances, and adding an index against an
unmeasured workload is the speculative optimisation this repo's conventions
argue against elsewhere. The ceiling is named in Risks, with the exact one-line
fix, so this is a deferral and not an oversight.

### Percentiles by nearest rank over the sorted sample

p50/p90/p99 are computed by sorting the completed instances' total durations
and taking the nearest-rank element, not by interpolation and not by SQL's
`percentile_cont`.

*Why.* The rows are already in memory from the previous decision, so a SQL
round trip buys nothing. Nearest rank always returns a duration an instance
some instance took, which is what a process owner reading "p90" expects; linear
interpolation returns a number no instance exhibited. Against small samples —
the common case for a process a customer just started running — that
difference is visible and confusing.

The response carries the sample size alongside the three percentiles, so a
"p99" computed over four instances is legible as such rather than presented
with false authority.

### A breach is read from both firing records, not only from `timer.fired`

`fireTimer` (`src/engine/transition.ts`) has two branches, and only one of them
writes an event. A reminder timer — actions, no `targetPath` — enqueues its
actions and records a `timer.fired` event. A transition timer — the shape an
escalation takes — calls `commitTransition(..., "timer", ...)` and records a
`HistoryEntry` with `cause: "timer"` and the timer's `targetPath` as its
`pathId`. **It records no `timer.fired` event.**

The approved design states that a reminder *or escalation* timer firing is
already a `timer.fired` event. That is false for the escalation half, and
building the view on it would be a correctness defect rather than a gap:
`examples/expense-approval.json` — the repository's own SLA recipe from
Roadmap #17 — declares exactly one timer of each kind, so its escalating step
would report a breach rate of zero over a full denominator. A step that
breached on every traversal would be reported as having met its SLA every
time, which is worse than the step being absent.

So the view reads both records. Per version it builds two maps from the
resolved body — `timerId -> stepId` for the event form, and
`timerTargetPathId -> stepId` for the history form — memoised per request.

*Why not add a `timer.fired` event to the transition branch instead.* That
would unify the read at the cost of changing the runtime event log's meaning
for every existing consumer, and it would not help any instance already
recorded. Reading what the engine already writes keeps this change additive,
which is the whole point of a reporting layer.

### Attribution is sequence equality, not a range

A runtime event carries the `transitionSeq` in force and never advances it, so
a reminder that fires while an instance is parked carries exactly the sequence
of the transition that entered the step. Attribution is therefore equality
against the traversal's entering sequence — not the "falls between entering and
leaving" comparison the first draft specified. Equality is both simpler and
exactly right for a revisited step, since each visit has its own entering
sequence. A transition-timer firing needs no matching at all: the history entry
that records it is the entry that closes the traversal.

A traversal counts as breached once however many of its timers fired, so a step
declaring both a reminder and an escalation cannot report a rate above one.

### A migration onto the same step is not a re-entry

`migrateOne` (`src/engine/migration.ts`) calls `planStepEntry` unconditionally;
its `stepChanged` flag gates only the entry actions and the spawn suppression.
So an instance migrated while parked in step X gains a `HistoryEntry` with
`toStepId === X`, and a naive consecutive-pair walk would split one stay into
two traversals — halving the SLA rate through an inflated denominator and
pulling both the median and the average down.

The walk therefore drops a `cause: "migration"` entry whose `toStepId` equals
the preceding entry's step.

*Why not collapse every consecutive same-step entry.* Because a self-loop
path — target equal to source, cause `user`, `automatic` or `timer` — is a
genuine re-entry: it re-arms the step's timers and resets
`currentStepEnteredAt`. Collapsing it would merge two real visits into one and
lose a firing along with them. The suppression is scoped to the `migration`
cause, which is the only one that relocates an instance without it having
moved.

### A cancelled instance's last step is a real traversal

Cancellation leaves a complete record behind it: `cancelInstance` writes a
`HistoryEntry` with `cause: "cancel"` and `toStepId: CANCEL_SINK_STEP_ID`. The
step the instance occupied therefore has a closing timestamp, and the first
draft's claim that it "receives no traversal" was wrong about the
engine.

It counts. A bottleneck view asking "how long do instances sit here" should
count an abandoned wait as time spent — the queue was that long, and
excluding it would flatter exactly the steps where abandonment happens most. The
cancel sink itself yields no traversal and appears in no view: it is an
engine-supplied sink, not an authored step, and ranking it against real steps
would be meaningless.

Cycle-time is unaffected, being restricted to `completed` instances either way.

### An instance started on a terminal step is not a zero-length case

`createInstance` sets `status: "completed"` when the initial step is terminal
(a legitimate shape — a migration target instances relocate onto), and writes
no `HistoryEntry` at all. Such an instance has no terminal-step transition to
measure to, so it is excluded from the percentiles rather than contributing a
zero, which would drag p50 toward a duration no real case took.

*Why per version and not per instance.* An in-range population spans one or
two published versions; resolving per instance would repeat identical
work per row for no gain. Memoising for the request rather than across requests
keeps the "no cache" rule from the approved design intact — nothing survives
the response.

An instance whose pinned version no longer resolves is skipped, and the count of
skipped instances is returned with the response rather than swallowed, so a view
computed over a partial population says so.

### Redacted instances still count

A redacted instance keeps its `startedAt`, its `status`, its history entries and
its events; only `body.data` is emptied. Every reporting number is derived from
exactly the surviving fields, so a redacted instance contributes to all three
views unchanged, and no view needs a redaction filter. This is a property worth
stating because it is not obvious: retention removes what a report never reads.

### Route and package placement follows the existing role-scoped precedent

`src/http/reporting-routes.ts` sits beside `admin-routes.ts` and
`studio-routes.ts` rather than inside `routes.ts`, mounted from
`src/http/server.ts` the same way those two are, with the `system:reports`
check applied once at the prefix before process resolution — which is what
makes the "403, not 404, for an unknown process" scenario in the
`authorization` delta fall out of the structure instead of needing its own
guard.

`packages/reporting` is scaffolded from `packages/admin`'s shape (React, Vite,
own build and typecheck, hand-written History-API routing hook, `session.ts`
under its own storage key). This copies the session/login/routing modules a
fourth time, which Roadmap #12 already tracks as the standing dedup question;
this change continues that duplication knowingly and does not resolve it.

## Risks / Trade-offs

- **A process with a large in-range instance population makes the request
  slow and memory-hungry** (both selects return every row, and the range
  predicate is unindexed) → the process predicate is indexed and bounds the
  scan to one process; the date range bounds it further, and the frontend never
  sends an unbounded range. When a real deployment measures this as slow, the
  fix is one line — `CREATE INDEX IF NOT EXISTS instances_started_idx ON
  instances ((body->>'startedAt'))` — plus, if still needed, keyset paging over
  the instance scan in the same shape `migrateInstances` and the retention
  sweep already use. Mark the deferral with a `ponytail:` comment naming this
  ceiling so the debt ledger picks it up.
- **p99 over a handful of instances is statistically meaningless** → the sample
  size ships with the percentiles, and the frontend presents it next to them
  rather than in a tooltip.
- **Bottleneck and cycle-time report different per-step numbers for the same
  step** (different status scopes, by design) → both views state their scope on
  screen, per the `reporting-app` spec, and the design records that the two are
  not to be reconciled.
- **A step renamed between versions aggregates under one row with the newest
  label** → intended, since `id` is the stable anchor; a step whose meaning
  changed that much is visible in Studio's version diff, which is where that
  belongs.
- **An unresolvable pinned version silently shrinks the population** →
  mitigated by returning the skipped count with the response.
- **A fourth frontend copies session/login/routing a fourth time** → accepted;
  Roadmap #12 owns it, and this change leaves the later consolidation no
  harder, only larger by one package.
- **A future third way of recording a timer firing would silently under-report
  breaches again**, the same way the escalation branch did → the SLA
  requirement names both current forms explicitly and states that recognising
  only one is incorrect rather than incomplete, so a new form fails the spec
  rather than quietly reading as "no breaches". The test for an escalating step
  reporting a non-zero rate is the one that would fail.
- **A fourth frontend makes five existing specs factually wrong** (they
  enumerate three packages or four roles) → each is corrected by a delta in
  this change, and where the wording can be made count-free without losing
  precision it is, so the next package added does not repeat the sweep.

## Migration Plan

No data migration. `initSchema` is unchanged — no table, column or index is
added. Deployment adds one frontend image alongside the existing three, per the
Roadmap #14(b) pattern, and grants `system:reports` to the relevant accounts
through the existing `src/auth/cli.ts` role command. Rollback is removing the
route mount and the package; nothing persisted needs undoing, because nothing
is persisted.

## Open Questions

- Whether the process picker should list every process or only those with at
  least one instance in range. Listing every process is the starting behavior
  (it reuses `listProcesses` unchanged, and an empty report is a legitimate
  answer to "how is this process doing"). Narrowing it later changes no spec
  requirement, no route contract and no task.
