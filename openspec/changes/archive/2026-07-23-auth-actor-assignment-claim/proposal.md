## Why

Today `Actor{id, roles}` is accepted "trusted as given" at every boundary
(Runtime API Layer, HTTP wrapper) — nothing verifies it — and
`AssignmentState{candidates, claimedBy, claimedAt}` is declared on `Instance`
but never written or read anywhere in the engine. Roadmap #5d (`CLAUDE.md`)
calls this out as needed "before more than one person safely tests against a
shared engine": without it, two participants can act on the same step with no
guardrail, and any caller can claim to be anyone. Enforcement without
verified identity is meaningless — an actor can lie about who they are and
bypass any candidate check — so this change builds both pieces together.

## What Changes

- Activates the existing-but-inert `Step.assignment: { strategy: { type,
  config } }` field (already in the schema and already editable in
  `packages/editor`'s `StepsPanel`, but never validated at publish or read
  anywhere at runtime): resolved into `instance.assignment.candidates`
  synchronously at step entry via a registry-validated
  `AssignmentStrategy` plugin. Absent = unrestricted (all current
  definitions/behavior unchanged).
- New assignment-strategy registry (`assignmentStrategies`, sibling to the
  action registry) with publish-time validation
  (`checkAssignmentRegistry`), mirroring `checkActionRegistry`. Ships one
  built-in strategy: static `{ candidates: string[] }`.
- Claiming is exclusive: a candidate must `claimStep` an unclaimed step
  before acting; only the claimant may `submitAndTransition` or
  `releaseClaim`. New Runtime API operations `claimStep` / `releaseClaim`,
  and a new enforcement check in `submitAndTransition`.
- Two new `InstanceEvent` kinds: `assignment.claimed`, `assignment.released`.
- New pluggable `ActorResolver` module (`credential -> Actor`), wired at host
  startup alongside the existing `Registry`/`resolveBody` injection. No
  concrete identity provider ships in core; one non-production dev resolver
  (trusts `X-Actor-Id`/`X-Actor-Roles` headers) ships for local/example use.
- HTTP wrapper middleware resolves a request credential via the injected
  `ActorResolver` before calling into the Runtime API; a resolution failure
  maps to `401`, and the new enforcement errors map to `403`.
- New error classes: `AssignmentRegistryValidationError` (publish-time),
  `NotACandidateError` / `AlreadyClaimedError` / `NotClaimedError` /
  `NotClaimantError` (runtime), `ActorResolutionError` (resolution).
- **Explicitly out of scope**: the editor Player UI (claim/release buttons,
  blocked-state messaging) — deferred to a follow-up change, matching how
  the HTTP wrapper and Player were themselves separate roadmap items.
  Migration does not gain an assignment-reconciliation pass (an in-flight
  claim survives a migration untouched) — joins the existing "reconcile
  in-flight action writebacks across a migration" item in CLAUDE.md's
  decided-not-yet-built list.

## Capabilities

### New Capabilities
- `assignment-claim-enforcement`: step-entry candidate resolution
  (`planStepEntry`/`applyStepEntry` seam), the static built-in strategy,
  exclusive claim/release semantics, and the `submitAndTransition`
  claimant-only enforcement check.
- `assignment-registry-validation`: the `assignmentStrategies` registry and
  publish-time `checkAssignmentRegistry` validation of `Step.assignment`.
- `actor-resolution`: the `ActorResolver` extension point, the dev
  header-based resolver, and HTTP wrapper credential-to-`Actor` middleware.

### Modified Capabilities
- `definition-contract`: adds the optional `Step.assignment` field to the
  schema (additive, non-breaking).
- `runtime-api`: `submitAndTransition` gains a claimant-only enforcement
  check; adds `claimStep`/`releaseClaim` operations.
- `http-wrapper`: wires an injected `ActorResolver` into request handling
  and extends the status-code mapping table with `401`/`403` cases.

## Impact

- `src/schema/definition.ts` — no schema change; `Step.assignment` already exists.
- `src/engine/registry.ts`, `src/engine/registry-check.ts` — new
  `assignmentStrategies` registry + `checkAssignmentRegistry`.
- `src/engine/*` (the plan/apply seam, e.g. `transition.ts`) — candidate
  resolution at step entry; `claimStep`/`releaseClaim` row-locked mutations;
  two new `InstanceEvent` kinds.
- `src/runtime/api.ts` — `claimStep`, `releaseClaim`, and the
  `submitAndTransition` enforcement check.
- New `src/auth/resolve.ts` — `ActorResolver` type + dev header resolver.
- HTTP wrapper package (Roadmap #5b) — middleware wiring, error-to-status
  mapping.
- No changes to `packages/editor` (Player UI deferred).
