## Context

See proposal.md for the motivating case. Three facts about today's code shape the approach.

`src/engine/transition.ts::claimStep` runs its checks inside `updateAssignment`, under the instance's row lock. The guard receives `inst.assignment` alone. It throws `NotACandidateError` when `isEligibleCandidate(actor, assignment.candidates)` answers false. No role and no instance kind reaches that guard.

`src/runtime/api.ts::loadInstanceForActor` already treats a test instance apart. Step 1 admits `ADMIN_ROLE` to any instance. Step 2 admits a non-admin to a test instance only as its `startedBy`. Step 3 reuses `isEligibleCandidate` for ordinary instances, so the read rule and the claim rule share one predicate.

A test instance started by a `process.start` action has no `startedBy`. `src/engine/seeded-create.ts` passes the acting instance's `kind` through, but no starter. Only a `system:admin` holder can open such an instance today.

A successful claim also writes the claimant into `instance_principals`, inside `updateAssignment`. For a test instance that row changes no read. Step 1 or step 2 of `loadInstanceForActor` returns before anything consults the set.

## Goals / Non-Goals

**Goals:**

- The actors who may open a test instance may also claim its current step.
- An ordinary instance's claim rule stays byte-for-byte what it is today.

**Non-Goals:**

- No UI code. `PlayerScreen.tsx` renders Claim whenever `claimedByMe` is false, with no eligibility check of its own.
- The app area's `claimLogic.ts` mirror of `isEligibleCandidate` stays as it is. The app area lists no test instance.
- Release, delegation and submission keep their claimant-only guards.
- No new permission, grant or reserved role.

## Decisions

### Admit the starter and `system:admin`, the two actors the read rule admits

A test instance's claim admits its `startedBy` actor and any `ADMIN_ROLE` holder, beside the eligible candidates.

Five alternatives lost:

- **`system:admin` on every instance.** An admin could claim `quote_approval` in `it-onboarding`, which names `contoso-signatory` alone. That removes the separation of duties an approval step exists for.
- **Any authoring-capable actor on any test instance.** `loadInstanceForActor` refuses such an actor the read of another author's test instance. The change would then add claimants who cannot open what they claim.
- **The starter alone.** A test instance started by `process.start` has no starter. Nobody who can open it could claim it, and its real candidates cannot open it either.
- **Seed the candidate list.** Step entry, instance creation and the seeded create would each need the rule. The record would show candidates no author declared, and `assignment-strategy-registry` forbids a fallback assignee.
- **A "test user/group" exception.** `docs/current-state.md` parks that idea as out of scope. It puts test instances into real actors' task lists, and it still takes one login per candidate role.

### Put the check in the engine guard

The guard already runs under the row lock, against the locked instance. A wrapper check would need its own load before the engine call. The engine guard would still throw `NotACandidateError` afterwards.

`updateAssignment` passes the locked instance to the guard as a second argument. `releaseClaim` and `delegateClaim` ignore it. `kind` and `startedBy` never change after creation, so the guard reads settled values.

### Leave `isEligibleCandidate` untouched

`loadInstanceForActor` step 3 calls the same function for ordinary instances. Widening it would widen who may read a published instance. The test-instance admission sits beside the call in `claimStep` instead, as its own condition.

`ADMIN_ROLE` comes from `src/auth/authorize.ts`. `src/engine/definitions.ts` already imports that module, so the engine gains no new dependency direction.

The guard reads `ADMIN_ROLE` directly, the way `loadInstanceForActor` step 1 does. The `can(...)` check offers no claim permission: `Permission` holds `publish`, `cancel`, `migrate`, `read` and `visibility`. A plain role check keeps the claim side identical to the read side.

## Risks / Trade-offs

- [An admin claims an author's running test] → Exclusivity holds. Whoever claims first keeps the step. The other actor meets `AlreadyClaimedError`, and the claim event names the claimant.
- [A starter opens the app area's task URL] → The app area shows Claim disabled, though the engine accepts it. Its `claimLogic.ts` only picks a control and grants nothing. No app area screen links to a test instance.
- [The read and claim rules drift apart] → Both rules name the same two actors. The new tests pin the claim side, and the visibility tests pin the read side.
- [A candidate claims a test instance it cannot open] → This gap predates the change. Today `loadInstanceForActor` refuses a candidate who did not start the instance, and `claimStep` admits one. The change neither widens nor closes that gap. Task 2.3 records it in `docs/decisions.md`.

## Migration Plan

No data migration and no schema change. The change ships as code, tests and docs in one commit series. A rollback reverts those commits. A claim recorded under the new rule stays valid after a rollback, since submission checks `claimedBy` alone.

## Open Questions

None.
