## ADDED Requirements

### Requirement: A Data lists screen maintains value lists

The admin area SHALL carry an overview screen listing every data list, and a
detail screen for one list. The detail screen SHALL change the list's label,
its description, and its values. It SHALL also report which processes
reference the list.

The detail screen SHALL mark an inactive value as inactive rather than hide
it. An operator then sees what a running instance can still hold. Saving
values sends the whole set, matching the route that replaces them.

Both screens SHALL sit behind `system:datalists`, not behind `system:admin`.
An actor without that role SHALL see the explanatory empty state the area
already shows for a missing role.

#### Scenario: The overview reaches the detail screen
- **WHEN** an authorized actor selects a list on the overview
- **THEN** the detail screen opens for that list

#### Scenario: The detail screen marks an inactive value
- **WHEN** a list holds an inactive value
- **THEN** the detail screen shows it and marks it inactive

#### Scenario: The detail screen names the processes that use the list
- **WHEN** a published body references the list
- **THEN** the detail screen names that process

#### Scenario: An actor without the data list role sees an empty state
- **WHEN** an actor holding `system:admin` but not `system:datalists` opens
  either screen
- **THEN** the area shows its explanatory empty state
