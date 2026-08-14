<!-- antislop: allow-file all -->
<!-- Every requirement in this corpus uses the same fixed SHALL/WHEN/THEN
     Gherkin grammar, established before antislop existed in this repo.
     Rewriting the prose here would touch content from many prior changes
     for a purely stylistic reason, unrelated to any change this file
     documents. -->

## MODIFIED Requirements

### Requirement: A Data lists screen maintains value lists

The admin area SHALL carry an overview screen listing every data list, and a
detail screen for one list. The detail screen SHALL change the list's label,
its description, and its values. It SHALL also report which processes
reference the list, and which of the list's columns each of those processes
maps.

A process that maps no column SHALL read as such in words. An empty column
area beside a named process SHALL NOT stand in for that sentence.

The screen SHALL print a mapped column key in the mono face, as the machine
value it is.

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

#### Scenario: The detail screen names the columns a process maps
- **WHEN** a published body maps the list's `price` column
- **THEN** the detail screen shows `price` beside that process

#### Scenario: A process mapping nothing says so
- **WHEN** a published body reads the list and maps no column
- **THEN** the detail screen states that beside the process

#### Scenario: An actor without the data list role sees an empty state
- **WHEN** an actor holding `system:admin` but not `system:datalists` opens
  either screen
- **THEN** the area shows its explanatory empty state

### Requirement: The data list screen edits the column declaration

The data list detail screen SHALL let an operator declare the list's columns.
Each row of that editor SHALL carry a key input, a label input and a type
picker over `string`, `number` and `boolean`. The screen SHALL let the operator
add a row and remove one.

Removing a column SHALL warn the operator that the removal drops that column's
value from every value of the list. The warning appears before the save, not
after it.

Where a published process maps a removed column, the warning SHALL name that
process. It SHALL name the process once, however many of the removed columns
that process maps. A removal that no published process maps SHALL warn as it
does today, with no process named.

The screen SHALL report a rejected declaration where the data would otherwise
sit, the way every other failed request in this area already reports.

Every string the screen shows SHALL come from the admin catalog through
`t(locale, key)`, in EN and DE.

#### Scenario: An operator declares a column
- **WHEN** an operator adds a column row, fills its key, label and type, and
  saves
- **THEN** the list carries that column, and the screen shows it after the
  reload

#### Scenario: A removal warns before it saves
- **WHEN** an operator removes a column row from a list whose values fill it
- **THEN** the screen states that the values go with it, before the save

#### Scenario: A removal names the process that maps the column
- **WHEN** an operator removes a column a published process maps
- **THEN** the warning names that process, before the save

#### Scenario: A process mapping two removed columns is named once
- **WHEN** an operator removes two columns one published process maps
- **THEN** the warning names that process one time

#### Scenario: An unmapped removal warns as it did
- **WHEN** an operator removes a column no published process maps
- **THEN** the warning names no process

#### Scenario: A rejected declaration reports in place
- **WHEN** the save fails because a key breaks the grammar
- **THEN** the screen shows the error where the declaration sits, and keeps the
  operator's input
