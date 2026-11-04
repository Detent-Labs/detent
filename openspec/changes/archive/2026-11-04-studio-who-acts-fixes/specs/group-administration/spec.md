## ADDED Requirements

### Requirement: An author can list the groups open to one process

`GET /drafts/:processId/assignable-groups` SHALL return every group whose scope permits that process, as `{ "groups": [{ "groupId", "name" }] }`, ordered by name. It SHALL return no member list and no scope. It stays outside the six operator group routes.

#### Scenario: The route lists a global group

- **WHEN** a group holds the global scope
- **THEN** the route lists it for every process

#### Scenario: The route lists a scoped group for its own process

- **WHEN** a group's scope names `proc_x` and not `proc_y`
- **THEN** the route lists it for `proc_x`
- **AND** the route omits it for `proc_y`

#### Scenario: The answer exposes no member

- **WHEN** an author reads the route
- **THEN** each entry holds `groupId` and `name` and no other key

#### Scenario: No draft answers not found

- **WHEN** an actor the gate admits reads the route for a process with no draft
- **THEN** the response is 404
