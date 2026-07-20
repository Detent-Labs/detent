## Context

`durationMs` (`src/engine/duration.ts`) accepts the ISO-8601 duration grammar
`P[nW][nD][T[nH][nM][nS]]` and throws on anything else — calendar units (`P1Y`,
`P1M`) are rejected deliberately, being ambiguous without a date library. But
`duration` in `src/schema/definition.ts:45` is a bare `z.string()`, so that grammar
is enforced only at the moment of arming, deep inside `commitTransition`.

`armStepTimers` arms the **target** step's timers, so the throw does not merely fail
one instance: it makes the step unreachable for every instance of the definition,
and makes the definition uninstantiable if the step is `initialStep`. Through
`drainTimers` the same throw is swallowed by a bare `catch {}` with `next_timer_at`
left due, producing a 500 ms retry loop that never terminates and never surfaces.

Separately, `addDuration` calls `.toISOString()` unguarded. For a large but
grammar-valid duration the result is the expanded-year form, whose leading `+`
(0x2B) sorts before every digit — so `minFireAt`'s lexical comparison selects it as
the earliest timer and `next_timer_at` suppresses every other timer on the step.

`add-deadline-timers` closed both failure modes on the `deadline` branch, via
`instantFromValue`'s strict whitelist (bounded to a four-digit year) and its
24-character output assertion. It scoped the `duration` branch out to keep that
change honest to its title, and recorded the gap in the `armStepTimers` docstring
and in CLAUDE.md. This change closes it.

## Goals / Non-Goals

**Goals:**
- Make a malformed duration a publish-time error, so `durationMs` cannot throw for a
  validated body.
- Guarantee that every armed `fireAt` — from either branch — carries the fixed-width
  `YYYY-MM-DDTHH:mm:ss.sssZ` form that `minFireAt`'s lexical sort depends on.
- Make the two branches of `armStepTimers` consistent, so the docstring's totality
  statement is true without a caveat.

**Non-Goals:**
- Adding calendar units (`P1Y`, `P1M`). They stay rejected; the reason is unchanged.
- Changing how a duration timer fires, is disarmed, or interacts with OCC.
- Business-level limits on how far out a timer may be scheduled. The bound here
  exists to preserve a representation invariant, not to express policy.

## Decisions

**One grammar, owned by the contract.** The check must not restate `durationMs`'
regex — two copies drift, and the failure mode of drift is exactly the bug being
fixed (validation accepting what arming rejects). The grammar moves into
`src/schema/definition.ts` as the single source, exported as a total parser
(`parseIsoDuration`, returning `null` outside the grammar) rather than a bare regex,
so the unit arithmetic cannot be duplicated either. `durationMs` becomes a thin
wrapper that throws on `null`. The dependency direction is correct: the engine
already depends on the schema, never the reverse.

**Enforced at publish, NOT as a Zod refinement.** This is the correction that matters
most, and the first implementation got it wrong. `duration` is a leaf type, so a
`.refine()` on it runs wherever the schema runs — including
`createDefinitionStore`'s `resolveBody`, which re-parses *stored, immutable* bodies
through `processBody.parse` on every cache miss (`src/engine/definitions.ts:39`). A
definition published before this change with `duration: "P1Y"` — legal then, since
`duration` was bare `z.string()` — would begin throwing on **read**. Published
versions are immutable, instances pin `{processId, version, definitionHash}`, and
migration is not built, so such an instance becomes permanently unrehydratable. The
blast radius is worse than per-instance: in `src/engine/timers.ts` the `resolveBody`
call sits *outside* the per-instance `try`, so one poisoned legacy definition throws
out of the whole `drainTimers` pass and starves every other due instance.

The general rule this encodes: **tightening a schema refinement is not
backward-compatible when that schema is also the deserializer for immutable
persisted data.** Validation that may tighten over time belongs on the write path.

The project already establishes that pattern twice — CEL validation lives in
`src/cel/check.ts` deliberately outside the contract module, and the plugin registry
validates at publish ("unknown type or invalid config is a publish error, not a
runtime error"). Duration validation joins them: `duration` stays `z.string()`, and a
`validateDurations(body)` pass runs at compile/publish alongside
`authoredProcessBody.parse` and `validateCrossProcess`, returning located issues. New
publishes are strict; the read path stays permissive; old bodies keep rehydrating.

`durationMs` keeps its throw as a defensive assertion. It is unreachable for a body
that passed the publish check, and throwing beats silently arming a wrong instant.

**Bound the magnitude relative to a stated entry-instant ceiling, not to the whole
representable window.** The real property is `entryInstant + duration < year 10000`,
and the publish check cannot know the entry instant. The first implementation bounded
`duration` by the *full* 0001-9999 span, which is necessary but far from sufficient:
`P3000000D` (~8214 years) passes that bound and still overflows from an ordinary 2026
entry, so `armStepTimers` raises on schema-valid authoring input — making the target
step permanently unreachable and, via `drainTimers`' bare `catch {}`, producing the
never-terminating 500 ms retry loop this change exists to eliminate.

The bound is therefore derived from an explicit ceiling on the entry instant: a
duration that passes cannot overflow when armed from any entry before that ceiling.
The ceiling must be a fixed constant, not wall-clock at validation time — publishing
the same body twice must give the same verdict. State the ceiling in the comment, so
the guarantee is legible ("cannot overflow from any entry before year N") rather than
looking like an arbitrary limit.

The arming-side width check stays, and with a correctly derived bound it becomes
genuinely unreachable for a validated body armed before the ceiling — which is what
lets its comment be honest. This mirrors the deadline branch, where the whitelist
bounds the input and `ISO_WIDTH` asserts the output.

**The magnitude bound applies only to `Timer.duration`.** The shared `duration` type
also backs `retryPolicy.baseDelay` and `action.timeout`, neither of which is read by
any engine code today and neither of which produces a `fireAt`. The grammar applies
to all three — it is what the type means — but the magnitude bound's entire
justification is the `fireAt` representation, so extending it to fields that compute
no instant would be a limit with no reason behind it.

**What arming does when the width assertion fails.** With the refinement in place
this is unreachable, which is precisely why it needs a deliberate answer rather than
whatever falls out. Omitting the timer silently would reintroduce the invisible-drop
problem that the sibling change (recording an unarmed timer, see CLAUDE.md "Decided,
not yet built") exists to solve. **This change should therefore land after that one**
and reuse its marker, so an assertion failure is recorded rather than swallowed. If
it lands first, the interim behaviour is to throw — an unreachable-by-construction
invariant violation is a bug in the engine, not authoring input, and a loud failure
is the right signal for that.

## Risks / Trade-offs

- **A previously-publishable body is now rejected** → Only bodies that were already
  non-functional: a malformed duration made its step unreachable, and an absurd one
  suppressed the step's other timers. Same class of tightening as the `child` and
  data-source narrowing in `add-deadline-timers`. Existing examples and fixtures use
  ordinary durations; confirming that is a task, not an assumption.
- **The magnitude bound is a number someone has to choose** → It is a representation
  bound, not policy, so it should be derived from the four-digit-year limit rather
  than picked to feel reasonable. State the derivation in the code comment so a
  later reader does not mistake it for a business rule.
- **Touching `definition.ts` is touching the contract** → Required here, since the
  whole defect is that the contract under-specifies a field. Ships with a rejecting
  test per invariant, per the project rule.
