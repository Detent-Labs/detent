## Why

The studio Player cannot move a test instance past a step whose candidates exclude its author. On 2026-09-14 a superadmin created a test instance of `it-onboarding` in the Player. The Claim button on `service_request` then answered "You are not a candidate for this step." That step names one candidate, the role `contoso-request-owner`. Walking this process end to end today takes three logins, one per candidate role.

## What Changes

- On a test instance, a claim admits two actors beyond the eligible candidates. The first is the actor who started the instance. The second is any actor holding `system:admin`.
- Those two actors are exactly the ones who may already open a test instance. Neither gains a claim on an instance it cannot open.
- An ordinary instance (`kind: "published"`) keeps the strict candidate check for every actor, `system:admin` included.
- Exclusivity stays. A claimed step still refuses a second claim. A step with no assignment still refuses any claim.
- The candidate list stays as resolved. The claim appends the usual `assignment.claimed` event, which names the claiming actor.
- Release, delegation and submission stay unchanged. Each one already checks the claimant alone.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `draft-test-instances`: gains the requirement that a test instance admits its starter and an administrator to a claim. Its "executes identically" requirement names this one exception.
- `assignment-claim-enforcement`: the exclusive-claim requirement defers to that exception for a test instance.
- `runtime-api`: the `claimStep` requirement states the exception, with a scenario for it.
- `authorization`: the orthogonality requirement names the test-instance claim as its second exception.
- `assignment-claim-release-consolidation`: the shared guard also reads the locked instance, and the claim guard's refusal names the claim rule.
- `http-wrapper`: the non-candidate claim scenario names the actors the claim rule admits.
- `studio-player`: a test instance behaves like any other, save this one claim rule.

## Impact

- `src/engine/transition.ts`: the claim guard reads the instance's `kind` and `startedBy`.
- `test/draft-test-instances.test.ts`: new DB-backed cases for both admitted actors and for the refusals.
- `docs/openapi.yaml` and `docs/current-state.md`: the claim route's refusal text, the authorization passage and the draft test instances section.
- `docs/decisions.md`: records an older gap. A candidate can claim a test instance it cannot open.
- No UI code. The Player already offers Claim on every assigned step.
- No definition contract change, no schema change and no data migration.
