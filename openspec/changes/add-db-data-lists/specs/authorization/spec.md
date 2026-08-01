## ADDED Requirements

### Requirement: A system:datalists role gates data list maintenance

The system SHALL define a `system:datalists` role. It SHALL gate the data
list routes, and it SHALL imply no other role. No other existing role SHALL
grant data list write access on its own. This covers `system:admin` and
`system:developer` alike.

The narrow grant is the point. Staff who maintain value lists must not gain
the power to cancel instances or to publish a process.

#### Scenario: The role gates a data list write
- **WHEN** an actor holding `system:datalists` writes a data list
- **THEN** the route accepts it

#### Scenario: An admin does not inherit data list write access
- **WHEN** an actor holding only `system:admin` writes a data list
- **THEN** the route answers with an authorization error

#### Scenario: The data list role grants nothing else
- **WHEN** an actor holding only `system:datalists` cancels an instance
- **THEN** the route answers with an authorization error
