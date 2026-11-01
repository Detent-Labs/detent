# Spec Delta

## ADDED Requirements

### Requirement: The contract view reads in the author's words

The What it takes in and gives back view SHALL open on one checkbox,
"Other processes can call this one". No heading SHALL stand over it. Its three
lists SHALL read "What it takes in", "What it gives back" and "How it can
end". The two field lists SHALL print each field's label, or "(unnamed
field)", never a key or an id. An ending's name SHALL print in the mono
face, since a caller's guard matches it exactly. The add control SHALL
read "+ Add an ending".

#### Scenario: The view opens on its sentence

- **WHEN** an author opens What it takes in and gives back
- **THEN** the first control reads "Other processes can call this one"
- **AND** no heading reads "Contract"

#### Scenario: The field lists print labels

- **WHEN** the draft declares the field "Amount" with the key `amount`
- **AND** the process is callable
- **THEN** "What it takes in" and "What it gives back" each list "Amount"
- **AND** neither prints `amount`

#### Scenario: An ending prints in mono

- **WHEN** the contract declares the outcome `approved`
- **THEN** "How it can end" lists `approved` in the mono face

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

The address `/edit/dataSources` SHALL open the Fields tab's Where values
come from view. The addresses `/edit/contract` and `/edit/access` SHALL
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
- **THEN** the Fields tab is the open one, on Where values come from

#### Scenario: The retired Changes address opens the Versions screen

- **WHEN** an author opens `/studio/processes/p1/edit/changes`
- **THEN** the Versions screen opens for that process

#### Scenario: The form editor's address stands Steps current

- **WHEN** an author loads `/studio/processes/p1/edit/form/step_1` directly
- **THEN** the form editor opens with the Steps tab current

### Requirement: The Fields tab carries the catalog and the matrix as views

The Fields tab's sub-row SHALL read Catalog, Where fields appear and Where
values come from, in that order. Catalog SHALL hold the entity rail and the
field card. Where fields appear SHALL hold the field matrix with its
toolbar, its count line and its legend. Where values come from SHALL hold
the data sources' entity rail and the open source's editor. The tab's
count SHALL count the catalog's fields.

#### Scenario: The matrix opens as a view of Fields

- **WHEN** an author opens the Fields tab and picks Where fields appear
- **THEN** the field matrix fills the body under the sub-row
- **AND** the Fields tab stays the open tab

#### Scenario: The matrix view keeps the toolbar and the legend

- **WHEN** an author reads Where fields appear
- **THEN** the Hide-inert toggle, the count line and the legend stand above
  the grid

#### Scenario: The data sources open as a view of Fields

- **WHEN** an author opens the Fields tab and picks Where values come from
- **THEN** the data sources' rail and editor fill the body under the sub-row
- **AND** the Fields tab stays the open one

### Requirement: The Settings tab gathers the process-wide settings

<!-- antislop: allow paragraph-length sentence-length -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
The Settings tab's sub-row SHALL read Process, What it takes in and gives
back, and Access. The data sources stand on the Fields tab. The Process view SHALL hold five settings. They are the base
language, the content-locale switcher, the add-a-language control, the
cancellable setting and the two collaboration defaults. The content-locale
switcher and the add-a-language control set the language the studio edits in
this session and write no draft body. Every other control writes the draft
body. The process key SHALL stand in a closed Developer view there. The
Access view SHALL also carry the link to manage assignment groups.

#### Scenario: Setting the process to not cancellable

- **WHEN** an author unchecks the cancellable setting on the Process view
- **THEN** the draft's `ProcessBody` carries `cancellable: false`

#### Scenario: An unset process shows the cancellable setting checked

- **WHEN** the draft's `ProcessBody` has no `cancellable` key
- **THEN** the cancellable checkbox renders checked

#### Scenario: Unchecking a collaboration default disables it process-wide

- **WHEN** an author unchecks the attachments setting on the Process view
- **THEN** the draft's `collaboration.attachments` is `false`

#### Scenario: The key stands behind the Developer view

- **WHEN** an author opens the Process view
- **THEN** no key prints until the Developer view opens
- **AND** the open Developer view holds the key input in the mono face

#### Scenario: The data sources keep their rail and editor

- **WHEN** an author opens Where values come from on the Fields tab
- **THEN** the entity rail lists every data source and an Add entry
- **AND** the open data source's editor stands beside it
- **AND** the Settings tab's sub-row offers no such view

#### Scenario: The contract and the access lists keep their editors

- **WHEN** an author opens What it takes in and gives back, then Access
- **THEN** the first view holds the contract editor
- **AND** the second holds the Developer, Owner and Reader lists, and the
  assignment-groups link under them

#### Scenario: The JSON surface hides the Settings tab

- **WHEN** the JSON surface is the active surface
- **THEN** no Settings control is reachable until the author leaves it
