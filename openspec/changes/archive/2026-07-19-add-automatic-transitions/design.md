## Context

The engine advances an instance across a **manual** path via
`executeManualTransition` (`src/engine/transition.ts`): it runs
`onExit → onPath → onEntry`, commits `{currentStepId, transitionSeq, status}`
atomically under the `transitionSeq` optimistic-concurrency token, appends one
`HistoryEntry`, and dispatches actions post-commit through the transactional
outbox. A step whose paths are `automatic` has no executor — on entry nothing
evaluates its guards.

The authoring contract for automatic paths is already complete and enforced in
`src/schema/definition.ts`: a step's paths are all-manual XOR all-automatic;
among 2+ automatic paths `priority` is present and unique (lower first); at most
one guardless automatic path, and if present it is the highest-priority
else-branch. `src/cel/check.ts` parse/type-checks every guard at authoring time
against the field catalog. What is missing is purely the **runtime** that acts on
that frozen contract.

Guards are pure and total (CEL, no `now()`), and instance `data` does not change
during a synchronous cascade (`onEntry` actions dispatch post-commit via the
outbox; their writeback into `data` is asynchronous). This purity is the lever
the whole design leans on: within one cascade the inputs are frozen, so behaviour
is deterministic and a repeated step is provably a loop.

## Goals / Non-Goals

**Goals:**
- On entering an all-automatic step, evaluate its paths in ascending `priority`
  order and take the first path whose guard holds (guardless default = else).
- Reuse the manual machinery unchanged: each automatic hop is an ordinary
  transition — `onExit → onPath → onEntry`, one atomic commit, one `HistoryEntry`
  (`cause: "automatic"`), outbox dispatch.
- Advance run-to-rest: an `advance` call returns only when the instance sits on a
  wait-state or a terminal step.
- Wire engine-side CEL **evaluation** of guards against the frozen context
  (`data`, `instance`, `actor`, named data-source results) using the existing
  `@marcbachmann/cel-js` library (same library as the authoring check — no
  semantic drift).
- Terminate a mis-authored cascade deterministically and surface it.

**Non-Goals:**
- No change to `src/schema/definition.ts` — no new instance status, no new field.
- Timer-forced transitions and their guard-bypass (owned by the timer scheduler).
- `Action.output` result-writeback into `data` (owned by the action-dispatch
  path).
- Parallelism / multiple active steps — v1 stays single-FSM.

## Decisions

### D1. A cascade is N sequential ordinary transitions, committed per hop
Each automatic hop commits on its own (`transitionSeq += 1`, one `HistoryEntry`,
its own outbox rows), exactly like a manual transition. **Alternative:** compute
the whole chain and commit once. **Rejected** — it contradicts the audit backbone
("exactly one `HistoryEntry` per committed transition") and the per-transition
atomicity/outbox model, and would need a parallel non-committing evaluator. Reuse
beats a second code path.

### D2. `resolveAutomatic(instance)` drives run-to-rest
A driver loop runs after any commit that lands on a step (the manual transition's
result, and instance creation when `initialStep` is automatic). While the current
step is all-automatic and a path's guard matches, it takes that path via the
shared commit path; it stops when the step is manual (wait), automatic-with-no-
match (wait-state), or terminal. So `executeManualTransition` returns the instance
already advanced to its resting step. **Alternative:** expose a separate
`step()`/`tick()` the caller must pump. **Rejected** — "advance returns at rest"
is the semantics every caller wants; pumping leaks engine internals.

### D3. Termination via a visited-step set (exact), park-on-breach
The driver records each `currentStepId` it enters within one `resolveAutomatic`
run. Re-entering a recorded step is, by the frozen-input argument above, a
data-independent loop that would never terminate — so the driver stops and
surfaces a loop error. Because hops commit per D1, prior hops stand as real
history; the instance is left on its **last committed step**, its status is set
to `faulted` in a final small commit, and the error is raised to the caller for
ops/human resolution. `faulted` is an existing member of the `instanceStatus`
enum, so this needs no schema change; a faulted instance is queryable as an
error state rather than masquerading as a normal running instance parked on a
step. The fault marking is a status flip, not a transition — no path, and no
`HistoryEntry` (a dedicated fault audit event is an open question, below); the
thrown error names the repeated step.

**Alternatives:** a fixed max-depth counter — **rejected** as primary: an
arbitrary limit that a legitimate long-but-finite chain could trip, and it does
not actually prove a loop. Leaving the instance `running` (unchanged) — **rejected**:
a looped instance parked as `running` is indistinguishable from a legitimate
wait-state, hiding the fault from any status query. (A max-depth backstop can be
added later if a pathological chain length ever shows up; the visited-set makes
it unnecessary for correctness.)

### D4. Engine-side CEL evaluation mirrors the authoring check
Guards evaluate through `@marcbachmann/cel-js` against the same formal context
`src/cel/check.ts` pins (`data`, `instance {id,status,transitionSeq,
currentStepId}`, `actor {id,roles}`, named data-source results). CEL is
referenced by field `key`, not `id`. Guards see neither `result` (Action.output
only) nor `child` (subprocess steps only). Since authoring already type-checked
every guard against the catalog, evaluation is total; a guard cannot throw at
runtime for a definition that passed publish.

## Risks / Trade-offs

- **A data-independent loop slips past authoring validation** → the visited-set
  (D3) catches it deterministically at runtime and parks the instance; no
  infinite loop, no lost history.
- **Partial cascade on breach: several hops already committed before the loop is
  detected** → this is intended and consistent with the append-only model — those
  transitions genuinely happened. The surfaced error names the offending step so
  the state is explainable.
- **A later automatic hop fails (e.g. concurrency conflict) after earlier hops
  committed** → earlier commits stand; the failure surfaces like any transition
  failure. Retrying re-enters `resolveAutomatic` from the current resting step,
  which is safe because evaluation is a pure function of the frozen step + data.
- **CEL evaluation semantics drift from the authoring check** → mitigated by
  construction: one library, one pinned context shared by both check and
  evaluate. Known papercut carries over (`number` → CEL `double`).

## Migration Plan

Additive engine behaviour, no schema or data migration. Existing manual-only
instances are unaffected: `resolveAutomatic` is a no-op on a manual/terminal
resting step. No rollback concern beyond reverting the engine code.

## Open Questions

- **`cause` provenance for a cascade**: every hop records `cause: "automatic"`;
  no need to distinguish "first automatic after a manual" from "deeper cascade
  hop". Confirm this is sufficient for the audit story, or add a marker later.
- **Whether to also expose a single-hop `step()`** for testing/tooling alongside
  the run-to-rest driver. Deferred — the driver plus a visited-set assertion is
  enough to test; add if a tool needs manual pumping.
