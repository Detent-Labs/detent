<!-- antislop: allow-file passive-voice sentence-length trailing-negation -->
<!-- The MODIFIED block copies live requirement text verbatim; this directive covers that copied text. -->
## ADDED Requirements

### Requirement: A test instance admits its starter and an administrator to a claim

On an instance whose `kind` is `"test"`, a claim SHALL admit two actors beside
the eligible candidates. One is the instance's own `startedBy` actor. The
other is any actor holding `system:admin`. These are the same actors the
single-instance read rule admits to a test instance.

Every other claim rule SHALL hold unchanged. The current step still needs a
declared assignment, and an existing claim still refuses a second one. The
claim SHALL leave `assignment.candidates` as resolved. It SHALL append the
ordinary `assignment.claimed` event, naming the claiming actor.

An instance whose `kind` is `"published"` SHALL admit no actor outside its
eligible candidates, whatever roles that actor holds.

#### Scenario: The starter claims a test instance's step without candidacy
- **WHEN** a test instance's starter claims its current step, matching no candidate by id or role
- **THEN** the claim succeeds and `claimedBy` names the starter
- **AND** the candidate list stays as resolved, and an `assignment.claimed` event names the starter

#### Scenario: An administrator claims another actor's test instance without candidacy
- **WHEN** a `system:admin` holder claims a test instance's current step
- **AND** that holder neither started the instance nor matches a candidate
- **THEN** the claim succeeds and `claimedBy` names that holder

#### Scenario: Any other non-candidate stays refused on a test instance
- **WHEN** an actor claims a test instance's current step without candidacy
- **AND** that actor neither started the instance nor has `system:admin`
- **THEN** the claim fails with `NotACandidateError`, and the assignment stays as it was

#### Scenario: A published instance keeps the strict candidate check
- **WHEN** a published instance's starter, or a `system:admin` holder, claims its step without candidacy
- **THEN** the claim fails with `NotACandidateError`, and the assignment stays as it was

#### Scenario: The admission does not override an existing claim
- **WHEN** a test instance's starter claims a step another actor already holds
- **THEN** the claim fails with `AlreadyClaimedError`, and the existing claim stays as it was

## MODIFIED Requirements

### Requirement: A test instance executes the process's current draft body

Creating a test instance SHALL start a real instance of the target process
whose frozen body is the process's current draft body, not a published
version. Every execution mechanism that applies to an ordinary instance
SHALL apply identically: candidate resolution and assignment at step entry,
claim and release, submission and transition, timer arming and firing, and
action dispatch through the transactional outbox with real side effects.
Nothing about a test instance's execution SHALL be simulated, mocked, or
suppressed.

One exception applies to claim eligibility alone. A test instance's claim
also admits its starter and an administrator. The requirement "A test instance
admits its starter and an administrator to a claim" states it. Candidate
resolution itself stays identical.

#### Scenario: A test instance is created from an unpublished draft edit
- **WHEN** an authoring-capable actor creates a test instance for a process whose draft was just edited
- **THEN** a new instance is created and its resolved body reflects the draft's current content, including edits never published

#### Scenario: A test instance dispatches real actions
- **WHEN** a test instance transitions across a path whose `onPath` carries an action (for example `notification.email`)
- **THEN** the action is enqueued to the transactional outbox and dispatched exactly as it would be for an instance created against a published version

#### Scenario: A test instance supports claim and submit like any instance
- **WHEN** a test instance is on a step with assignment, and a candidate actor claims it and submits data
- **THEN** the claim and submission succeed and transition the instance using the same rules that govern an ordinary instance
