## Context

`TimerState` (`src/schema/definition.ts:677-682`) is `{ timerId, fireAt,
fired? }`. It is produced in exactly one place, `armStepTimers`
(`src/engine/duration.ts:136-174`), called from three sites: `store.ts`
(instance creation), `transition.ts` (ordinary step entry), and
`migration.ts::reconcileTimers` (the newly-declared bucket). Migration's
reconciliation additionally *carries forward* a `TimerState` verbatim for a
still-declared, unfired timer id — the "surviving timer keeps its fire time"
rule — without ever re-deriving it, because there is nothing on the record
to tell whether the declaration it was armed against is still the one on the
target step.

## Goals / Non-Goals

**Goals:**
- Give `TimerState` enough information to detect that a surviving timer id's
  declaration actually changed (duration value, or duration↔deadline kind),
  and re-arm exactly that case.
- Keep every other reconciliation behavior identical: a fired timer is still
  never resurrected or re-armed; a withdrawn timer is still dropped; a
  genuinely newly-declared timer is still armed at the migration instant.
- Define, not guess, what happens to an instance whose `TimerState` predates
  this change (no `provenance` on record).

**Non-Goals:**
- Backfilling `provenance` onto already-persisted `TimerState` rows. No
  migration-of-migrations; the field appears the next time that timer is
  armed (a fresh entry, or a reconciliation that re-arms it).
- Touching the timer *scheduler* (`timers.ts`) or *firing* (`fireTimer` in
  `transition.ts`) — neither constructs or interprets provenance; both only
  read `fireAt`/`fired`.
- A UI/audit surface for provenance. It is written for reconciliation to
  read; nothing currently displays it. (It is, incidentally, exactly the kind
  of runtime fact CLAUDE.md's audit-backbone philosophy says should be
  recorded once available, even without an immediate reader.)

## Decisions

### Provenance shape: a discriminated union plus `armedAt`

```ts
export const timerProvenance = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("duration"), duration, armedAt: timestamp }),
  z.object({ kind: z.literal("deadline"), src: z.string(), armedAt: timestamp }),
]);
export type TimerProvenance = z.infer<typeof timerProvenance>;
```
`TimerState` gets `provenance: timerProvenance.optional()`.

A `duration` timer's provenance is its declared duration string (the exact
value reconciliation must catch a change in); a `deadline` timer's is its
CEL `src` (the expression, not its evaluated value — the value differs by
definition on every re-evaluation, so comparing values would never detect
"unchanged" and always re-arm). `armedAt` is the entry instant used when this
timer was armed — not needed by the comparison itself, but named explicitly
in the TODO item this change closes, and it is otherwise-unrecoverable
runtime information matching the project's existing stance on
`ActionOutcome.at` and `HistoryEntry.at`: record it now that arming is a
single, identifiable moment, rather than reconstruct it never.

**Alternative considered:** hashing the declared timer (`{duration}` or
`{deadline}`) into one opaque string. Rejected — a hash tells you *that*
something changed, never *what*, and provenance is exactly the "what" this
change is asked to preserve; a discriminated union costs nothing extra to
store and is directly comparable field-by-field without re-deriving a hash
function twice (arm-time and reconcile-time) that must stay in sync.

### Comparison is structural equality on `{kind, duration|src}`, not `armedAt`

`armedAt` is excluded from the match — two arms of the same timer id at
different instants (an ordinary re-entry, then a migration) with an
unchanged declaration must still count as "unchanged" for reconciliation
purposes. Only the declared source distinguishes "same timer, still" from
"this id now means something else."

### Where the comparison lives: `reconcileTimers`, not `armStepTimers`

`armStepTimers` stays exactly what it is — an arm-from-declaration function
with no notion of "previous state" to compare against; it doesn't receive a
prior `TimerState` today and gains no such parameter. All the new comparison
logic lives in `reconcileTimers`, the only caller with both sides (the
carried `TimerState` and the target `Timer` declaration) in hand.

Reconciliation's existing three-way split (kept-unfired / kept-fired /
dropped) plus the newly-declared-arm becomes:

```
for each carried timer, id still declared on target:
  if fired -> keep as-is (fired; provenance irrelevant)
  else if no provenance on record -> keep as-is (no signal; legacy trust)
  else if provenance matches target's current declaration -> keep as-is
  else -> treat as if not carried: feed into the same arm-at-migration-instant
          path newly-declared timers already use
for each carried timer, id no longer declared on target:
  drop (unchanged)
for each declared timer, id not carried (after the reclassification above):
  arm at the migration instant (unchanged)
```

This is additive to the existing bucketing, not a rewrite: the "declared but
not carried" arming path (`armStepTimers` called with only the
not-yet-armed subset) already exists; a provenance-mismatched carried timer
is simply added to that subset's input before the call, alongside the
genuinely-new ones.

### Backward compatibility: absent provenance is trusted, not distrusted

Three options were weighed for a carried `TimerState` with no `provenance`
(every instance persisted before this change):
1. **Trust it (chosen)** — keep as today, no comparison possible.
2. **Distrust it — always re-arm.** Rejected: re-arming recomputes `fireAt`
   as `migrationInstant + declaredDuration`, which is *wrong* for the common
   case of a genuinely-unchanged legacy timer (its correct `fireAt` was
   computed relative to when its own step was originally entered, not to the
   migration instant) — "fix" would silently move every legacy timer's fire
   time forward on its first migration after this ships, for the vast
   majority of timers that never actually changed.
3. **Refuse to migrate an instance carrying a provenance-less timer.**
   Rejected: identical migration-worthiness cost as `pending-actions`
   (declined already for a different reason) for no correctness gain — the
   trust-it behavior is exactly today's shipped behavior, not a new risk.

This mirrors the project's standing rule for tightening a check
(CEL/duration/registry validation): a check that starts applying only from
here forward, never retroactively, for exactly the same reason — the record
needed to apply it earlier was never captured.

## Risks / Trade-offs

- **A legacy timer's drift (if any) is never detected**, only a drift on a
  timer armed after this change. Accepted — see Goals: closing this fully
  would require a data migration this change deliberately does not attempt
  (see Non-Goals), and the gap self-heals as instances progress (every fresh
  arm gets provenance).
- **`provenance` grows the persisted instance body** by one small object per
  armed timer. Negligible; `TimerState` already carries `fireAt`/`fired`,
  and instances carry at most a handful of timers per step.
- **Deadline provenance stores the CEL source, which could itself change in
  a cosmetically-different but semantically-identical way** (e.g.
  whitespace, or an equivalent rewrite) and would be flagged as "changed."
  Accepted as a papercut, not a correctness bug: a false "changed" re-arms a
  timer that was going to keep the same declared behavior anyway, which is
  strictly safer than a false "unchanged" (the bug this change fixes) and
  costs only an extra evaluation of an expression that is (by CEL's purity
  and totality guarantee) cheap and side-effect-free.

## Migration Plan

No data migration (see Non-Goals). Schema change is additive-optional, so
existing rows read unchanged. Code changes are: schema addition, `duration.ts`
populates the field, `migration.ts` reads it. No feature flag — the added
comparison is strictly more precise than today's id-only keying and changes
behavior only for instances that both (a) carry provenance and (b) migrate
onto a target step whose matching-id timer declaration actually changed,
which was a silent-bug case before this change.

## Open Questions

None outstanding — the TODO item's own list ("Provenance-Feld ergänzen",
"Reconciliation erweitert", "Rückwärtskompatibilität klären") is fully
addressed by the decisions above.
