## ADDED Requirements

### Requirement: Instance creation derives status from the initial step

Creating an instance SHALL derive its initial `status` from the target
step exactly as a transition does (`target.terminal ? "completed" :
"running"`), never a hardcoded `"running"`. A process whose `initialStep`
resolves to a terminal step is a legitimate body shape — for example, a
migration target version that existing instances relocate onto by identity
mapping and are never directly created against — and creating an instance
there SHALL NOT produce a permanently-`running` instance that can never
complete.

#### Scenario: Creation at a non-terminal initial step starts running
- **WHEN** an instance is created from a definition whose `initialStep` resolves to a non-terminal step
- **THEN** the created instance has `status: "running"`

#### Scenario: Creation at a terminal initial step completes immediately
- **WHEN** an instance is created from a definition whose `initialStep` resolves to a step with `terminal: true`
- **THEN** the created instance has `status: "completed"` from the moment it is created, and rehydrating it returns the same status
