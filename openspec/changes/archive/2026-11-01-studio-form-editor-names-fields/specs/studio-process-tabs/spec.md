## MODIFIED Requirements

### Requirement: The open tab stands in the address

The open tab SHALL be a sub-state of the edit route, at
`/studio/processes/:id/edit/:tab`. A reload SHALL restore the same tab. An
address naming no tab SHALL open Map. An address naming a tab the row does
not hold SHALL open Map.

A tab holding a sub-row SHALL carry its open view as a further segment, at
`/studio/processes/:id/edit/:tab/:view`. An address naming the tab alone
SHALL open that tab's first view. An address naming a view the tab does not
hold SHALL open that first view too.

The form editor and the step target SHALL stay their own sub-states. The form
editor SHALL keep winning where both arrive.

On the form editor's address, the tab row SHALL stand Steps current. An open
from a Forms card SHALL stand Forms current until the author leaves the
editor. A
reload of the form editor's address stands Steps current
(`studio-form-editor`).

Every address the eleven-tab row answered SHALL still open a place. The
address `/edit/canvas` SHALL open Map. The address `/edit/paths` SHALL open
Steps. The address `/edit/matrix` SHALL open the Fields tab's matrix view.

The addresses `/edit/dataSources`, `/edit/contract` and `/edit/access` SHALL
open their Settings view. The address `/edit/changes` SHALL open the Versions
screen. The retired `/edit/panels/:view` addresses SHALL follow the same map.

#### Scenario: A reload keeps the open tab

- **WHEN** an author opens the Forms tab and reloads the browser
- **THEN** the Forms tab is the open one

#### Scenario: An unknown tab name falls back

- **WHEN** an author opens `/studio/processes/p1/edit/nonsense`
- **THEN** the Map tab is the open one

#### Scenario: A view stands in the address

- **WHEN** an author opens Where fields appear on the Fields tab
- **THEN** the address reads `/studio/processes/p1/edit/fields/matrix`
- **AND** a reload opens that same view

#### Scenario: An unknown view name falls back to the first view

- **WHEN** an author opens `/studio/processes/p1/edit/settings/nonsense`
- **THEN** the Settings tab is the open one, on its Process view

#### Scenario: A retired tab address opens the new place

- **WHEN** an author opens `/studio/processes/p1/edit/dataSources`
- **THEN** the Settings tab is the open one, on Where values come from

#### Scenario: The retired Changes address opens the Versions screen

- **WHEN** an author opens `/studio/processes/p1/edit/changes`
- **THEN** the Versions screen opens for that process

#### Scenario: The form editor's address stands Steps current

- **WHEN** an author loads `/studio/processes/p1/edit/form/step_1` directly
- **THEN** the form editor opens with the Steps tab current
