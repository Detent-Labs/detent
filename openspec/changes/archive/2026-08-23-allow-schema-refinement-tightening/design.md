## Context

See proposal.md, "Why", for the motivation and the worker evidence.

One fact from the survey shapes everything below.
`openspec/specs/timers/spec.md` already contradicts itself. Lines 436 to 439
justify the duration placement by a claim about the workers. They say the
workers resolve a body outside their per-instance error handling. Line 528
opens a requirement demanding the opposite, and it names the same two
operations:

<!-- antislop: allow passive-voice -- a verbatim quote of an existing requirement -->
> Each instance in a scheduler pass SHALL be processed inside its own error
> boundary, covering the row body parse and the body resolution as well as
> `fireTimer`.

The second is the one the code implements. So this change corrects a stale
premise. It weakens no property the engine holds today. That framing decides
what the work touches and what it leaves alone.

## Goals / Non-Goals

**Goals:**

- State the placement rule once, in `definition-contract`. Let every other site
  point at it.
- Delete the starvation claim everywhere it appears.
- Leave every check where it currently sits.

**Non-Goals:**

- Moving an existing `compile.ts` check into `definition.ts`. Nothing here asks
  for that, and the unbypassable-check criterion argues against it.
- Changing storage immutability, instance pinning, or `definitionHash`.
- Tightening any refinement. This change permits a tightening. It performs none.
- Touching `reject-unsatisfiable-required-readonly`.

## Decisions

**One governing requirement, not one correction per site.** The rule appears at nine
code and doc sites plus three specs. Restating a two-criterion rule at each one
is how the stale premise spread. `definition-contract` gets the requirement.
Every other site keeps one sentence naming the placement it took, and points at
the rule for the reasoning.

Alternative considered: correct each site in place and add no requirement. That
leaves the next author with twelve partial statements. None of them holds
authority over the others, and that is the state today.

**`timers` keeps its publish-path placement, on the arming argument.** The
existing requirement carries two reasons. One is the read-path claim this change
refutes. The other is arming totality. A duration timer computes `fireAt` inside
the transition commit, so an unvalidated duration makes the target step
unreachable for every instance. That second reason is sound and independent, so
the requirement survives its rationale losing a limb.

Alternative considered: withdraw the read-path prohibition from `timers`
entirely. Rejected. The scenario at its line 467 passes today and describes real
behavior. The publish-path placement it locks in is the one arming totality
wants anyway.

**The two `definition-contract` rationale sentences get MODIFIED deltas.** Their
requirements do not change behavior, so ADDED would be wrong. Leaving them alone
is worse: the spec would assert a withdrawn premise beside the requirement that
withdraws it. A MODIFIED delta carrying the full block is the only mechanic that
reaches the sentence. Anything smaller loses the rest of the block at archive
time.

**`cel-expressions` gets no delta and no correction.** Its placement rests on an
independent reason. CEL checking needs the CEL library, which a Zod refinement
cannot host. Its rationale sentence states a true consequence: a tightened
refinement would make a published body throw on READ. It never states the
starvation claim, and it never calls the consequence a veto. So it survives this
change untouched.

## Risks / Trade-offs

- **The new requirement reads as permission to move checks into the schema.**
  → The criteria bite the other way. The unbypassable criterion sends anything a
  hand-written body could dodge to the publish path. That is where every current
  check already sits. The scenario "A publish-path check rejects a body the
  published schema accepts" tests exactly that.

- **A future tightening strands a dev definition.** → It parks that body's
  instances. The poison-instance requirement already bounds and tests that
  outcome. The cost is real, and the new requirement names it as a cost to
  weigh. Pre-1.0 with nothing deployed, no stored body is worth a permanent
  two-layer split.

- **A transcription slip drops a scenario at archive.** → Both blocks came from
  a `Read` of the live spec. Neither came from memory. `openspec validate
  --strict` runs before apply. The review step compares each block against its
  source.

- **The `timers` delta carries an `allow-file` directive.** → It names three
  rules and carries its one-line reason. It exists because a MODIFIED block must
  copy prose older than those rules. This follows the convention
  `archive/2026-07-30-add-health-readiness-endpoints` set. The prose this change
  writes needs no directive.

- **Task 1.2 collides with a sibling change's task**. → Both touch the same
  blocks in `test/compile-validation.test.ts`, for different reasons.
  Task 1.2 rewrites the reasoning sentence around lines 478 to 481 and 574
  to 575. That sentence carries the "definition.ts also deserializes stored
  immutable bodies" framing. The sibling change's task 2.5, in
  `reject-unsatisfiable-required-readonly`, rewrites only an ordinal word in
  the same blocks. It changes "the seventh structural check" to "a
  structural check", or leaves "seventh" as is.

- Neither task's diff anticipates the other. Whichever change applies
  second must re-read the file's current content. It must not reuse a
  stale line-numbered diff, or it risks clobbering what the other change
  wrote.

## Migration Plan

None. No stored data changes, no schema key moves, and every `definitionHash`
stays what it is. Rollback is a revert of the commit.

## Open Questions

Whether a future placement judgment call, deciding schema-refinement versus
a `compile.ts` check, needs a required design.md line item per invariant. That
would stop the kind of inconsistent citation this change itself corrects.

Whether `reject-unsatisfiable-required-readonly` should instead export the
engine's writer-set logic, mirroring the `./schema/strip-compiled` export
precedent. That change's own design.md already considered and rejected the
idea. A `Draft`-to-`ProcessBody` type-compatibility layer costs more than the
roughly 25 duplicated lines, independent of this change's placement rule.
Whether that rejection still holds stays open here.

Whether the archive tooling supports a Purpose-section delta on an existing
capability. `openspec/specs/timers/spec.md`'s Purpose section restates the
withdrawn reasoning (proposal.md Impact, tasks § 4.2). This change's delta
spec reaches only a `### Requirement:` body, not prose outside one. The fix
there is a direct hand-edit at archive time, not a delta. Whether the
tooling should instead gain Purpose-section delta support stays open too.
