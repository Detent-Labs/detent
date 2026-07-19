## Context

The cancellation contract is built (`definition.ts`: cancel-sink identity,
`onCancel`, `cause: "cancel"`; `compile.ts` injects the sink pre-hash). The engine
cannot yet cancel: `commitTransition` (`transition.ts`) is hardwired to an authored
`Path` — it reads `path.to` for `toStepId` and `path.id` for the HistoryEntry
`pathId`, and builds triggers via `orderedTriggerActions(source, path, target)` =
`[onExit, onPath, onEntry]`. Cancel needs the opposite: `pathId: null`, an explicit
`toStepId = CANCEL_SINK_STEP_ID`, and triggers `[onCancel, sink.onEntry]` with
**no** onExit. Subprocess spawning does not exist in the engine (grep: zero
parent/child/spawn references), so there are no children to cascade to.

## Goals / Non-Goals

**Goals:**
- A `cancelInstance(instance, body, actor?, db?)` entry point that drives a running
  instance to the cancel-sink, reusing the existing commit + outbox + OCC machinery.
- onExit skipped; `[onCancel, sink.onEntry]` enqueued; one `HistoryEntry`
  (`cause: "cancel"`, `pathId: null`, `toStepId: sink`); `status: "cancelled"`.
- Generalize the shared commit helper to commit a synthesized (null-path)
  transition without duplicating the transaction/OCC/timer-arm block.
- No-op on a non-running instance.

**Non-Goals:**
- Downward subprocess cancel propagation — deferred until subprocess spawning lands
  (no parent/child links exist). No `parent` column added now.
- Any change to `definition.ts` / the JSON contract (cancel identity already exists).
- A cancel HTTP/API surface — the entry point is an engine function; wiring a route
  is a later concern.

## Decisions

**Decision: generalize `commitTransition` to take an explicit target + null-able
path, rather than write a parallel cancel-commit block.**
The transaction body (jsonb_set of `{currentStepId, transitionSeq, status, timers}`,
OCC on `transition_seq`, HistoryEntry insert, outbox inserts, timer arming) is
identical for cancel. Duplicating it would fork the OCC/outbox invariant into two
places that must stay in sync. Change the signature so `pathId` and `toStepId` come
from params: authored callers pass `path.id`/`path.to`; cancel passes
`null`/`CANCEL_SINK_STEP_ID`. `status` also becomes a param (authored transitions
derive `completed` from `target.terminal`; cancel forces `cancelled`).
_Alternative rejected:_ a standalone `cancel.ts` with its own `db.begin` block —
smaller diff today, but two commit paths drifting apart at 3am.

**Decision: cancel lives as `cancelInstance` in `transition.ts`, taking an
already-rehydrated `instance` (not an `instanceId`).**
It receives the loaded, pin-checked instance from the caller — exactly as
`executeManualTransition`/`fireTimer` do — resolves the sink step from the frozen
body, orders `[source.onCancel ?? [], sink.onEntry ?? []]`, and calls the
generalized commit with `cause: "cancel"`. Keeps it beside the other transition
entry points; no new file.
_Adjusted during implementation:_ the original plan was `cancelInstance(instanceId)`
rehydrating internally. Taking the `instance` matches the sibling entry points and
lets the same-seq OCC-race test pass the identical seq-0 instance to both racers
deterministically. The no-op-on-non-running guard reads the caller's fresh load; the
OCC token still guards the running→cancelled race at commit.

**Decision: no-op guard on status.**
Read the instance; if `status !== "running"`, return it unchanged (no HistoryEntry,
no seq bump). Cancel is idempotent-ish at the status level; the OCC token still
guards the running→cancelled race against a concurrent normal transition.

**Decision: the synthesized cancel path is never materialized.**
Per the contract, the cancel path is not in any step's `paths`. The engine does not
construct a `Path` object for it — `commitTransition` takes `toStepId` directly, so
there is nothing to synthesize or validate against authored-path invariants.

## Risks / Trade-offs

- **Signature change to `commitTransition` touches all authored callers**
  (`executeManualTransition`, `executeAutomaticTransition`, `fireTimer`). →
  Mechanical: pass `path.id`/`path.to`/derived-status at each call site; `tsc
  --strict` + existing engine tests catch a missed one.
- **Cancel racing the run-to-rest cascade of a normal transition.** → The OCC token
  already serializes commits per instance; the loser gets `ConcurrencyConflict` and
  observes the committed state. Covered by a race scenario in the spec.
- **Deferred propagation could be forgotten.** → The spec keeps the propagation
  requirement with an explicit DEFERRED note and a "single-instance cancel has no
  children" scenario, so it resurfaces when subprocess spawning is specced.

## Migration Plan

No data migration. Additive: a new engine function + a widened internal helper
signature. Existing instances are unaffected; the sink step already exists in every
compiled body. Rollback = revert the engine change; no persisted state depends on it.

## Open Questions

- Does cancel need an actor-authorization check (who may cancel)? Out of scope here;
  the entry point takes an optional `actor` and records it, authz is a later layer.
- Reminder-timer-style non-transition audit gap does not apply — cancel is a real
  transition with a `toStepId`, so it fits the existing HistoryEntry shape.
