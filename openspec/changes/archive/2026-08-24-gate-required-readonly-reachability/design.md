## Context

See `proposal.md` - Why for the motivating bug. It reproduces live on a
published test process. `required: true` plus `readonly: true` on a field's
`start`-step entry gets accepted with no warning. That happens because the
same field is also editable at `middle`/`end`, both of which come after
`start`.

Two independent call sites currently answer "does something else write this
field" with a flat, step-order-blind computation:

- `src/schema/compile.ts::checkUnsatisfiableRequiredReadonly` (engine,
  publish-blocking) and its helper `writtenFieldCounts`-equivalent logic.
- `packages/web/src/areas/studio/draft/view-flags.ts::writtenFieldCounts`/
  `writtenByOther` (studio, live-editing gate, feeds `gatedKeys`, which
  `FieldMatrixGrid.tsx`, `FormEditorScreen.tsx`, and `fieldMatrixLogic.ts`'s
  bulk-toggle logic all read).

`definition-contract`'s spec already documents that these two are not one
physically shared function. Two people implement them independently. The
spec text and two documented, deliberate divergences keep them in
behavioral sync. The engine also counts a literal catalog `default`. The
studio counts a `columnMapping` target regardless of where the definition
places its field.

That precedent works for the current logic, since it is a flat count with
few branches. A dominator computation is a real graph algorithm, with more
ways for two independent implementations to drift apart silently.

`packages/web` already depends on the engine package through its `exports`
map (`workflow-engine/schema`, `workflow-engine/schema/compile`, and more).
`fieldMatrixLogic.ts` already imports `Step`/`FieldId` types from
`workflow-engine/schema` today. The engine itself never imports from
`packages/web`. That direction stays fixed.

This change reopens a reachability-aware validation, `technical-field-marker`
(ROADMAP.md stage 44), that a prior change explicitly deferred. The stated
ground was that "real reachability over a cyclic graph costs more than a
warning earns." That line is `docs/roadmap-history.md`, stage 41's "Field
matrix" entry.
ROADMAP.md's stage 44 item promises its own history entry for this
reasoning. That entry does not exist yet. It is a pre-existing gap this
change does not fix.

That judgment held while the check was a non-blocking Checks-rail warning.
It no longer holds. The same gap is now a publish-blocking rule that can
strand a live instance with no recovery path (see `proposal.md` § Why). The
cost of a wrong answer changed, not just its likelihood. A false negative
in a warning gets corrected before the next revision. A false negative in a
publish gate ships and parks a real instance.

## Goals / Non-Goals

**Goals:**
- Close the gap for both the publish-time check and the studio's live gate,
  from one dominance computation. The two must never silently disagree.
  Neither may guess wrong about which steps guarantee a value before a
  participant reaches a given step.
- Keep the existing structural-writer rules working exactly as documented
  today. Those are action output, subprocess mapping, column mapping,
  contract input fields, and catalog default. Add only the dominance
  constraint. That constraint applies to the step-scoped ones: action
  output, subprocess mapping, and the editable-entry-elsewhere case.
- Keep the studio's computation usable mid-edit. The draft may carry
  dangling references, missing ids, or an in-progress step/path. The
  author may not have finished wiring it. `writtenFieldCounts` already has
  this tolerance, via its `?? []` / `.find` guards.

**Non-Goals:**
- Recomputing or re-litigating anything about `technical` fields, CEL-driven
  flags, group fields, or the both-flags-already-true escape hatch. Those
  stay exactly as `gate-required-readonly-conflict` and
  `technical-field-marker` left them. This change only narrows what counts
  as "written."
- General-purpose graph analysis beyond dominance: computing full
  reachability sets, shortest paths, or cycle detection for its own sake.
  This design needs only "does D dominate S."
- Retroactively invalidating an already-published version. Per the base
  spec's placement rule, this is a write-path (publish-time) check. A body
  published before this change stays valid. Its instances keep running.

## Decisions

**One dominance helper, implemented in the engine, imported by the studio**.
Alternative considered: mirror the existing `writtenFieldCounts` precedent.
Implement the dominator walk twice, once per side, kept in sync by spec
and tests. Rejected: a flat count is easy to eyeball for correctness, but
a dominator algorithm is not. Letting it drift between the two consumers
would recreate a version of the exact bug this change fixes. That version
would just move the bug one level down.

`packages/web` already depends on the engine package via its `exports`
map. The engine carries no dependency back onto the web package. So
sharing the implementation costs nothing architecturally.
`workflow-engine/schema/compile` exports the helper. That is the same
export path the compile pass's other public helpers already use. It may
instead get a new sibling export, if `compile.ts` would otherwise need to
pull in the studio's draft types. The helper itself only needs a step/path
shape, and no engine- or studio-specific type.

**Algorithm: iterative dominator sets over the step graph, not a full
dominator-tree library**. For every step S reachable from `initialStep`,
the standard iterative dataflow fixpoint computes its dominator set. The
formula is `Dom(initialStep) = {initialStep}`. It also defines
`Dom(S) = {S} ∪ (∩ Dom(P) for every predecessor P of S)`, iterated to a
fixpoint.

At initialization, `Dom(initialStep) = {initialStep}`. Every other step's
`Dom` starts as the full set of step ids, not empty. So the first
intersection narrows rather than collapsing to ∅. That is the standard
gotcha of this iterative dataflow formula. Intersecting against an empty
starting set would trivially leave every `Dom(S) = {S}`. The fixpoint
would never grow it.

`initialStep` sits outside the per-step recomputation loop. Its `Dom` set
stays fixed at `{initialStep}` for the whole run, however many
predecessors it has. That count can include a back edge from a later
step. A rejection/resubmission cycle back to the process's own first step is a
common authored pattern (`start -> review -> (rejected, back to start)`).
Without this exclusion, the general recomputation rule would let
`start`'s `Dom` absorb `review`'s `Dom`, once `review`'s own `Dom`
correctly comes to include `start`. It would make an unrelated downstream
step falsely appear to dominate `initialStep`.

This initialization has a deliberate consequence for one case: a step
with zero predecessors that is not `initialStep` itself. That is an
orphan step nothing points to. No existing check rules that out (see
`specs/definition-contract/spec.md`'s dominance definition). No
intersection ever narrows an empty-predecessor step's `Dom`. So it stays
at the full universal set forever. Every step in the body reads as
dominating it.

This is the correct, intended reading, not an algorithmic gap to close. An
orphan step is unreachable. So "every path from `initialStep` to S passes
through D" is vacuously true for every D. There is no such path to fail
the condition.

The practical effect: a required+readonly pair on an orphan step's view
entry keeps finding a dominating writer. It finds one under the exact
same conditions it does today. Any writer anywhere in the body still
counts. Nothing about reachability changes what "written" means for a
step nothing can ever reach. Task 1.1's test suite adds a fourth case
exercising this directly: an orphan step's `Dom` set contains every other
step's id.

The step graph here is small. A process's step count is bounds-checked
elsewhere in the contract. The authored graph can also contain cycles, a
path back to an earlier step is legal. So a general-purpose dominator-tree
library (Lengauer-Tarjan and similar) would solve a harder problem than
this needs. The iterative fixpoint handles cycles correctly, and is easy
to verify against the definition directly. "D dominates S" is then
`D ∈ Dom(S)`.

**Edges: every `Path`, manual and automatic alike, walking `to`**. A manual
path needs a participant action to traverse. But nothing in this rule needs
"will traverse without input." It only needs "is there any way to reach S
that skips D." This rule never evaluates guard conditions (CEL). That
matches the same simplification the "every path" reasoning already makes
elsewhere in this rule.

For example, this rule excludes an `onExit`/`onPath`/`onCancel` action on
S's own step. It excludes that action regardless of any guard, because the
action fires strictly after the submission gate.

A timer's `onFire.targetPath` names one of the step's own paths. That is
already an edge. The existing publish check already requires a timer's
`targetPath` to resolve to one of that same step's own `paths`. The timer
forces that path's traversal without a manual gate. It adds no separate
edge to the graph. It only marks that this exit can happen automatically.

**Partial/draft tolerance**. The studio calls this against a draft mid-edit.
Such a draft may have steps with no `id` yet. It may have a path whose
`to` names a step no longer standing, or similar transient inconsistency.
The helper SHALL treat a missing or unresolved step/path reference as "no
edge" rather than throwing. That mirrors `writtenFieldCounts`'s existing
`?? []` / `.find`-returns-`undefined` tolerance.

This includes an `initialStep` that does not itself resolve to any step in
the input. The helper seeds `Dom(initialStep) = {initialStep}` from
whatever id `initialStep` names, whether or not that id matches a step. An
unmatched seed never appears as a predecessor's `Dom` for any real step.
So every step's `Dom` stays at its full-universal-set initialization. That
is the same vacuous-dominance outcome the orphan-step case documents
(task 1.1's dangling-`initialStep` unit-test case covers this directly).

`structuralIssues` (`compile.ts`) runs all nine structural checks in one
pass over the same body, with no short-circuit between them. Those checks
include `checkIdResolution` and `checkUnsatisfiableRequiredReadonly`. A
body may carry both a dangling `initialStep` (or any other dangling
step/path reference) and a required+readonly pair. Such a body exercises
the new dominance helper's tolerance in that same compile call, before
either check's own issues throw.

`definition.ts`'s Zod `superRefine` enforcement of `initialStep`
resolution runs later still, on the post-parse body. So a hand-authored
body with a dangling `initialStep` reaches the new dominance helper
before that Zod check ever fires. Task 2.3's companion compile-side test
exercises exactly this. The helper's tolerant treatment of a missing or
unresolved reference is therefore load-bearing on the engine side too. It
is not merely a defensive assumption carried for the studio's draft use.

**Scope of what changes vs. what does not**. Per `proposal.md`, four
step-scoped writers narrow: an action `output`, a
`subprocess.outputMapping`, another step's editable view entry, and
`columnMapping`'s own editable-elsewhere placement test. Each now
additionally requires the writing step to dominate the entry's own step.

Three things stay unaffected: `columnMapping`'s mapping-target attribution
itself, which field the mapping writes, `contract.inputFields`, and a
catalog `default`. Those are not step-scoped placements, so no step order
can matter for them.

`columnMapping`'s placement test IS step-scoped, though. It asks whether
*some other step* carries the mapping field in an editable view entry.
That is the same question the editable-entry-elsewhere rule asks. So it
narrows the same way. The entry only counts as pre-gate written when that
other, mapping-carrying step dominates the entry's own step.

**A third divergence, closed by this change rather than preserved**. The
two documented divergences above, literal-default and
columnMapping-attribution, are not the only place the engine and the
studio disagree today. The engine's `computeWriterSet` already excludes an
action output on the entry's OWN step at `onExit`/`onPath`/`onCancel` (the
`!own` guard). Those fire strictly after the submission gate. So they
cannot guarantee a value in time.

The studio's `writtenFieldCounts` (`view-flags.ts` lines 174-185) applies
no such exclusion. It counts an action's output identically across every
list, `onEntry`/`onExit`/`onCancel`/`onPath`/`onFire`. It does that
regardless of which step carries it relative to the entry's own step.

Layering the dominance test alone on top of today's studio code does not
close this gap. A step trivially dominates itself. So an own-step
`onExit`/`onPath`/`onCancel` action would still pass the dominance check
and keep counting as a writer. That leaves the studio suppressing gating
on exactly the pair the engine rejects at publish.

This change does not preserve that case. It closes that bug, in the same
commit as the dominance work, since both touch the same action-output
loop. `writtenFieldCounts`'s action-output loop gains the same own-step
post-gate exclusion `computeWriterSet` already has. An action on the
entry's own step at `onExit`, `onPath`, or `onCancel` no longer counts,
mirroring the `!own` guard exactly. Tasks 3.1 and 3.4 carry the
implementation and test-flip. The `studio-app` and `studio-form-editor`
delta specs carry the corresponding scenario.

## Risks / Trade-offs

- Risk: a body that legitimately relies on `required` + `readonly` via an
  editable entry on a non-dominating step stops publishing. This is the
  fix's entire point: that combination was never satisfiable. Nothing
  guarantees a value before the participant reaches the entry's own step.
  The Checks rail surfaces any existing *draft* hitting this before the
  author tries to publish. That is the same as any other now-caught
  finding. An already-*published* version stays unaffected (write-path
  placement, see Goals).

- Risk: dominance is more expensive than a flat count. No hard ceiling
  exists on step/path counts today. Today's `checkLengthBounds` bounds
  only string-length sites, key, plugin type, duration, pattern,
  expression source, not entity counts. In practice authored processes
  stay small: the largest example, `purchase-requisition.json`, has 13
  steps. The iterative fixpoint's cost scales with steps×paths. That
  stays negligible at that scale, next to the CEL type-check pass the
  same compile run already performs.

- Risk: the studio recomputes this on every keystroke in the field
  matrix, same as it recomputes `writtenFieldCounts` today. No new
  performance characteristic exists beyond what already exists. The
  dominance sets can memoize per render, the same way
  `written`/`writtenIds` already do in `FieldMatrixGrid.tsx`.

## Migration Plan

No data migration. This is a publish-time and studio-editing behavior
change only. No stored schema, instance, or published-version shape
changes. Deploy as a normal release. A normal revert handles rollback; no
forward-only state gets created.

## Open Questions

(none: the scope, algorithm, and shared-implementation questions above get
resolved by this design, not deferred)
