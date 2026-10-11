## ADDED Requirements

### Requirement: The started-cases screen omits a case the participant lost sight of

The started-cases screen SHALL list what `GET /instances?scope=started`
returns, as the requirement "A started-cases screen lists what the participant
started" states. The scope withholds an instance from its starter while a
revocation names that starter. A claim, or a candidacy on an unclaimed step,
overrides the revocation. `instance-visibility-set` states both rules.

The screen SHALL show no row, no placeholder and no notice for a withheld
case. A row that names the case, its status or its step would tell the
participant what the revocation hides. A click on that row would end in a 403.

#### Scenario: A revoked case has no row

- **WHEN** an administrator revokes a participant from an instance the
  participant started
- **AND** the participant has no claim and no candidacy on its current step
- **AND** the participant opens `/app/started`
- **THEN** the list has no row for that instance

#### Scenario: A revoked case with a live assignment keeps its row

- **WHEN** an administrator revokes a participant from an instance the
  participant started
- **AND** the participant holds the claim on its current step
- **AND** the participant opens `/app/started`
- **THEN** the list carries that instance

#### Scenario: A participant who revoked nothing sees every other case

- **WHEN** an administrator revokes a participant from one of three instances
  the participant started
- **AND** the participant opens `/app/started`
- **THEN** the list carries the other two instances
