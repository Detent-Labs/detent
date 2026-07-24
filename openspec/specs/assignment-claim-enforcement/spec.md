# assignment-claim-enforcement

## Purpose

Activates `Step.assignment` at runtime: resolving candidates synchronously
at step entry (`planStepEntry`/`applyStepEntry` seam and instance
creation), and exclusive claim/release semantics on top of the resolved
candidate set. Claiming is required before a candidate may act on an
assigned step — see the `runtime-api` capability's `submitAndTransition`
claimant-only enforcement check, which builds on this capability's
`instance.assignment` state.

## Requirements

### Requirement: Assignment candidates are resolved synchronously at step entry

`planStepEntry` SHALL, for any step carrying a declared `assignment`, resolve
its `static` strategy's `config.candidates` directly — pure, synchronous, no
registry lookup — and set `instance.assignment = { candidates, claimedBy:
undefined, claimedAt: undefined }` as part of the same commit that moves the
instance onto that step. A step with no `assignment` declared SHALL leave
`instance.assignment` unset. Instance creation at an initial step carrying a
declared `assignment` SHALL resolve candidates the same way, inside the same
creation transaction — creation is a step entry, matching how it already
arms the initial step's timers and enqueues a subprocess spawn without
routing through `planStepEntry`.

#### Scenario: Entering a step with a declared assignment populates candidates atomically

- **WHEN** a transition commits an instance onto a step with a declared
  `assignment`
- **THEN** the same commit sets `instance.assignment.candidates` to the
  strategy's resolved result, with `claimedBy` and `claimedAt` unset

#### Scenario: Entering a step with no declared assignment leaves it unset

- **WHEN** a transition commits an instance onto a step with no
  `assignment` field
- **THEN** `instance.assignment` remains unset, unchanged from today's
  behavior

#### Scenario: Creating an instance at an assignment-bearing initial step populates candidates

- **WHEN** an instance is created at an `initialStep` carrying a declared
  `assignment`
- **THEN** the created instance's `instance.assignment.candidates` reflects
  the strategy's resolved result

### Requirement: Candidates are recomputed fresh on every authored step entry

Every transition path that re-enters a step through an authored path —
manual, automatic cascade, or timer-forced — SHALL go through the
`planStepEntry`/`applyStepEntry` seam, so assignment is recomputed fresh on
every entry. No candidate set, claim, or release from a previous visit to
the same step SHALL carry forward to a later re-entry.

Migration's remap is the one deliberate exception: it goes through the same
seam but with fresh resolution suppressed, so an in-flight claim survives a
migration untouched — the step id it names is remapped like any other
carried field, but neither the candidate set nor the claim is re-validated
against the target step's declaration. This joins the existing "reconcile
in-flight action writebacks across a migration" item as a known, deferred
gap (see the `instance-migration` capability).

#### Scenario: Re-entering a step via a loop-back path clears a prior claim

- **WHEN** an instance previously claimed on a step transitions away via an
  authored path and later re-enters that same step via a loop-back path
- **THEN** the re-entered step's `instance.assignment.claimedBy` is unset,
  and `candidates` reflects a fresh resolution, not the prior visit's values

#### Scenario: A migration carries an in-flight claim forward untouched

- **WHEN** an instance holding a claim on its current step is migrated to a
  target version whose corresponding step also declares an `assignment`
- **THEN** the migrated instance's `instance.assignment` — including
  `candidates` and `claimedBy` — is unchanged from what the instance
  carried before the migration, not freshly resolved

### Requirement: The built-in static assignment strategy resolves candidates from a flat config list

The built-in static strategy (`type: "static"`, the only supported
assignment strategy type) SHALL resolve `candidates` as exactly
`config.candidates` (`config` being `assignment.strategy.config`), a flat
`string[]` of role names and/or actor ids, with no CEL evaluation and no
dynamic lookup.

#### Scenario: A static strategy resolves its configured candidate list verbatim

- **WHEN** a step declares `assignment: { strategy: { type: "static",
  config: { candidates: ["finance-approver", "user_42"] } } }`
- **THEN** entering that step sets `instance.assignment.candidates` to
  exactly `["finance-approver", "user_42"]`

### Requirement: An actor is an eligible candidate by id or by role, sharing one flat namespace

The engine SHALL treat an actor as an eligible candidate for a step if
`actor.id` is present in `instance.assignment.candidates`, or if any entry
of `actor.roles` is present in `instance.assignment.candidates`. Ids and
role names SHALL share one flat namespace — no discriminator distinguishes
them.

#### Scenario: An actor is eligible by matching id

- **WHEN** `instance.assignment.candidates` includes `"user_42"` and an
  actor with `id: "user_42"` attempts to claim
- **THEN** the actor is eligible, regardless of their `roles`

#### Scenario: An actor is eligible by matching role

- **WHEN** `instance.assignment.candidates` includes `"finance-approver"`
  and an actor whose `roles` includes `"finance-approver"` attempts to claim
- **THEN** the actor is eligible, regardless of their `id`

#### Scenario: An actor matching neither id nor role is not eligible

- **WHEN** neither an actor's `id` nor any entry of their `roles` appears in
  `instance.assignment.candidates`
- **THEN** the actor is not eligible to claim the step

### Requirement: Claiming a step is exclusive

Claiming a running instance's current step SHALL row-lock the instance
(`SELECT ... FOR UPDATE`), require the instance is `running`, require the
current step has a declared (non-unset) `instance.assignment`, require the
requesting actor is an eligible candidate, and require `claimedBy` is
currently unset. On success it SHALL set `claimedBy` to the actor's id and
`claimedAt` to the current time, and SHALL commit with no `HistoryEntry`
(no step change) and no `transitionSeq` advance (not a transition). A claim
attempt against a step with no declared assignment SHALL throw
`NotAssignedError`, distinct from `NotACandidateError`/`AlreadyClaimedError`
so it maps to its own HTTP status.

#### Scenario: An eligible candidate claims an unclaimed step

- **WHEN** an eligible candidate actor claims a running instance's current
  step, which has candidates resolved and no existing claim
- **THEN** the claim succeeds, `assignment.claimedBy` is set to the actor's
  id, `assignment.claimedAt` is set, and neither a `HistoryEntry` is
  appended nor `transitionSeq` advances

#### Scenario: A non-candidate cannot claim

- **WHEN** an actor who is not an eligible candidate attempts to claim a
  step with resolved candidates
- **THEN** the claim is rejected and `assignment.claimedBy` remains unset

#### Scenario: An already-claimed step cannot be claimed again

- **WHEN** an actor attempts to claim a step whose `assignment.claimedBy`
  is already set to a different actor
- **THEN** the claim is rejected and the existing claim is unchanged

#### Scenario: A step with no declared assignment cannot be claimed

- **WHEN** an actor attempts to claim the current step of an instance whose
  `instance.assignment` is unset
- **THEN** the claim is rejected with `NotAssignedError`

#### Scenario: Two actors racing to claim the same unclaimed step resolve to exactly one winner

- **WHEN** two eligible candidate actors concurrently attempt to claim the
  same unclaimed step
- **THEN** the row lock serializes the two attempts and exactly one
  succeeds; the other observes the step already claimed and is rejected

### Requirement: Only the claimant may release a claim

Releasing a claim SHALL row-lock the instance, require
`assignment.claimedBy` equals the requesting actor's id, and on success
SHALL clear `claimedBy` and `claimedAt`, committing with no `HistoryEntry`
and no `transitionSeq` advance.

#### Scenario: The claimant releases their own claim

- **WHEN** the actor holding a step's claim releases it
- **THEN** `assignment.claimedBy` and `assignment.claimedAt` are cleared

#### Scenario: A non-claimant cannot release another actor's claim

- **WHEN** an actor who is not the current claimant attempts to release a
  step's claim
- **THEN** the release is rejected and the existing claim is unchanged

### Requirement: Claim and release append audit events without advancing the transition sequence

A successful claim SHALL append an `assignment.claimed` `InstanceEvent`;
a successful release SHALL append an `assignment.released` `InstanceEvent`.
Each carries the instance id, the acting actor's id, the `version` and the
`transitionSeq` in force at the time — following the existing rule that an
event never advances the sequence and several may share one.

#### Scenario: A successful claim is recorded as an event

- **WHEN** an actor successfully claims a step
- **THEN** an `assignment.claimed` `InstanceEvent` is appended carrying that
  actor's id and the `transitionSeq` in force, unchanged by the claim

#### Scenario: A successful release is recorded as an event

- **WHEN** the claimant successfully releases a claim
- **THEN** an `assignment.released` `InstanceEvent` is appended carrying
  that actor's id and the `transitionSeq` in force, unchanged by the
  release
