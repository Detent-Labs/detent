## MODIFIED Requirements

### Requirement: Publishing keeps two checks the studio cannot run

The studio has no live plugin schema, and it validates a body the Zod parse has
stripped. Plugin config validation and the unknown-key check SHALL therefore
read as what publishing checks. Neither SHALL read as a publish blocker. Neither
SHALL stop the all-clear state. The server SHALL enforce both at publish time.

An assignment strategy's config is the one exception to the first check. The
studio reads it from the registry's description.

#### Scenario: A held-back plugin check does not block publish

- **WHEN** the rail shows its all-clear state
- **THEN** the publish control stays available
- **AND** the server's config and unknown-key checks stay the actual gate

### Requirement: A clear rail predicts only the checks it runs

A clear rail SHALL predict a clean publish only for three checks. They are registry
type resolution, a who-acts config's required keys, value kinds and closed keys, and a
`process.start` action's chaining-target field mapping. It SHALL predict
nothing about a subprocess step's `inputMapping` or its child's resolvability,
which `cross-process-validation` owns.

#### Scenario: A clear rail predicts a clean publish

- **WHEN** the rail shows its all-clear state
- **AND** every `process.start` action reads `"checked"` in `chainingSiteStatus`
- **AND** the draft names only registered plugin types, and maps its
  `process.start` actions only into fields the target process declares
- **THEN** publishing that draft reports no registry or chaining issue

#### Scenario: A chaining issue reaches the rail

- **WHEN** a `process.start` action maps into a field its loaded target process
  does not declare
- **THEN** the rail shows one Must fix row
- **AND** its Fix control lands on the section holding that action

## ADDED Requirements

### Requirement: The studio checks a who-acts config

Once the draft compiles and the registry loads, a who-acts config a publish refuses SHALL raise a Must fix row. Three cases count. A required key is absent, a value has the wrong kind, or a closed strategy holds an unknown key. A strategy with no description SHALL raise nothing.

#### Scenario: A stale key raises a row

- **WHEN** a step's manager strategy holds `{ "fieldId": "x" }`, written through the JSON path
- **THEN** the rail shows a Must fix row for that step
- **AND** the Publish dialog counts it as an open issue

#### Scenario: A missing key raises a row

- **WHEN** a step's group strategy holds `{}`
- **THEN** the rail shows a Must fix row for that step
- **AND** its Fix opens Who acts

#### Scenario: A value of the wrong kind raises a row

- **WHEN** a step's fixed-list strategy holds `{ "candidates": "requester" }`
- **THEN** the rail shows a Must fix row for that step

#### Scenario: An open strategy keeps an extra key

- **WHEN** a strategy missing from `closedAssignmentStrategyTypes` holds an extra key
- **THEN** the rail shows no row for that key

#### Scenario: An undescribed strategy raises nothing

- **WHEN** a step's strategy type has no description in `GET /registry`
- **THEN** the rail shows no config row for that step

#### Scenario: The check waits for the registry

- **WHEN** the registry has not loaded
- **THEN** the rail shows no config row for any step

#### Scenario: The check waits for a compiling draft

- **WHEN** another step carries a structural issue
- **THEN** the rail shows that issue and no config row

### Requirement: A group outside the process's list lands on Who acts

The check for a group missing from `allowedGroups` SHALL read "“{step}” names a group this process may not use. Under Who acts, choose a group." Its Fix SHALL open the Who acts section and SHALL NOT open the JSON surface.

#### Scenario: Fix opens the section

- **WHEN** a step names a group missing from `allowedGroups` and the author presses Fix
- **THEN** the step page opens on Who acts
- **AND** the JSON surface stays closed

### Requirement: A who-acts check on a step with no Who acts section names the JSON surface

A kind switch to a call keeps the step's `assignment`, and that step stands no Who acts section. A who-acts check on such a step SHALL read "“{step}” still holds a who-acts setting that does not pass. Correct it in the JSON surface." Its Fix SHALL open the JSON surface.

#### Scenario: A call step keeps a broken config

- **WHEN** a step holding a group strategy with no `groupId` switches to a call to another process
- **THEN** the rail's row names the JSON surface
- **AND** its Fix opens the JSON surface
