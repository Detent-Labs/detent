## MODIFIED Requirements

### Requirement: The process list shows draft and published state per process

The `/processes` screen SHALL list one row per process on the actor's own
Developer or Owner list, per the `process-access-roles` capability. An actor
holding `ADMIN_ROLE` SHALL see every process instead.

`GET /processes` SHALL stay unfiltered. Two other readers need the full
list: the participant's Start-a-process screen and the operator's pickers.
The route `GET /drafts` narrows to the actor's Developer list on its own,
per the `process-drafts` capability. The `/processes` screen SHALL read the actor's
own Developer- and Owner-listed process ids. It SHALL narrow its combined
rows to that set in the browser.

Each row SHALL name its process by its label, in the process's base locale.
Where a draft exists, the draft's label SHALL win over the published one. A
process whose label yields no text SHALL read "Untitled process". The rows
SHALL sort by that name.

The name SHALL be a link. On a row with a draft it SHALL open the draft. On a
row without one it SHALL open the Versions screen.

Where a draft exists, the row SHALL say who last saved it and how long ago.
It SHALL name that person by display name. Where a published version exists,
the row SHALL print its version number and its age. A column with nothing to
print SHALL say so in words.

Outside its Developer view, the row SHALL print no key and no process id. It
SHALL print no account id, no revision and no hash either. Each row SHALL
hold a Developer view, closed on open. It SHALL print the key, the process
id, the draft revision and the published hash. It SHALL also print the id
of the account that last saved the draft.

The screen SHALL offer two actions: create a new process, and import a
promoted version. A row SHALL offer creating a draft when it has none, and
discarding the draft when it has one. A row with both a draft and a
published version SHALL also offer Versions. Discarding SHALL need a
confirmation that names the process by its name. It SHALL call
`DELETE /drafts/:processId`, leaving published versions untouched.

The import action SHALL be a secondary button that opens the file chooser.
The native file input SHALL stay hidden.

#### Scenario: A never-published process appears

- **WHEN** a draft exists for a process with no `definitions` rows
- **THEN** the row prints the draft's name and its saved-by line
- **AND** the Published column reads "Not published yet"

#### Scenario: A published process with no draft appears

- **WHEN** a process has published versions and no draft
- **THEN** the row prints the published name and "v<N> · <time> ago" for the
  latest version
- **AND** the Draft column reads "No draft"
- **AND** the row offers creating a draft rather than opening one

#### Scenario: Discarding removes only the draft

- **WHEN** an author confirms discard for a process with published versions
- **THEN** the draft's saved-by line disappears from the row and the
  published version still renders

#### Scenario: A process outside the actor's lists stays hidden

- **WHEN** an actor holds `system:developer`
- **AND** the actor is on process A's Developer list but not process B's
- **AND** both processes have published versions
- **THEN** the list shows process A's row
- **AND** the list omits process B's row

#### Scenario: An admin sees every process

- **WHEN** an actor holding `ADMIN_ROLE` opens `/processes`
- **THEN** the list shows every process, regardless of that actor's own
  Developer or Owner lists

#### Scenario: The saved-by line names the person

- **WHEN** an account whose display name is "Demo Superuser" saved a draft
  three days ago
- **THEN** the Draft column reads "Saved by Demo Superuser, 3 days ago"
- **AND** the account id appears nowhere outside the row's Developer view

#### Scenario: A save from an account outside the directory names no one

- **WHEN** the draft list reports no display name for the account that saved
  a draft two hours ago
- **THEN** the Draft column reads "Saved 2 hours ago"

#### Scenario: The draft's name wins over the published one

- **WHEN** a process publishes the label "Laptop Inventory"
- **AND** its draft renames it to "Laptop Pool"
- **THEN** the row reads "Laptop Pool"

#### Scenario: A process with no label reads as untitled

- **WHEN** a fresh draft's label is `{}`
- **THEN** the row reads "Untitled process"

#### Scenario: The name opens the draft

- **WHEN** an author activates the name of a row with a draft
- **THEN** the studio opens that draft
- **AND** the name is an `<a href>` that carries the draft's own address

#### Scenario: The name of a row without a draft opens Versions

- **WHEN** an author activates the name of a row with no draft
- **THEN** the studio opens that process's Versions screen
- **AND** the row offers no separate Versions button

#### Scenario: The Developer view holds the machine values

- **WHEN** an author opens a row's Developer view
- **THEN** it prints the key and the process id in the mono face
- **AND** it prints the draft revision where a draft exists
- **AND** it prints the full published hash where a version exists
- **AND** it prints the saving account's id where a draft exists

#### Scenario: The import control is one secondary button

- **WHEN** an author opens the process list
- **THEN** "Import a promoted version" is a secondary button
- **AND** activating it opens the file chooser
- **AND** the screen has no visible native file input

#### Scenario: The discard confirmation names the process

- **WHEN** an author discards the draft of the process named "Laptop Pool"
- **THEN** the confirmation reads "Discard the draft of “Laptop Pool”? You
  lose its unpublished edits."

<!-- antislop: allow synonym-rotation -->
<!-- "render" in this MODIFIED heading must match the live spec; "display name" names the account field. -->
### Requirement: The process list, its dialogs, and the templates and versions screens render from compiled styles

`screens/ProcessesScreen.tsx` (the process list, its promotion-preview
dialog and its start-picker dialog), `screens/TemplatesScreen.tsx`, and
`screens/VersionsScreen.tsx` SHALL render from compiled component
styles. The rendered result SHALL match the previous stylesheet
declaration for declaration. The process list's own toolbar and rows are the
one exception. They follow "The process list shows draft and published state
per process".

#### Scenario: The process list and its dialogs keep their look

- **WHEN** a browser renders the process list, then opens its
  promotion-preview dialog and its start-picker dialog
- **THEN** each one's computed layout, spacing, color and border equal
  the values the deleted stylesheet declared, including the dialogs'
  `::backdrop`
- **AND** the toolbar and the rows follow the process list's own
  requirement instead

#### Scenario: The templates and versions screens keep their look

- **WHEN** a browser renders the templates screen and the versions
  screen
- **THEN** each one's computed layout, spacing, color and border equal
  the values the deleted stylesheet declared
