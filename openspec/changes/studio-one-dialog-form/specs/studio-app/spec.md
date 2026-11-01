<!-- antislop: allow-file sentence-length passive-voice trailing-negation negation-habit synonym-rotation run-ons -->
<!-- Why: MODIFIED blocks copy their base wording from the live spec, whose debt a new file counts as a rise. -->
# Spec Delta

## ADDED Requirements

### Requirement: One dialog form serves every studio confirmation

Every question the studio asks before an act SHALL stand in its one dialog form. No module of the studio area SHALL call the browser's `confirm()` prompt. Only the browser's own leave prompt on a tab close or a reload stays native. Every `dialog` element in the studio area SHALL render through that one form.

The control `Remove this way out` stays dialog-free.

#### Scenario: No native prompt remains in the studio

- **WHEN** a test scans every source file of the studio area, comments aside
- **THEN** no file calls `confirm(`
- **AND** only the one dialog component writes a `dialog` element or calls `showModal`

#### Scenario: A former prompt takes the dialog form

- **WHEN** an author presses Arrange on a draft with a hand-placed step
- **THEN** a modal dialog of the studio's own opens
- **AND** no browser prompt appears

#### Scenario: Removing a way out asks nothing

- **WHEN** an author presses Remove this way out
- **THEN** the way out leaves the draft
- **AND** no dialog opens

### Requirement: A dialog reads as one form

A dialog SHALL read top to bottom: a heading, its facts, its notes, then its controls. The heading SHALL print an author's label in the capitals the author typed. A confirmation's heading SHALL be a question.

A fact SHALL pair a term and a value on one baseline. A count SHALL print in mono. A value SHALL print no key, id or hash outside a closed Developer view. A data source's name and a template with no label print their key, since each has no other name.

#### Scenario: A heading keeps the author's capitals

- **WHEN** the removal dialog opens for the step "Prüfung by Finance"
- **THEN** the heading reads "Remove “Prüfung by Finance”?" in those capitals

#### Scenario: A count prints in mono

- **WHEN** the removal dialog for a step counts two ways out leading here
- **THEN** the figure 2 prints in the mono face
- **AND** its term and the figure share a baseline

#### Scenario: A choice is the one heading that is no question

- **WHEN** the start picker opens
- **THEN** its heading reads "Start a new process"

### Requirement: A dialog's controls keep one order and one look

A dialog SHALL close with its confirming control, where it has one, and then Cancel. Cancel SHALL take the secondary button, in ink. A destructive confirm SHALL stay outlined in the accent. Publish and an import's Publish here SHALL stay the one filled primary action. Cancel SHALL hold the opening focus unless the dialog commits nothing, as the start picker does.

#### Scenario: Cancel takes no accent

- **WHEN** the removal dialog opens
- **THEN** Cancel prints in ink inside a divider border
- **AND** the confirming control stands before it, outlined in the accent

#### Scenario: Enter on an opening dialog declines

- **WHEN** any dialog that commits an act opens and the author presses Enter
- **THEN** the dialog closes and the act does not run

#### Scenario: The start picker opens on its first choice

- **WHEN** the start picker opens
- **THEN** "Empty process" holds the focus

### Requirement: A long dialog keeps its controls in view

A dialog SHALL stay inside the viewport with a gutter at every width. A body longer than the dialog SHALL scroll inside it, and the controls SHALL stay in view from the moment it opens. The heading SHALL stand in view when the dialog opens. A refusal SHALL scroll into view when it appears.

#### Scenario: A narrow viewport keeps a gutter

- **WHEN** a dialog opens at 420px wide
- **THEN** at least 16px of the page shows on each side of it

#### Scenario: A long list leaves the heading and Cancel on screen

- **WHEN** the removal dialog for a group lists 28 names at 1024 by 600 pixels
- **THEN** the heading and Cancel both stand in view on open
- **AND** the arrow keys scroll the list with Cancel focused

### Requirement: Each confirmation names its act

A confirmation's heading SHALL name the act, and its confirming control SHALL name the same act. Neither SHALL read "OK" or "Continue". A confirmation SHALL use no contract word its author would not meet elsewhere.

#### Scenario: Leaving a draft

- **WHEN** an author with unsaved changes presses the back control
- **THEN** a dialog reads "Leave this draft?" with the control "Leave without saving"
- **AND** declining returns the focus to the back control and keeps the changes

#### Scenario: Arrange

- **WHEN** an author presses Arrange on a hand-placed draft
- **THEN** a dialog reads "Arrange every step?" with the control "Arrange"

#### Scenario: Restoring over newer changes

- **WHEN** an author with unsaved changes chooses "Restore unsaved changes"
- **THEN** a dialog reads "Replace your current changes?" with the control "Replace them"

#### Scenario: A kind change that drops a setting

- **WHEN** an author changes a field with a date format to the kind Number
- **THEN** a dialog reads "Change the kind of “Due date”?" with the control "Change kind"
- **AND** it says the new kind cannot keep this field's format
- **AND** declining leaves the field and the select on the old kind

#### Scenario: Checking Technical

- **WHEN** an author checks Technical on a field whose entries carry three required or read-only settings
- **THEN** a dialog reads "Mark “Reference” as technical?" with the control "Mark as technical"
- **AND** it counts 3 settings it clears
- **AND** declining leaves the checkbox clear and the draft unchanged

#### Scenario: Deleting a template

- **WHEN** a curator presses Delete on the template "Approval"
- **THEN** a dialog reads "Delete “Approval”?" with the control "Delete template"
- **AND** no request goes out until the curator confirms

#### Scenario: Replacing a template

- **WHEN** a curator creates a template over the existing key of "Approval"
- **THEN** a dialog reads "Replace “Approval”?" with the control "Replace template"

### Requirement: Discarding from the process list takes the discard dialog

A row's Discard draft SHALL open the same dialog as the header bar's entry. A refused discard SHALL render its reason inside the open dialog. A declined dialog SHALL return the focus to the row's control. After a confirmed discard, the focus SHALL stand on the row's name link, or on Import when the row has left.

#### Scenario: A refused discard stays in the dialog

- **WHEN** an author confirms a row's discard and the engine refuses it
- **THEN** the dialog stays open and prints the reason inside itself

#### Scenario: The focus survives a discard

- **WHEN** an author confirms the discard of a process with a published version
- **THEN** the row's name link holds the focus
- **AND** the focus does not stand on the document body

### Requirement: The removal dialog names each kind of reach

The heading SHALL name the removed field by its label, and say so for a group. The facts SHALL name, in the author's words, each place the removal reaches, one row per kind. The kinds are the fields inside it, the steps asking for it, what writes it, the process's inputs and outputs, the fields filling it in, what reads it and the settings naming it. A kind it does not carry SHALL print no row. No key, id or CEL source SHALL print.

#### Scenario: A group names the fields inside it and its steps

- **WHEN** the author presses Remove field on the group "Processing (Fabrikam)" in the IT Offboarding draft
- **THEN** the dialog's heading says the removal takes a group
- **AND** its facts name the 18 fields inside and the 10 steps

#### Scenario: Only the kinds a removal carries appear

- **WHEN** the author presses Remove field on "Booking Status" in the Expense Approval draft
- **THEN** the facts name 2 steps, what writes it, one input or output list and the 2 places reading it
- **AND** the facts lack a "Filled in from" row and a settings row

#### Scenario: A place that reads the field names its place

- **WHEN** a way out named "Approve" on the step "Review" leads to "Book" and reads the field
- **THEN** the "Read by" row prints "On Review: way out Approve → Book"
- **AND** the dialog prints no CEL

#### Scenario: A kept reference is said to stay

- **WHEN** something the removal keeps reads the field or names it in a setting
- **THEN** a note says it stays as written and asks the author to check it before publishing

### Requirement: The dialog form renders from compiled styles

The one dialog component SHALL render from compiled component styles. `::backdrop` SHALL stay its one literal rule, matched by the `studio-dialog` class. No dialog SHALL keep its own copy of those styles.

#### Scenario: A dialog's backdrop stays literal

- **WHEN** a browser opens any studio dialog
- **THEN** a backdrop of black at 45% stands behind it
- **AND** the dialog carries the `studio-dialog` class

## MODIFIED Requirements

### Requirement: Leaving the edit screen with unsaved changes prompts first

<!-- antislop: allow sentence-length -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
Every control that navigates away from an open draft SHALL check the dirty
state before navigating. The requirement "A layout change counts as an unsaved
change" defines that state. The check covers the header bar's back control, Test and
Versions offer, the `⋮` menu's Versions and Player entries, and the Access view's
groups link. It
also covers the "Processes", "Tools" and "Templates" tabs, and the account
menu's area switch, profile entry and logout.

<!-- antislop: allow negation-habit -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
When the draft carries no unsaved change, a control SHALL navigate exactly
as it does today, with no prompt.

When the draft carries an unsaved change, a control SHALL ask for
confirmation before navigating. The question stands in the studio's dialog
form.

Confirming SHALL proceed with the navigation; the navigation drops the
unsaved edits, exactly as an explicit Discard already drops them. Canceling
SHALL leave the developer on the edit screen with the draft untouched.

While the draft has an unsaved change, closing the tab or reloading SHALL raise
the browser's own leave prompt. A `401` answer is not a navigation control. It
SHALL end the session with no dialog and no leave prompt.

This requirement covers the in-app controls named above, tab close and reload.
A Back or Forward step between entries of this page is out of scope.

#### Scenario: A clean draft navigates without a prompt

- **WHEN** the developer has an unchanged draft and chooses "Back to
  processes", "Versions", "Player", or a top-level studio tab
- **THEN** the screen navigates immediately, with no confirmation prompt

#### Scenario: An unsaved change on the edit screen's own nav prompts first

- **WHEN** the developer has an unsaved change on the open draft and
  chooses the back control, Test, Versions or Player
- **THEN** the screen asks for confirmation before navigating

#### Scenario: An unsaved change on the studio area's top-level nav prompts first

- **WHEN** the developer has an unsaved change and chooses the
  "Processes", "Tools" or "Templates" tab in the studio area's navigation
- **THEN** the screen asks for confirmation before navigating

#### Scenario: The groups link prompts first

- **WHEN** the developer has an unsaved change and chooses "Manage assignment
  groups for this process" on the Access view
- **THEN** the screen asks for confirmation before navigating to the admin
  area

#### Scenario: The account menu's exits prompt first

- **WHEN** the developer has an unsaved change and chooses another area, the
  profile entry or logout in the account menu
- **THEN** the screen asks for confirmation before the shell runs the exit

#### Scenario: Canceling the prompt keeps the draft and the screen

- **WHEN** the developer has an unsaved change and cancels the
  confirmation prompt raised by a navigation control
- **THEN** the edit screen stays open and every unsaved change remains in
  the draft

#### Scenario: Confirming the prompt navigates and drops the unsaved change

- **WHEN** the developer has an unsaved change and confirms the prompt
  raised by a navigation control
- **THEN** the screen navigates away and the unsaved change is not
  recovered

#### Scenario: Closing the tab with an unsaved change prompts

- **WHEN** the developer has an unsaved change and closes the tab or reloads
- **THEN** the browser raises its leave prompt

#### Scenario: Closing the tab with a clean draft does not prompt

- **WHEN** the developer has no unsaved change and closes the tab or reloads
- **THEN** the browser raises no leave prompt

### Requirement: Discarding a draft confirms in a modal dialog

<!-- antislop: allow sentence-length trailing-negation -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
The Discard draft entry in the header bar's `⋮` menu SHALL confirm in a modal
dialog of the application's own, not in the browser's `confirm()` prompt. The dialog SHALL
take the treatment `studio-publish` fixes for the publish dialog. That means
the native `dialog` element opened with `showModal()`, an accessible name
through `aria-labelledby`, and a platform cancel read as a decline. It also
means the initial focus that requirement fixes. Picking the entry closes the menu,
so every close route SHALL return the focus to the `⋮` trigger.

<!-- antislop: allow negation-habit -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
Here the confirming control destroys the draft, and the studio carries no undo.
So the declining control SHALL hold the initial focus, and the destructive one
SHALL NOT. Document order alone puts the destructive control first.

The dialog SHALL state the process it will drop the draft of. It SHALL print
no revision. It SHALL state that the published versions stay. It SHALL state
that only the unpublished draft goes. That last sentence is the one fact a
developer needs.

<!-- antislop: allow synonym-rotation -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
Declining SHALL leave the draft untouched and SHALL send no request. A
discard the engine refuses SHALL render its reason inside the open dialog.
The publish dialog reports a refusal the same way.

#### Scenario: Discarding confirms with the facts first

- **WHEN** the developer chooses Discard on an open draft
- **THEN** a modal dialog opens naming the process, with no revision
- **AND** it states that the published versions stay
<!-- antislop: allow passive-voice -->
<!-- Fixed Gherkin THEN/AND grammar; the clause is structurally passive. -->
- **AND** no discard request is sent until the developer confirms

#### Scenario: Declining keeps the draft

- **WHEN** the developer cancels that dialog, or dismisses it with Escape
<!-- antislop: allow passive-voice -->
<!-- Fixed Gherkin THEN/AND grammar; the clause is structurally passive. -->
- **THEN** no request is sent and the draft stays open, unchanged

#### Scenario: Confirming discards the draft

- **WHEN** the developer confirms that dialog
- **THEN** the engine drops the draft and the screen leaves for the list,
  exactly as it does today

#### Scenario: A refused discard reports inside the dialog

- **WHEN** the discard request fails
- **THEN** the dialog stays open and renders the reason inside itself

#### Scenario: The destructive control never holds the opening focus

- **WHEN** the discard dialog opens
- **THEN** the declining control holds the focus
- **AND** the Discard draft control does not hold it

#### Scenario: Closing the dialog returns focus to the menu trigger

- **WHEN** the developer closes the discard dialog by any route that keeps the draft
- **THEN** focus stands on the `⋮` trigger
- **AND** focus does not drop to the document body

### Requirement: The process list, its dialogs, and the templates and versions screens render from compiled styles

`screens/ProcessesScreen.tsx` (the process list, its promotion-preview
dialog and its start-picker dialog), `screens/TemplatesScreen.tsx`, and
`screens/VersionsScreen.tsx` SHALL render from compiled component
styles. The rendered result SHALL match the previous stylesheet
declaration for declaration. Two exceptions stand. The process list's own
toolbar and rows follow "The process list shows draft and published state per
process". Both dialogs follow "A dialog reads as one form".

#### Scenario: The process list and its dialogs keep their look

- **WHEN** a browser renders the process list, then opens its
  promotion-preview dialog and its start-picker dialog
- **THEN** each dialog's layout, spacing, color and border follow "A dialog
  reads as one form", including its `::backdrop`
- **AND** the toolbar and the rows follow the process list's own
  requirement instead

#### Scenario: The templates and versions screens keep their look

- **WHEN** a browser renders the templates screen and the versions
  screen
- **THEN** each one's computed layout, spacing, color and border equal
  the values the deleted stylesheet declared

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
- **THEN** a dialog reads "Discard this draft?" and its Process fact reads
  "Laptop Pool"

### Requirement: A layout change counts as an unsaved change

An open draft SHALL read as unsaved when its body or layout differs from the
last save. Any write to the layout counts, such as a step move, a group change
or a new waypoint. The header bar, every leave prompt and the Publish dialog
SHALL read this one state. A layout with the same values in another key order
SHALL NOT count as different.

#### Scenario: Moving a step marks the draft unsaved

- **WHEN** the developer drags a step and changes nothing else
- **THEN** the header bar prints the dirty indicator
- **AND** "Back to processes" asks for confirmation before it navigates

#### Scenario: A save clears the unsaved state of a layout

- **WHEN** the developer moves a step and saves successfully
- **THEN** the header bar prints the saved state
- **AND** "Back to processes" navigates with no prompt

#### Scenario: A layout-only difference makes Publish save first

- **WHEN** the developer moves a step, changes nothing else and chooses
  Publish
- **THEN** the dialog says that publishing saves the unsaved work first
- **AND** confirming saves the draft and then publishes it

#### Scenario: The same layout in another key order reads as saved

- **WHEN** a save answers with the layout's values in another key order
- **THEN** the header bar prints the saved state

#### Scenario: Discarding the draft raises no leave prompt

- **WHEN** the developer moves a step, chooses Discard draft and confirms the
  dialog
- **THEN** the screen navigates to the process list and no leave dialog opens

### Requirement: The data source removal dialog counts what it clears

The heading SHALL name the data source by its name. Its facts SHALL state the count of fields that name the source, at every depth. They SHALL state the count of column mapping entries those fields carry. They SHALL print no row for a count of zero. The dialog SHALL name no field.

#### Scenario: The facts count fields and mappings

- **WHEN** three fields name `countries` and one of them carries a column mapping
- **AND** the author presses Remove data source
- **THEN** the facts state 3 fields and 1 column mapping

#### Scenario: A zero count prints no row

- **WHEN** two fields name `countries` and none carries a column mapping
- **AND** the author presses Remove data source
- **THEN** the facts state 2 fields
- **AND** the facts have no column mapping row

## REMOVED Requirements

### Requirement: The removal dialog counts each kind of reach

**Reason**: FIELDCARD-25. An author removed a field without seeing what reads it.

**Migration**: "The removal dialog names each kind of reach" takes its place.

### Requirement: Discarding a draft's confirmation dialog renders from compiled styles

**Reason**: Its scenario fixed the look of a deleted stylesheet, and the one form replaces that look.

**Migration**: "The dialog form renders from compiled styles" and "A dialog reads as one form" take its place.
