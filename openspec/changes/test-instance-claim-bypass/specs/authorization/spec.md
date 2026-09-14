<!-- antislop: allow-file em-dash passive-voice sentence-length -->
<!-- The MODIFIED block copies live requirement text verbatim; this directive covers that copied text. -->
## MODIFIED Requirements

### Requirement: Authorization is orthogonal to assignment/claim enforcement

Where a step declares an `assignment`, `submitAndTransition`, `claimStep`, and
`releaseClaim` SHALL remain gated exclusively by the existing assignment/claim
mechanism (`NotAssignedError`, `NotACandidateError`, `AlreadyClaimedError`,
`NotClaimedError`, `NotClaimantError`), unrelated to `system:publish` /
`system:cancel-any`. An actor may hold neither reserved role and still fully
participate in process instances it is assigned to. (The one exception is the
starter-or-operator floor `submitAndTransition` applies to a step that declares
**no** assignment, where the assignment/claim mechanism defines no relationship
to enforce — see the `runtime-api` capability.)

A second exception covers `claimStep` on a test instance. There, the claim
also admits the instance's starter and any `system:admin` holder, per the
`draft-test-instances` capability. On an instance whose `kind` is
`"published"`, no reserved role admits a claim.

#### Scenario: An actor with no reserved roles can still submit an assigned step

- **WHEN** an actor whose `roles` includes neither `system:publish` nor
  `system:cancel-any`, but who is a claimed candidate on the instance's
  current step, submits data via `submitAndTransition`
- **THEN** the submission is processed normally, unaffected by this
  capability

#### Scenario: A reserved role admits no claim on a published instance

- **WHEN** an actor holding `system:admin`, and no candidacy, claims the
  current step of an instance whose `kind` is `"published"`
- **THEN** the claim fails with `NotACandidateError`
