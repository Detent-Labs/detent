## Context

The schema already fully models subprocesses: `subprocessSpec` carries
`processId`, `versionBinding`, `pinnedVersion`/`contractRef`, and
`inputMapping`/`outputMapping`; `Instance.parent = { instanceId, stepId }` exists;
the `child` CEL namespace (`{ outcome, data }`) is authoring-checked and scoped to
subprocess steps. What is missing is entirely runtime: nothing spawns a child on
entry to a subprocess step, and no child terminal outcome flows back to the parked
parent. The engine already has the machinery this reuses — a transactional outbox
(at-least-once, retry, dead-letter, stale-claim reclaim), a re-resolution worker
that wakes a parked wait-state after an async writeback, an injected
`resolveBody(processId, version)`, and `cancelInstance` (which explicitly deferred
downward propagation "until subprocess spawning lands").

## Goals / Non-Goals

**Goals:**
- Spawn exactly one child instance when a running instance enters a subprocess
  step, linked via `parent`, dispatched post-commit and idempotent under
  at-least-once delivery.
- Resolve the child body by `versionBinding` (pinned version; or newest version
  matching `contractRef` for latest-at-spawn).
- Seed the child from `inputMapping`; return `child.outcome`/`child.data` through
  `outputMapping` into the parked parent and wake it via re-resolution.
- Cascade parent cancellation to active children (un-defer the propagation
  requirement).

**Non-Goals:**
- Fan-out / multi-instance / parallel children (v1 boundary: one active step).
- Independent upward child cancel.
- Publish-time cross-process authoring validation (inputMapping keys ⊂ child
  contract inputFields; callable child requires no field outside inputFields) —
  needs a publish-time process registry; stays deferred (roadmap #1).
- `deadline` timers, migration.

## Decisions

### Spawn is an engine-internal outbox action, not a new worker

On committing entry into a subprocess step, `commitTransition` enqueues one outbox
row `{ type: "core.spawnSubprocess", config: { subprocessStepId, childProcessId,
versionBinding, pinnedVersion?, contractRef?, inputMapping } }` in the same
transaction as the history/outbox insert. The engine registers a built-in handler
for `core.spawnSubprocess` at `startEngine` time, closing over `db`, `resolveBody`,
and a contract-indexed resolver. The existing outbox worker dispatches it like any
other action.

- *Why:* at-least-once + retry + dead-letter + reclaim are exactly what a spawn
  (async body resolution + a child INSERT that can fail) needs, and they already
  exist. Registering an internal handler needs **zero** changes to the outbox
  worker — it is an ordinary handler that happens to create a child.
- *Alternative rejected:* a dedicated `subprocess_spawns` table + spawn worker —
  re-implements the outbox's claim/retry/reclaim loop for no gain.
- The `core.` type prefix is reserved at publish time (an authored action of type
  `core.*` is a publish error) so a plugin cannot collide with the internal
  handler.

### Idempotent spawn via a deterministic child id

The child `instanceId` is `UUIDv5(parentInstanceId + parentTransitionSeq +
subprocessStepId)` (mirrors the existing idempotency-key derivation). The spawn
handler `INSERT`s the child; a primary-key conflict means the child already exists,
so a redelivered spawn is a no-op. No dedup table needed.

### Spawn handler no-ops if the parent is no longer running

Before creating the child, the handler checks the parent's status. If the parent
was cancelled/terminated while the spawn sat queued, the handler creates no child.
This closes the race where a cancel-cascade runs before the child exists and would
otherwise leave an orphan.

### Child return is a `core.returnSubprocess` action that drives the parent directly

Symmetric to spawn: when a child (an instance with a `parent`) reaches a terminal
step, `commitTransition` enqueues one `core.returnSubprocess` outbox row. Its
internal handler loads the parent (skipping unless still parked at the subprocess
step), evaluates the parent step's `outputMapping` over `child.outcome`/`child.data`,
writes the results into the parent's `data`, then advances the parent off the
wait-state and runs it to rest.

- *Why the handler advances the parent itself, not the re-resolution worker:* the
  parent's subprocess-step exit guards read the `child` namespace, which the
  standard runtime guard context (`buildGuardContext`) does not carry — flagging
  `resolve_state='pending'` for the generic worker would evaluate those guards
  child-less and never match. The handler instead selects the first hop with `child`
  in context (via `selectAutomaticPath`) and commits it with the existing
  `executeAutomaticTransition`; the remaining cascade needs no `child` and runs to
  rest normally. This localizes all subprocess awareness to `subprocess.ts` and
  leaves `resolveAutomatic`/`buildGuardContext` untouched.
- *Why an internal handler and not the generic outbox writeback:* the outbox's
  built-in writeback targets the action's **own** instance (the child). A
  return writes to the *parent*, so the handler does its own gated parent `UPDATE`
  and returns an empty patch (no `Action.output`).
- The writeback and the advance are two writes (self-healed on retry: the parent
  stays parked until it advances, and the data merge is idempotent), gated on the
  parent still being parked at the subprocess step.
- `child.data` exposes the child's full `data` (re-keyed fieldId→key). Filtering to
  `contract.outputFields` is deferred — outputMapping expressions already name the
  child keys they read.

### A subprocess step must be entered via a transition

Spawn is enqueued by `commitTransition`, which runs on a transition — not by
`createInstance`, which sets the initial step directly. So a subprocess step used
as a process's initial step never spawns. v1 requires a subprocess step to be
reached through a path (a process starts somewhere and then calls a subprocess);
enforcing this as an authoring invariant is deferred.

### Child body resolution grows a contract-indexed lookup

`pinned` reuses `resolveBody(processId, pinnedVersion)`. `latest-at-spawn` needs
`resolveLatestByContract(processId, contractRef)` — the newest published version of
`processId` whose stored per-version contract hash equals `contractRef`.
`definitions.ts` already persists each version; it gains a contract-hash column (or
computes it) and this lookup. Immutable versions ⇒ the result is cacheable.

### Cancel cascade in cancelInstance

After cancelling the parent, `cancelInstance` selects running children
(`WHERE (body->'parent'->>'instanceId') = <parentId> AND status='running'`) and
recursively cancels each (depth-first; nested chains are possible even though v1
has one active child per level). Propagation is downward only.

## Risks / Trade-offs

- **Orphaned child if the parent leaves the subprocess step via a step timer while
  the child still runs** → a timer-forced exit of a subprocess step cancels the
  running child (reuse the cascade). Tracked as an open question below; the safe
  default is to cancel.
- **Cancel/spawn race** (parent cancelled before the queued child is created) → the
  spawn handler's parent-running check no-ops the spawn, so no orphan is created.
- **`core.*` type collision with a plugin action** → reserve the `core.` prefix as a
  publish-time invariant (rejecting test included).
- **Coupling the generic outbox to a subprocess concept** → limited to one
  registered internal handler; the outbox worker code is untouched.

## Migration Plan

Additive and runtime-only; no schema/contract change, so no `definitionHash` churn
and existing published definitions are unaffected. A new `definitions`
contract-hash column is backfillable (or computed on read). Deploy the internal
handler registration with the engine; existing instances without subprocess steps
are unaffected. Rollback = stop dispatching `core.spawnSubprocess` (revert the
registration); no data migration to unwind.

## Open Questions

- **Timer-bounded subprocess wait:** if a subprocess step carries a step timer that
  fires while the child is still running, does the forced exit cancel the child
  (leaning yes) or detach it? Decide when authoring a timed subprocess example.
- **Dedicated subprocess audit event:** spawn and return currently leave only the
  parent's step-entry HistoryEntry and the child's own history (linked by
  `parent`). Whether the parent needs an explicit "spawned child X" / "child X
  returned" audit entry ties into the existing open question about a non-transition
  audit event type. Deferred unless a concrete need surfaces.
