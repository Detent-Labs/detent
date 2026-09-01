<!-- antislop: allow-file passive-voice -->
<!-- Every scenario here uses the fixed SHALL/WHEN/THEN Gherkin grammar the
     rest of this repo's specs use (see data-retention/spec.md's own
     allow-file passive-voice for the same reason). That grammar is
     structurally passive ("WHEN X is called", "THEN Y is deleted");
     rewriting it to dodge the rule would break the required Scenario
     format. -->

## ADDED Requirements

### Requirement: The read accepts a visible scope

The read SHALL additionally accept `scope: "visible"`. It SHALL return two
sets, unioned. The first is the instances whose principal set matches the
calling actor, less those the actor is revoked from. The second is the
instances the actor is currently assigned, which the existing `scope: "mine"`
predicate already describes. `instance-visibility-set` owns both rules.

The read resolves that actor from the request's credential, the same rule
`scope: "mine"` already carries. A caller MUST NOT reach another actor's
visible set.

`scope: "visible"` is participant-facing. The existing participant-facing rules
therefore apply to it unchanged: it excludes a test instance, and it does not
set `includeDegraded`.

The two participant scopes ask different questions. The `mine` scope asks which
instances await this actor now, so it reads the current step's assignment
alone. The `visible` scope asks which instances this actor took part in, so it
reads the accumulated set. An instance the actor approved last week answers the
second question and not the first.

The `started` scope differs the same way. A starter is one principal among
several, so that scope returns a subset.

The existing requirement that the read does not scope results to the calling
actor implicitly SHALL continue to hold. The `visible` scope scopes explicitly.
The caller names it.

Combining `scope: "visible"` with an explicit `assignedTo` or `startedBy` SHALL
narrow conjunctively, the way every other filter does. Neither reaches an
instance outside the caller's visible set.

#### Scenario: A former approver finds a completed instance

- **WHEN** actor A was an assignment candidate on a step of an instance
- **AND** that instance has since completed
- **AND** A calls the read with `scope: "visible"`
- **THEN** the result includes that instance

#### Scenario: scope=mine does not return the same instance

- **WHEN** that same actor A calls the read with `scope: "mine"`
- **THEN** the result excludes that instance, because A is not a candidate or
  claimant on its current step

#### Scenario: A cancelled instance stays visible to its participants

- **WHEN** an instance A took part in is cancelled, and A calls the read with
  `scope: "visible"`
- **THEN** the result includes that instance

#### Scenario: An uninvolved actor sees nothing

- **WHEN** actor B, who is not a principal of any instance, calls the read with
  `scope: "visible"`
- **THEN** the result is empty

#### Scenario: scope=visible ignores a client-supplied actor id

- **WHEN** actor A calls the read with `scope: "visible"` and an `assignedTo`
  naming actor B
- **THEN** the result holds only instances of A's own visible set, narrowed
  further by the `assignedTo` predicate

#### Scenario: scope=visible excludes a test instance

- **WHEN** an actor who started a test instance calls the read with
  `scope: "visible"`
- **THEN** the result excludes that test instance

#### Scenario: A role-derived principal matches

- **WHEN** an instance holds role R as a principal, and an actor holding R calls
  the read with `scope: "visible"`
- **THEN** the result includes that instance

#### Scenario: Paging is unchanged

- **WHEN** a `scope: "visible"` result spans more than one page
- **THEN** it pages by the same keyset order and cursor the read already uses
- **AND** no instance appears on two pages
