# Delta: studio-process-tabs

<!-- antislop: allow-file synonym-rotation -->
<!-- Why: edit, change, surface and show each name a distinct UI act in the base wording. -->

## ADDED Requirements

### Requirement: Test, Publish and the menu stand in the header bar

The header bar SHALL carry three controls, right-aligned in its row: Test,
Publish and the `⋮` menu trigger. All three SHALL stay visible and usable on
every tab and while the JSON surface is active. Test SHALL open the Player,
through the same leave guard as the menu's Player entry.

#### Scenario: The three controls stand in the header bar

- **WHEN** an author reads the header bar
- **THEN** Test, Publish and the `⋮` trigger stand in the row, right-aligned

#### Scenario: The three controls stay reachable while the JSON surface is active

- **WHEN** an author opens the JSON surface from the overflow menu
- **THEN** Test, Publish and the `⋮` trigger still stand in the header bar's row

#### Scenario: Test opens the Player

- **WHEN** an author presses Test on a saved draft
- **THEN** the Player opens on this process

### Requirement: Save stands beside the state while the draft is dirty

A Save control SHALL stand beside the header bar's state while the draft carries
unsaved work. That holds on every tab and over the JSON surface. A clean draft
SHALL show no Save. It SHALL read "Saving…" and carry `aria-disabled="true"`
while a save runs, ignoring a press. Its coming and going SHALL move no control
in the trailing cluster.

#### Scenario: A clean draft offers no Save

- **WHEN** an author opens a saved draft
- **THEN** no Save control stands in the header bar

#### Scenario: An edit brings Save

- **WHEN** an author alters the draft
- **THEN** Save stands beside the state
- **AND** Publish keeps the position it held

#### Scenario: A refused save keeps the control

- **WHEN** the save request fails
- **THEN** Save still stands and the draft reads "Unsaved changes"

### Requirement: A keyboard save keeps its place

A running save SHALL leave the focus on Save. When a save's answer removes the
control while it holds the focus, focus SHALL move to the state line. It SHALL
stay out of the document body. Focus an author moved elsewhere in the meantime
SHALL stay there.

#### Scenario: A successful keyboard save lands on the state

- **WHEN** a keyboard user presses Save and the save succeeds
- **THEN** focus stands on the state line
- **AND** the next Tab reaches the control after it

#### Scenario: A refused save keeps the focus on Save

- **WHEN** a keyboard user presses Save and the save request fails
- **THEN** focus stands on Save

### Requirement: The Developer view on Settings holds the draft's machine values

The Process view's Developer view SHALL hold the key, the process id and the
draft's revision. After a publish in this session it SHALL also hold the
published version and its whole definition hash. None of them SHALL print until
the Developer view opens.

#### Scenario: The revision stands in the Developer view

- **WHEN** an author opens the Developer view on the Process view
- **THEN** it prints the draft's current revision

#### Scenario: A publish adds its hash

- **WHEN** a publish succeeds and the author opens that Developer view
- **THEN** it prints the new version and its whole definition hash

#### Scenario: No hash before a publish

- **WHEN** no publish ran in this session
- **THEN** that Developer view prints no hash

### Requirement: The Access view's link opens Groups filtered to this process

The Access view's "Manage assignment groups for this process" link SHALL open
the admin area's Groups screen. Its address SHALL carry the open process's id.
That id pre-filters the screen to global groups plus groups already
scoped to this process. The link SHALL appear for any signed-in actor. It SHALL
keep no group data and SHALL trigger no request to a `/admin/groups*` route.

#### Scenario: The link opens Groups filtered to the open process

- **WHEN** an author picks the link on the Access view
- **THEN** the Groups screen opens, holding global groups plus groups already
  scoped to the open process

### Requirement: The Access view's link meets the admin area's entry rules

An actor holding another role `mayEnter` accepts, without `system:admin`, SHALL
reach the admin area's own `MissingRole` empty state. An actor holding no
admin-area-entry role SHALL get the shell's `area.forbidden` message.

#### Scenario: Following the link with admin-area entry but not the admin role

- **WHEN** an actor who holds `system:datalists` but lacks `system:admin`
  follows the link
- **THEN** the admin area gives its own `MissingRole` empty state

#### Scenario: Following the link with no admin-area-entry role at all

- **WHEN** an actor who holds neither role follows the link
- **THEN** the shell blocks entry and gives its `area.forbidden` message

## MODIFIED Requirements

### Requirement: The header bar's menu holds what is not a tab

<!-- antislop: allow paragraph-length -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
The header bar's `⋮` menu SHALL carry two groups, "Views" and "Draft". The Views
group SHALL hold the JSON surface, Versions and Player. The Draft group SHALL
hold Discard draft. No process setting SHALL stand in the menu. The Settings tab holds those. The tab row SHALL have no
trailing control of its own. Its trailing edge is the last tab.

The open panel SHALL stand above every tab body, so a press on an entry reaches
that entry.

The JSON entry SHALL name its own state. An author reads from it whether
the entry opens the JSON surface or leaves it.

#### Scenario: The JSON surface opens from the header bar's menu

- **WHEN** an author opens the header bar's `⋮` menu and picks the JSON
  entry
- **THEN** the JSON surface replaces the tab body
- **AND** the entry now names leaving that surface

#### Scenario: The tab row has no trailing control

- **WHEN** an author reads the tab row
- **THEN** its trailing edge is the last tab, with no overflow control
  after it

#### Scenario: The menu has no process setting

- **WHEN** an author opens the header bar's `⋮` menu
- **THEN** it holds the JSON entry, Versions, Player and Discard draft
- **AND** no key, language, cancellable or collaboration control stands in it

#### Scenario: Discard draft answers over the field matrix

- **WHEN** an author opens the menu on the Where fields appear view at 1280 wide
- **THEN** every point of the open panel belongs to the panel
- **AND** a press on Discard draft opens the discard dialog

### Requirement: The area nav stands empty of draft controls

The studio's area nav SHALL stand empty of draft controls while a draft
stands open. Save, Test and Publish stand in the header bar, as this
capability's own requirements below state. The Checks tab's own count
reports the checks state, as the count requirement above states. No control
outside the tab row SHALL duplicate that state.

#### Scenario: The area nav stands empty of draft controls

- **WHEN** an author opens a draft
- **THEN** the studio's area nav is empty of draft controls
- **AND** Test and Publish stand in the header bar instead

### Requirement: The Settings tab gathers the process-wide settings

<!-- antislop: allow paragraph-length sentence-length -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
The Settings tab's sub-row SHALL read Process, Where values come from, What
it takes in and gives back, and Access. The Process view SHALL hold five settings. They are the base
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

- **WHEN** an author opens Where values come from
- **THEN** the entity rail lists every data source and an Add entry
- **AND** the open data source's editor stands beside it

#### Scenario: The contract and the access lists keep their editors

- **WHEN** an author opens What it takes in and gives back, then Access
- **THEN** the first view holds the contract editor
- **AND** the second holds the Developer, Owner and Reader lists, and the
  assignment-groups link under them

#### Scenario: The JSON surface hides the Settings tab

- **WHEN** the JSON surface is the active surface
- **THEN** no Settings control is reachable until the author leaves it

### Requirement: A structurally invalid draft's banner carries the refusal color

Where the loaded draft fails structural validation, its warning banner
SHALL take `colors.refusal`. That is the color the Checks tab's blocked
count already carries. Plain, uncolored text left that state reading no
differently from routine copy.

Two gaps SHALL NOT raise the banner on their own. One is the missing first
step of a draft with no step, the start state `studio-checks-rail` defines.
The other is the missing base-locale name of a draft that holds a step.
That gap reads as a sentence at the name. The banner SHALL stand only when the
draft carries some other Zod issue.

<!-- antislop: allow sentence-length -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
The banner SHALL stand below the header bar. It SHALL read one sentence that
says what to do and prints no engine word: no "Zod", no "CEL", no "registry".

This banner SHALL NOT take the bordered, rotated stamp treatment. This
screen already reserves that treatment for a load or a request that comes
back wrong. That treatment marks a fixed, five-tone case vocabulary a
design decision alone extends. A structurally invalid draft joins the
plain-text signal family instead.

<!-- antislop: allow synonym-rotation -->
<!-- Copied from the live spec; "failure" names a failed request, the case this paragraph sets apart from a Zod issue. -->
`spa-error-reporting` binds this screen's failure states to one banner
shape. That capability's own Purpose scopes it to a request that fails.
This banner reports a validation state of the draft body rather than a
failed request. So that one-shape rule does not reach it.

#### Scenario: A structurally invalid draft's banner carries the refusal color

- **WHEN** the loaded draft fails structural validation on a Zod issue
  other than the two start gaps
- **THEN** its banner takes `colors.refusal`
- **AND** it does not take the bordered stamp treatment
- **AND** it stands below the header bar
- **AND** it names no check kind

#### Scenario: A structurally valid draft shows no such banner

- **WHEN** the loaded draft passes structural validation
- **THEN** no such banner stands

#### Scenario: A fresh empty draft shows no banner

- **WHEN** an author opens a draft the empty choice just seeded
- **THEN** no banner stands

#### Scenario: An unnamed draft with a step shows no banner

- **WHEN** the loaded draft holds one named end step, and its only Zod
  issue is the missing base-locale name
- **THEN** no banner stands
- **AND** the name sentence stands beside the name in the header bar

#### Scenario: Another Zod issue keeps the banner on a draft with no step

- **WHEN** a draft with no step also carries a Zod issue of another kind
- **THEN** the banner stands

#### Scenario: A new task step with no name or way out keeps the banner

- **WHEN** an author adds a first task step that has no name and no way out
- **THEN** the banner stands, since those two gaps lie outside the start
  gaps

## REMOVED Requirements

### Requirement: Save, Discard draft and Publish stand in the header bar

**Reason**: Discard draft moved into the `⋮` menu, and Save stands beside the
state only while the draft is dirty.

<!-- antislop: allow sentence-length -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
**Migration**: "Test, Publish and the menu stand in the header bar" and "Save
stands beside the state while the draft is dirty" in this capability replace it.
