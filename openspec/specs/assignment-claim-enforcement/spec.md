<!-- antislop: allow-file passive-voice -->
# assignment-claim-enforcement

## Purpose

Activates `Step.assignment` at runtime. A caller resolves candidates through the
injected `AssignmentRegistry` before the entry commits. Exclusive claim and
release semantics then run on top of the resolved candidate set. The planner
consumes that set and never resolves, so it stays pure and synchronous.

Claiming is required before a candidate may act on an assigned step. See the
`runtime-api` capability's `submitAndTransition` claimant-only enforcement
check, which builds on this capability's `instance.assignment` state.

## Requirements

### Requirement: Assignment candidates are resolved through the registry before the entry commits

For any step carrying a declared `assignment`, the engine SHALL resolve its
candidates through the injected `AssignmentRegistry`. It calls the resolver that
the step's `strategy.type` holds.

The resolved set SHALL reach `planStepEntry` as a required field. It is not an
optional override of the kind a caller-supplied timer set uses. A caller that
omits it SHALL fail to compile. An optional field would let a missed caller
leave an assignment-bearing step unassigned. That widens who may act on it, with
no compiler diagnostic. The planner SHALL stay pure and synchronous, and SHALL
NOT call a resolver.

The commit SHALL set `instance.assignment` to that list, with `claimedBy` and
`claimedAt` unset. A step with no `assignment` declared SHALL leave
`instance.assignment` unset, and SHALL call no resolver.

Instance creation at an initial step carrying a declared `assignment` SHALL
carry candidates the same way. Creation is a step entry. This matches how
creation already arms the initial step's timers without routing through
`planStepEntry`.

The creation function itself SHALL NOT call a resolver. It takes the resolved
set as an input, the way it already takes seed data. Its caller resolves. That
lets a subprocess spawn resolve before opening its own transaction.

#### Scenario: Entering a step with a declared assignment populates candidates atomically

- **WHEN** a transition commits an instance onto a step with a declared
  `assignment`
- **THEN** the same commit sets `instance.assignment.candidates` to the
  strategy's resolved result, with `claimedBy` and `claimedAt` unset

#### Scenario: Entering a step with no declared assignment leaves it unset

- **WHEN** a transition commits an instance onto a step with no `assignment`
  field
- **THEN** `instance.assignment` remains unset, and no resolver runs

#### Scenario: Creating an instance at an assignment-bearing initial step populates candidates

- **WHEN** an instance is created at an `initialStep` carrying a declared
  `assignment`
- **THEN** the created instance's `instance.assignment.candidates` reflects the
  strategy's resolved result

#### Scenario: The planner stays free of resolution

- **WHEN** `planStepEntry` runs for a step with a declared `assignment`
- **THEN** it consumes the caller's resolved candidate set, and calls no
  resolver itself

### Requirement: Candidates are recomputed fresh on every authored step entry

Every transition path that re-enters a step through an authored path SHALL use
the `planStepEntry`/`applyStepEntry` seam. Those paths are manual, automatic
cascade, and timer-forced. The caller SHALL resolve assignment fresh before
every such entry. The seam itself no longer resolves. It consumes what the
caller resolved. No candidate set, claim, or release from a previous visit SHALL
carry forward to a later re-entry.

Migration's remap is the one deliberate exception. It uses the same seam, and
states the carry case in the field the seam requires. An in-flight claim
therefore survives a migration untouched. The step id it names is remapped like
any other carried field. Neither the candidate set nor the claim is re-validated
against the target step's declaration. This joins the existing "reconcile
in-flight action writebacks across a migration" item as a known, deferred gap
(see the `instance-migration` capability).

Carrying forward SHALL skip the resolver call entirely, rather than calling it
and discarding the result. A migration therefore costs no resolver work,
whatever a strategy does internally.

#### Scenario: Re-entering a step via a loop-back path clears a prior claim

- **WHEN** an instance with a prior claim leaves its step, then re-enters that
  same step via a loop-back path
- **THEN** the re-entered step's `instance.assignment.claimedBy` is unset, and
  `candidates` reflects a fresh resolution, not the prior visit's values

#### Scenario: A migration carries an in-flight claim forward untouched

- **WHEN** an instance holding a claim migrates to a target version whose
  corresponding step also declares an `assignment`
- **THEN** the migrated instance's `instance.assignment`, `candidates` and
  `claimedBy` included, is unchanged from what the instance carried before the
  migration, not freshly resolved

#### Scenario: A migration resolves nothing

- **WHEN** a migration remaps an instance onto a target step with a declared
  `assignment`
- **THEN** no resolver runs

### Requirement: The built-in static assignment strategy resolves candidates from a flat config list

The built-in static strategy (`type: "static"`, a registered entry in the
`AssignmentRegistry`) SHALL resolve `candidates` as exactly `config.candidates`
(`config` being `assignment.strategy.config`). That is a flat `string[]` of role
names and actor ids, with no CEL evaluation and no dynamic lookup.

`"static"` is no longer the only supported strategy type. It remains the entry
an author gets by default.

#### Scenario: A static strategy resolves its configured candidate list verbatim

- **WHEN** a step declares `assignment: { strategy: { type: "static", config:
  { candidates: ["finance-approver", "user_42"] } } }`
- **THEN** entering that step sets `instance.assignment.candidates` to exactly
  `["finance-approver", "user_42"]`

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
(`SELECT ... FOR UPDATE`), require the current step has a declared
(non-unset) `instance.assignment`, require the requesting actor is an
eligible candidate, and require `claimedBy` is currently unset. On success it
SHALL set `claimedBy` to the actor's id and `claimedAt` to the current time,
and SHALL commit with no `HistoryEntry` (no step change) and no
`transitionSeq` advance (not a transition). A claim attempt against a step
with no declared assignment SHALL throw `NotAssignedError`, distinct from
`NotACandidateError`/`AlreadyClaimedError` so it maps to its own HTTP status.
Against a non-running instance none of these checks run: the row lock is
taken, `status !== "running"` short-circuits to a silent no-op, and the
instance is returned unchanged (see `assignment-claim-release-consolidation`)
— not a rejection, since there is no assignment state to reject a change to.

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

### Requirement: The current claimant may delegate a claim to a named actor

The system SHALL let the actor holding a step's claim delegate it to one
named actor id. The target actor need not be an eligible candidate.
Delegating SHALL row-lock the instance and check that
`assignment.claimedBy` equals the requesting actor's id. On success it
SHALL set `claimedBy` to the target actor's id and refresh `claimedAt`.
This commits with no `HistoryEntry` and no `transitionSeq` advance, the
same mechanism claim and release already use.

The candidate list SHALL NOT change: the delegate does not join
`assignment.candidates`. If the delegate later releases the claim, the
step returns to the original candidate pool, not to the delegate alone.
No check SHALL validate a target actor id against an account directory.
The fields `assignedTo`, `startedBy`, and `claimedBy` already carry
unchecked opaque ids the same way.

#### Scenario: The claimant delegates to a named actor

- **WHEN** the actor holding a step's claim delegates it to a target actor
  id
- **THEN** `assignment.claimedBy` is set to the target actor's id,
  `assignment.claimedAt` refreshes, and `assignment.candidates` is
  unchanged

#### Scenario: A non-claimant cannot delegate

- **WHEN** an actor who is not the current claimant attempts to delegate
  the step's claim
- **THEN** the delegation is rejected and the existing claim is unchanged

#### Scenario: A delegate target need not be an eligible candidate

- **WHEN** the current claimant delegates to an actor id absent from
  `assignment.candidates`
- **THEN** the delegation succeeds and that actor becomes the claimant

#### Scenario: A delegate does not join the candidate pool

- **WHEN** a delegate who is not an original candidate releases the claim
- **THEN** the step returns to `claimedBy` unset, and only the original
  `assignment.candidates` are eligible to claim it again

#### Scenario: A second delegation supersedes the first

- **WHEN** a claimant delegates to actor A, and actor A then delegates the
  same claim to actor B
- **THEN** `assignment.claimedBy` becomes B, and A can no longer submit or
  release the step

#### Scenario: A non-running instance is a silent no-op at the engine level

- **WHEN** a delegation is attempted against an instance whose `status` is
  not `"running"`
- **THEN** the row lock is taken, no guard or write runs, and the instance
  is returned unchanged, matching `claimStep`/`releaseClaim` (see
  `assignment-claim-release-consolidation`)

### Requirement: Delegation appends an audit event without advancing the transition sequence

A successful delegation SHALL append an `assignment.delegated`
`InstanceEvent`. It SHALL carry the instance id, the delegating actor's
id, the target actor's id, the `version`, and the `transitionSeq` in
force. This follows the existing rule that an event never advances the
sequence.

#### Scenario: A successful delegation is recorded as an event

- **WHEN** a claimant delegates a step's claim to a target actor
- **THEN** an `assignment.delegated` event is appended carrying both actor
  ids and the `transitionSeq` in force, unchanged by the delegation
