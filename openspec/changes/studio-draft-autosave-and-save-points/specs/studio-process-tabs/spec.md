## ADDED Requirements

### Requirement: The header bar has no Save

No Save control SHALL stand in the header bar, on any tab, over the JSON surface or
in the `⋮` menu. A failed save's Try again SHALL stand in its banner under the bar.

#### Scenario: A dirty draft's bar has no Save

- **WHEN** an author changes the draft
- **THEN** no Save control stands in the header bar
- **AND** Publish keeps the position it held

### Requirement: Try again keeps the keyboard's place

A running retry SHALL leave the focus on Try again. The control SHALL read "Saving…"
and carry `aria-disabled="true"` while it runs. When a retry's answer removes the
control while it holds the focus, focus SHALL move to the state line. Focus an author
moved elsewhere in the meantime SHALL stay there.

#### Scenario: A successful keyboard retry lands on the state

- **WHEN** a keyboard user presses Try again and the save succeeds
- **THEN** focus stands on the state line

#### Scenario: A refused retry keeps the focus

- **WHEN** a keyboard user presses Try again and the save fails
- **THEN** focus stands on Try again

#### Scenario: A retry answered 409 moves the focus from Try again

- **WHEN** a keyboard user presses Try again and the save answers 409
- **THEN** focus stands on the state line

#### Scenario: An automatic retry that heals moves the focus from Try again

- **WHEN** focus stands on Try again and a timed retry succeeds
- **THEN** focus stands on the state line

## MODIFIED Requirements

### Requirement: The area nav stands empty of draft controls

The studio's area nav SHALL stand empty of draft controls while a draft
stands open. Test and Publish stand in the header bar, as this
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
The Settings tab's sub-row SHALL read Process, What it takes in and gives
back, Access, and Save points. The data sources stand on the Fields tab. The Process view SHALL hold five settings. They are the base
language, the content-locale switcher, the add-a-language control, the
cancellable setting and the two collaboration defaults. The content-locale
switcher and the add-a-language control set the language the studio edits in
this session and write no draft body. Every other control writes the draft
body. The process key SHALL stand in a closed Developer view there. The
Access view SHALL also carry the link to manage assignment groups. The Save
points view stands at the view address `points`, and `studio-app` states what it
holds.

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

#### Scenario: The sub-row opens Save points

- **WHEN** an author opens `/studio/processes/p1/edit/settings/points`
- **THEN** the Settings tab is open on its Save points view

### Requirement: The header bar's menu holds what is not a tab

<!-- antislop: allow paragraph-length -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
The header bar's `⋮` menu SHALL carry two groups, "Views" and "Draft". The Views
group SHALL hold the JSON surface, Versions and Player. The Draft group SHALL
hold Save points and Discard draft. Save points SHALL open the Settings tab's Save
points view. The focus SHALL land on its name input, or at the bound on its sentence. No process setting SHALL stand in the menu. The Settings tab holds those. The tab row SHALL have no
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
- **THEN** it holds the JSON entry, Versions, Player, Save points and Discard draft
- **AND** no key, language, cancellable or collaboration control stands in it

#### Scenario: Discard draft answers over the field matrix

- **WHEN** an author opens the menu on the Where fields appear view at 1280 wide
- **THEN** every point of the open panel belongs to the panel
- **AND** a press on Discard draft opens the discard dialog

#### Scenario: The menu opens Save points

- **WHEN** an author chooses Save points in the `⋮` menu
- **THEN** the Save points view is open and its name input holds the focus

#### Scenario: The menu at the bound lands on the sentence

- **WHEN** an author chooses Save points on a draft at the bound
- **THEN** the bound's sentence holds the focus once the list answers

#### Scenario: The menu leaves the JSON surface for Save points

- **WHEN** an author chooses Save points while the JSON surface stands open
- **THEN** the JSON surface leaves and the Save points view is open

#### Scenario: The menu leaves the form editor for Save points

- **WHEN** an author chooses Save points in the form editor
- **THEN** the form editor leaves and the Save points view is open

### Requirement: Test, Publish and the menu stand in the header bar

The header bar SHALL carry three controls, right-aligned in its row: Test,
Publish and the `⋮` menu trigger. All three SHALL stay visible and usable on
every tab and while the JSON surface is active. Test SHALL open the Player,
through the same exit rule as the menu's Player entry. A waiting change saves
first, with no question.

#### Scenario: The three controls stand in the header bar

- **WHEN** an author reads the header bar
- **THEN** Test, Publish and the `⋮` trigger stand in the row, right-aligned

#### Scenario: The three controls stay reachable while the JSON surface is active

- **WHEN** an author opens the JSON surface from the overflow menu
- **THEN** Test, Publish and the `⋮` trigger still stand in the header bar's row

#### Scenario: Test opens the Player

- **WHEN** an author presses Test on a saved draft
- **THEN** the Player opens on this process

## REMOVED Requirements

### Requirement: Save stands beside the state while the draft is dirty

**Reason**: The draft saves itself, so the bar has no Save.

**Migration**: "The header bar has no Save" states the rule, and a failed save's Try again stands in its banner.

### Requirement: A keyboard save keeps its place

**Reason**: The control it names leaves the bar.

**Migration**: "Try again keeps the keyboard's place" carries the same focus rule for the one control that replaces it.
