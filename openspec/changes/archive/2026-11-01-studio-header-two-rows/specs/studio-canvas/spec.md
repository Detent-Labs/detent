# Delta: studio-canvas

<!-- antislop: allow-file synonym-rotation -->
<!-- Why: edit, change, surface and show each name a distinct UI act in the base wording. -->

## ADDED Requirements

### Requirement: The header bar holds back, name, state, Test, Publish and the menu

The process surface SHALL carry a header bar above the tab row, directly under
the shared header. No row SHALL stand between the two while no banner stands.

The bar SHALL hold, in order, a back control, the process name and the draft's
state. The Test control, the Publish control and the `⋮` menu trail them. The
back control reads "← Processes". Its accessible name SHALL read "Back to
processes".

#### Scenario: A clean draft's bar holds six things

- **WHEN** an author opens a saved draft of a published process
- **THEN** the bar reads the back control, the name, the state, Test, Publish
  and the `⋮` menu
- **AND** no key, revision, hash or locale code prints in the bar

#### Scenario: The back control keeps the leave guard

- **WHEN** an author presses the back control on a dirty draft
- **THEN** the leave prompt asks first, as it did from the screen nav

### Requirement: The header bar's process name fits its text

The process name SHALL size to its own text, up to a cap. Its issue sentence stays
beside it. Its missing translation warning SHALL stand below the bar, so the bar
keeps one row. While the name has no entry in the edited language, its placeholder
SHALL read the base-language name. The name input SHALL carry an accessible name.

#### Scenario: A long name keeps the commands on the row

- **WHEN** an author types a 60-character name at 1440 wide
- **THEN** Test, Publish and the `⋮` trigger keep their line

### Requirement: The header bar keeps no command logic

`useDraftToolbarActions` SHALL compute when each command is available and what it
does. The bar SHALL keep no copy of that logic.

#### Scenario: The bar calls the one hook

- **WHEN** an author presses Save or Publish
- **THEN** the call runs the logic `useDraftToolbarActions` holds

### Requirement: The header bar prints no machine value

The bar SHALL print no key, no process id, no revision and no hash. It SHALL
print a locale only in the "Editing" note `studio-app` states.

#### Scenario: The note is the one locale site

- **WHEN** an author edits a draft in another language
- **THEN** the "Editing" note is the one place the bar names a language
- **AND** the name's missing translation warning stands below the bar
- **AND** the name's placeholder reads the base-language name

### Requirement: The header bar's state says what holds for the draft

The state SHALL read "Unsaved changes" while the draft differs from its last
save. It SHALL read "Saved at" and a time after a save in this session. It SHALL
read "Saved" otherwise. Where a published version exists, the state SHALL add
that version and the word "published". The version SHALL print in the mono face.

The state SHALL announce a change politely to a screen reader. That announcement
moves no focus. Only the Save rule in `studio-process-tabs` sends focus to it.

#### Scenario: A dirty draft's bar names its state

- **WHEN** the draft carries unsaved changes
- **THEN** the bar prints "Unsaved changes" in the refusal tone

#### Scenario: A save names its time

- **WHEN** a save succeeds
- **THEN** the state reads "Saved at" and the time of that save

#### Scenario: A published process names its version

- **WHEN** an author opens a saved draft whose base version is 1
- **THEN** the state reads "Saved" and "v1 published"

#### Scenario: A process with no published version prints no version

- **WHEN** an author opens a draft with no base version
- **THEN** the state prints no version

## MODIFIED Requirements

### Requirement: The header bar's process key auto-derives from the process label

<!-- "produce" names key derivation's output; "create" elsewhere names a gesture adding a step or path. -->
<!-- antislop: allow synonym-rotation -->
The Settings tab's Developer view holds the process key field.
That field SHALL auto-fill from the process label as the
developer types. This holds while the draft's key is empty. It also holds
while the key still matches what derivation would produce from the label's
prior value.

Derivation SHALL read only the process label's base-locale entry. An edit
to any other locale's translation SHALL NOT trigger key derivation.

Derivation SHALL lower-case the label. It SHALL then transliterate. The
letters "ä", "ö" and "ü" read "ae", "oe" and "ue", and "ß" reads "ss". The
letters "æ" and "œ" read "ae" and "oe", "ø" reads "o" and "ł" reads "l".
Every other letter SHALL lose its combining marks, so "é" reads "e".

A base
letter typed with a combining mark SHALL read as the letter they compose. So
"u" plus a diaeresis reads "ue".

After that, derivation SHALL collapse every run of
characters outside `[a-z0-9]` to a single `_`. It SHALL trim a leading or
trailing `_`. A result starting with a digit SHALL gain a leading `_`.

The first edit the developer types directly into the key field SHALL
disable this auto-fill. That holds for the rest of the draft's lifetime in
the browser. No later label edit SHALL overwrite a key the developer has
hand-set. The key field SHALL remain an ordinary editable text input
throughout. Nothing about it SHALL become read-only or disabled otherwise.

#### Scenario: A new process's key follows its label as the developer types

- **WHEN** the developer types "Expense Approval" into a new draft's
  process label, having never touched the key field
- **THEN** the process key reads `expense_approval`

#### Scenario: A hand-edited process key no longer follows the label

- **WHEN** the developer changes the auto-derived process key to `expenses`
  and then edits the process label further
- **THEN** the process key stays `expenses`

#### Scenario: Editing a non-base-locale translation leaves an already-derived process key untouched

- **WHEN** the developer types a base-locale process label, deriving a
  key, then switches the studio's content locale
- **AND** the developer types a translation into the process label's
  non-base-locale entry
- **THEN** the process key stays unchanged

#### Scenario: A process label with umlauts derives a readable key

- **WHEN** the developer types "Prüfung der Änderung" into a new draft's
  process label, having never touched the key field
- **THEN** the process key reads `pruefung_der_aenderung`

#### Scenario: A letter with an accent loses only its mark

- **WHEN** the developer types "Café Straße" into a new draft's process
  label, having never touched the key field
- **THEN** the process key reads `cafe_strasse`

### Requirement: The process-identity header bar renders from compiled styles

<!-- antislop: allow sentence-length -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
`panels/ProcessHeaderBar.tsx` renders the process-identity header bar,
per this capability's own "The header bar holds back, name, state, Test,
Publish and the menu" requirement. The header bar SHALL render from
compiled component styles. Its two dialogs are each a different
capability's own concern. Only the header bar itself is this
requirement's scope.

#### Scenario: The header bar keeps its look

- **WHEN** a browser renders the process-identity header bar
- **THEN** its layout, spacing, color and border come from compiled styles

### Requirement: The edit screen's own layout renders from compiled styles

`screens/` collapses its edit screen and its panels screen into one process
surface component. That component's own layout SHALL compile from typed
StyleX style objects. The layout covers the header bar, the tab row and the
tab body. The header bar's own requirement states its layout.

#### Scenario: The edit screen keeps its look

- **WHEN** a browser opens the process surface
- **THEN** its layout comes from compiled styles

#### Scenario: The group-rename label still renders correctly, unmigrated

<!-- This scenario's title predates the change that ended the state it names; the title stays so a later delta reads this as one scenario evolving. -->
- **WHEN** the canvas draws a group's rename label
<!-- antislop: allow negation-habit -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
- **THEN** it carries no literal `canvas-group-name` class
- **AND** its computed style, including its `cursor: grab` affordance, equals
  the value the deleted stylesheet declared

## REMOVED Requirements

### Requirement: A process-identity header bar shows draft and publish status

**Reason**: The bar no longer prints the key, the revision or the hash. The
menu and link rules in this requirement moved when the Settings tab took the
process settings.

<!-- antislop: allow sentence-length -->
<!-- Base wording stays verbatim in a MODIFIED block. -->
**Migration**: "The header bar holds back, name, state, Test, Publish and the
menu" and "The header bar's state says what holds for the draft" replace the
bar's facts. `studio-process-tabs` states the menu and the Access view's groups
link.
