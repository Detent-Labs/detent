<!-- antislop: allow-file passive-voice -->

## Purpose

Activates `Step.assignment` at runtime. A caller resolves candidates through the
injected `AssignmentRegistry` before the entry commits. Exclusive claim and
release semantics then run on top of the resolved candidate set. The planner
consumes that set and never resolves, so it stays pure and synchronous.

Claiming is required before a candidate may act on an assigned step. See the
`runtime-api` capability's `submitAndTransition` claimant-only enforcement
check, which builds on this capability's `instance.assignment` state.

## ADDED Requirements

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

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Assignment candidates are resolved synchronously at step entry

**Reason**: Resolution now calls a registered resolver, which answers
asynchronously. The replacement requirement covers the same entry points, and
moves the call out of `planStepEntry` to keep the planner pure.

**Migration**: None. The registered `static` resolver returns its configured
list unchanged, so every existing body behaves as before.
