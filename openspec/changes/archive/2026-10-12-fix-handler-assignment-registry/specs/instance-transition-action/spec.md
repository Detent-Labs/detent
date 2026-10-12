# Spec Delta

## ADDED Requirements

### Requirement: The target's entered steps resolve assignment with the engine's strategies

The action SHALL resolve the assignment of every step it enters on the target.
It uses the strategies the engine runs with. That covers the step the named path
reaches and each step the drive to rest then enters. The set has `static` and
each org-aware strategy. A strategy that publish accepted MUST NOT resolve to an
empty list for want of a registration.

#### Scenario: The named path enters an org-aware step

- **WHEN** the action moves a target onto a step declaring `org.group-members`
  for a group with two members
- **THEN** the target's candidates are those two members, and no
  `assignment.unresolved` event is recorded

#### Scenario: An automatic hop enters an org-aware step

- **WHEN** the target has a starter with a manager
- **AND** its new step leaves by an automatic path onto a step declaring
  `org.manager-of-starter`
- **THEN** that step's candidates hold the manager
