## Context

`src/engine/transition.ts:856-917` (verified against current file
contents):

```ts
export async function claimStep(instanceId: string, actor: Actor, db: SQL = sql): Promise<Instance> {
  return withTransaction(db, async (tx) => {
    const inst = await loadForClaim(tx, instanceId);
    if (inst.status !== "running") return inst;
    const assignment = inst.assignment;
    if (!assignment) throw new NotAssignedError(instanceId);
    if (assignment.claimedBy !== undefined) throw new AlreadyClaimedError(instanceId);
    if (!isEligibleCandidate(actor, assignment.candidates)) throw new NotACandidateError(instanceId, actor.id);
    const claimedAt = new Date().toISOString();
    const next = { candidates: assignment.candidates, claimedBy: actor.id, claimedAt };
    await tx`UPDATE instances SET body = jsonb_set(body, '{assignment}', (${[next]}::jsonb) -> 0) WHERE instance_id = ${instanceId}`;
    const event: InstanceEvent = { id: newInstanceEventId(), instanceId: inst.instanceId, transitionSeq: inst.transitionSeq, version: inst.version, kind: "assignment.claimed", payload: { actorId: actor.id }, at: claimedAt };
    await appendInstanceEvent(tx, event);
    return { ...inst, assignment: next };
  });
}

export async function releaseClaim(instanceId: string, actor: Actor, db: SQL = sql): Promise<Instance> {
  return withTransaction(db, async (tx) => {
    const inst = await loadForClaim(tx, instanceId);
    if (inst.status !== "running") return inst;
    const assignment = inst.assignment;
    if (!assignment || assignment.claimedBy !== actor.id) throw new NotClaimantError(instanceId, actor.id);
    const releasedAt = new Date().toISOString();
    const next = { candidates: assignment.candidates };
    await tx`UPDATE instances SET body = jsonb_set(body, '{assignment}', (${[next]}::jsonb) -> 0) WHERE instance_id = ${instanceId}`;
    const event: InstanceEvent = { id: newInstanceEventId(), instanceId: inst.instanceId, transitionSeq: inst.transitionSeq, version: inst.version, kind: "assignment.released", payload: { actorId: actor.id }, at: releasedAt };
    await appendInstanceEvent(tx, event);
    return { ...inst, assignment: next };
  });
}
```

Identical shape: row-lock via `loadForClaim`, running-instance no-op,
validate (different guard per function), compute one timestamp used for
both the new assignment value and the event's `at`, `jsonb_set` write,
append an `InstanceEvent` (different `kind`), return the merged instance.
This is engine core backing the `assignment-claim-enforcement` capability
("Claiming a step is exclusive", "Only the claimant may release a claim",
"Claim and release append audit events without advancing the transition
sequence") — behavior here is load-bearing, not incidental.

## Goals / Non-Goals

**Goals:**
- One helper implements the row-lock/no-op/guard/write/event sequence;
  `claimStep`/`releaseClaim` supply only what differs (guard, computed
  next state, event kind).
- Preserve the single-timestamp guarantee: the value written into
  `assignment.claimedAt`/`releasedAt` and the event's `at` come from the
  same `new Date().toISOString()` call, exactly as today.
- Preserve every thrown error type and every no-`HistoryEntry`/no-
  `transitionSeq`-advance property.

**Non-Goals:**
- Any change to `assignment-claim-enforcement`'s specified behavior —
  exclusivity, no-op semantics, event shape, error types.
- Touching `loadForClaim`, `appendInstanceEvent`, `isEligibleCandidate`,
  or any other transition-execution helper.
- Extending the helper for any future third caller — two call sites don't
  justify more generality than this needs today.

## Decisions

### Shared `updateAssignment` helper, guard + computeNext + eventKind as parameters

```ts
async function updateAssignment(
  instanceId: string,
  actor: Actor,
  db: SQL,
  guard: (assignment: AssignmentState | null | undefined) => void,
  computeNext: (assignment: AssignmentState, at: string) => AssignmentState,
  eventKind: "assignment.claimed" | "assignment.released",
): Promise<Instance> {
  return withTransaction(db, async (tx) => {
    const inst = await loadForClaim(tx, instanceId);
    if (inst.status !== "running") return inst;

    guard(inst.assignment);
    const at = new Date().toISOString();
    const next = computeNext(inst.assignment as AssignmentState, at);
    await tx`UPDATE instances SET body = jsonb_set(body, '{assignment}', (${[next]}::jsonb) -> 0)
      WHERE instance_id = ${instanceId}`;

    const event: InstanceEvent = {
      id: newInstanceEventId(),
      instanceId: inst.instanceId,
      transitionSeq: inst.transitionSeq,
      version: inst.version,
      kind: eventKind,
      payload: { actorId: actor.id },
      at,
    };
    await appendInstanceEvent(tx, event);

    return { ...inst, assignment: next };
  });
}

export async function claimStep(instanceId: string, actor: Actor, db: SQL = sql): Promise<Instance> {
  return updateAssignment(
    instanceId,
    actor,
    db,
    (assignment) => {
      if (!assignment) throw new NotAssignedError(instanceId);
      if (assignment.claimedBy !== undefined) throw new AlreadyClaimedError(instanceId);
      if (!isEligibleCandidate(actor, assignment.candidates)) throw new NotACandidateError(instanceId, actor.id);
    },
    (assignment, at) => ({ candidates: assignment.candidates, claimedBy: actor.id, claimedAt: at }),
    "assignment.claimed",
  );
}

export async function releaseClaim(instanceId: string, actor: Actor, db: SQL = sql): Promise<Instance> {
  return updateAssignment(
    instanceId,
    actor,
    db,
    (assignment) => {
      if (!assignment || assignment.claimedBy !== actor.id) throw new NotClaimantError(instanceId, actor.id);
    },
    (assignment) => ({ candidates: assignment.candidates }),
    "assignment.released",
  );
}
```

`guard`: `inst.assignment` is typed `AssignmentState | null | undefined`
(confirmed against the actual `Instance` type during implementation, wider
than the design's first draft of `| undefined`), and `guard` is
responsible for throwing whenever `assignment` is missing or otherwise
invalid for the operation — both `claimStep`'s and `releaseClaim`'s guards
already do this (`!assignment` is the first disjunct in both, which
catches `null` and `undefined` alike). `computeNext` is only ever called
after `guard` returns normally, so `inst.assignment as AssignmentState` is
a safe narrowing cast at that one call site, not a broad unsafe cast —
both callers' guards make it unreachable otherwise.

The timestamp is computed once, inside the helper, and threaded into
`computeNext(assignment, at)` — not recomputed by `computeNext` itself.
This is the one detail that matters most here: today, `claimedAt`
(written into `assignment`) and `at` (written into the event) are the
*same* `new Date().toISOString()` call's result. A naive extraction where
each caller's `computeNext` called `new Date()` independently would still
typecheck and pass most tests, but would silently let the assignment's
timestamp and the event's timestamp diverge by however long the write
takes — a real, subtle behavior regression the spec doesn't explicitly
pin (it only says "`claimedAt` is set" / "carrying ... the `transitionSeq`
in force", not "equal to the event's `at`"), so nothing would fail loudly.
Threading `at` through the parameter closes this off structurally.

Alternative considered: give `computeNext` no `at` parameter and instead
have `updateAssignment` merge `at` into whatever `computeNext` returns
(e.g. `{ ...computeNext(assignment), claimedAt: at }`). Rejected —
`releaseClaim`'s `next` has no timestamp field at all (`{ candidates }`
only; `claimedAt` is *cleared*, not set to `at`), so a helper-side merge
would need to know which field name (if any) gets stamped, per caller —
more special-casing than just passing `at` through and letting each
`computeNext` decide whether to use it.

### `AssignmentState` import

`transition.ts` does not currently import `AssignmentState` as a type
(only uses it structurally via `Instance["assignment"]` inference). Add it
to the existing `import type { ... } from "../schema/definition.js"` list
for the helper's and closures' signatures.

## Risks / Trade-offs

- [Risk] This is engine core backing exclusivity and audit-event
  guarantees — a mistake in the guard/computeNext split could silently
  weaken exclusivity (e.g. a claim succeeding when already claimed) or
  desynchronize the assignment/event timestamps (see Decisions above).
  → Mitigation: verify against `test/assignment.engine.test.ts` and
  `test/assignment.runtime-api.test.ts` specifically (not just `tsc`),
  including the concurrent-claim race test if present; task 3 requires a
  direct read of both files' claim/release/race coverage before marking
  done.
- [Risk] None identified beyond the above — the row-lock, no-op check,
  `jsonb_set` write, and event-append call are lifted verbatim into the
  helper with no logic change.

## Migration Plan

Pure refactor, no schema/contract/data changes, no change to any
`assignment-claim-enforcement`-specified behavior. Rollback is reverting
`src/engine/transition.ts`.

## Open Questions

None outstanding.
