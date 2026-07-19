## Context

The contract (`src/schema/definition.ts`) already carries `instanceStatus =
["running","completed","cancelled","faulted"]`, but nothing produces
`"cancelled"`. Triggers today (`onExit → onPath → onEntry`) are strictly bound to
authored path transitions; cancel is an out-of-band event. The audit backbone
(`HistoryEntry`) is transition-shaped: `toStepId` is required, and by design ids
must resolve against the pinned version body (each entry records its `version`).

Two candidate shapes were weighed earlier: (A) cancel as a synthesized transition
to a synthesized terminal cancel-sink; (B) cancel as a lifecycle event with a
nullable `HistoryEntry.toStepId`. This design implements A. B was rejected because
a nullable `toStepId` punches a hole in the audit backbone whose premise is that
history ids resolve against the version body — the property the project most wants
to keep.

Verified constraints in the current schema:
- `path.to` is `stepId` (required) — a "path" must target a real step, which is
  precisely why A needs a real sink rather than a dangling edge.
- Contracted-process invariants (`processBody.superRefine`): every terminal step
  needs an `outcome` ∈ `contract.outcomes`, and every declared outcome needs a
  terminal step. The injected sink + reserved `"cancelled"` outcome satisfy both
  as a matched pair.
- The all-manual/all-automatic invariant iterates only `step.paths`, so a
  synthetic cancel path kept out of that array is untouched.
- `definitionHash = JCS(ProcessBody)`; the versioned wrapper is not hashed.
  Injection must therefore happen before the hash is taken.

## Goals / Non-Goals

**Goals:**
- Make cancel a first-class, auditable transition that reuses existing machinery
  (outbox, `transitionSeq` OCC, `HistoryEntry`).
- Keep the audit backbone's "ids resolve against the version body" property — no
  nullable `toStepId`.
- Give cancellation a per-step cleanup home (`onCancel`) without a new trigger
  concept.
- Define subprocess cancel propagation and close the "cancelled child has no
  outcome to guard on" edge via a reserved outcome.

**Non-Goals:**
- Runtime executor implementation (cancel × outbox at run time). Specified here,
  built with the engine skeleton.
- The migration audit-event question (transition-shaped `HistoryEntry` vs. a
  pure version change) — explicitly out of scope.
- Independent, upward-propagating child cancel — excluded in v1.
- Non-cancellable / guarded-cancel steps — YAGNI until a real need appears.

## Decisions

**D1 — Cancel is a synthesized transition, not a lifecycle event (A over B).**
Reusing the transition path keeps `HistoryEntry` honest and inherits outbox
ordering and OCC for free. Cost: a real sink step must exist. Alternative (B,
nullable `toStepId`) is less machinery but weakens the audit invariant; rejected.

**D2 — Injection at publish-time compile, before hashing.** A compile pass
augments the authored `ProcessBody` with the sink (and, if contracted, the
reserved outcome), then the hash is taken over the augmented body. This keeps
instances rehydrating against a body that actually contains the sink their
history references. Alternative: a well-known runtime sentinel id not in the body
— rejected because `toStepId`/`currentStepId` would not resolve against the
version body.

**D3 — Reserved `"cancelled"` outcome for contracted processes.** Injecting the
sink and the reserved outcome as a matched pair satisfies both contracted-process
invariants by construction, and simultaneously gives a cancelled child an outcome
(`child.outcome == "cancelled"`) the parent can guard on. Alternative: forbid
cancel inside contracted processes — too restrictive.

**D4 — `onCancel` reuses the action model; no new trigger type.** `onCancel:
Action[]` on the step becomes the synthetic cancel path's `onPath`. Its `output`
targets join the existing body-refinement validation loop (currently only
`onEntry`/`onExit` outputs are checked). Alternative: a distinct cancel-action
envelope — unnecessary; `Action` already fits.

**D5 — Cancel skips `onExit`.** `onExit` models normal step completion; cancel is
abnormal. Order is `onCancel` cleanup → `onEntry`(sink). This is a deliberate
semantic choice recorded in the spec.

**D6 — Downward-only propagation in v1.** Parent cancel walks `parent` links and
cancels active children recursively. Independent upward child cancel is excluded,
which sidesteps any case where a cancelled child would need an outcome the parent
did not anticipate.

## Risks / Trade-offs

- [Compile pass diverges from author intent or double-injects on recompile] →
  Idempotence + determinism are a spec requirement with a dedicated test; the
  authoring invariant (exactly one cancel-sink) rejects a doubly-injected body.
- [Reserved `"cancelled"` outcome collides with an author-declared outcome named
  `"cancelled"`] → Reserve the name: reject an authored `outcome == "cancelled"`
  at validation, or namespace the reserved value. Decide during specs/apply.
- [Cancel-sink identity must be stable and recognizable across recompiles for the
  invariant and for history resolution] → Use a deterministic, well-known sink id
  derived from the body (not random); document it as a contract constant.
- [Runtime cancel × outbox semantics are only specified, not built] → Acceptable:
  the executor lands later; this change ships schema + validation + compile pass
  with tests, and the runtime spec constrains that later work.
- [`examples/expense-approval.json` shape changes after compile] → Keep the
  authored example uncompiled; assert the compiled form in a test rather than
  hand-editing the fixture.

## Migration Plan

No runtime/data migration (no engine or persisted instances exist yet).
Deployment is purely additive to the contract and tooling:
1. Land the schema additions (`onCancel`, `cause: "cancel"`) — backward-compatible
   (optional field, enum widening).
2. Land the compile pass and the authoring invariant together with their tests.
3. Rollback = revert the change set; no persisted state depends on it yet.

## Open Questions

Resolved during apply:

- Cancel-sink identity is a fixed, well-known constant: `CANCEL_SINK_STEP_ID =
  "step_cancel_sink"`, `CANCEL_SINK_KEY = "cancel_sink"`. The reserved outcome is
  the plain literal `RESERVED_CANCEL_OUTCOME = "cancelled"` (constant, not
  namespaced) — unique per process, which is all the invariants require.
- Yes, an authored step colliding with the reserved id/key, or an authored
  `outcome == "cancelled"`, is rejected — enforced by `authoredProcessBody`.
- The compile pass lives in `src/schema/compile.ts` (beside the schema; no engine
  yet).

No open questions remain for this change. The runtime half (cancel × outbox,
history writeback, downward propagation) is specified here and built with the
engine skeleton (#3).
