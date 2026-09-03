<!-- antislop: allow-file passive-voice -->
<!-- Every scenario here uses the fixed SHALL/WHEN/THEN Gherkin grammar the rest of this repo's specs use; that grammar is structurally passive. -->

## MODIFIED Requirements

<!-- antislop: allow synonym-rotation -->
<!-- The header matches openspec/specs/studio-app/spec.md:66 verbatim, as a MODIFIED requirement must. -->
### Requirement: Leaving the edit screen with unsaved changes prompts first

Every control that navigates away from an open draft SHALL check the dirty
state before navigating. The header bar already computes that state as
draft vs. last-saved body. That includes the edit screen's own "Back to
processes", "Versions" and "Player" links. It also includes the studio
area's top-level "Processes", "Tools" and "Templates" tabs.

When the draft carries no unsaved change, a control SHALL navigate exactly
as it does today, with no prompt.

When the draft carries an unsaved change, a control SHALL ask for
confirmation before navigating. This uses the browser's own `confirm()`
prompt with a `t()` string.

The toolbar's Publish and Discard controls no longer share that pattern.
Each confirms in a dialog of the application's own instead. Each commits an
act the developer cannot undo. See `studio-publish` for the publish dialog,
and the requirement below for the other one. A navigation prompt guards no
commit, so it keeps the native prompt.

Confirming SHALL proceed with the navigation; the navigation drops the
unsaved edits, exactly as an explicit Discard already drops them. Canceling
SHALL leave the developer on the edit screen with the draft untouched.

This requirement covers only the in-app links named above. A browser-level
navigation (the Back button, closing the tab, an address-bar navigation) is
out of scope.

#### Scenario: A clean draft navigates without a prompt

- **WHEN** the developer has an unchanged draft and chooses "Back to
  processes", "Versions", "Player", or a top-level studio tab
- **THEN** the screen navigates immediately, with no confirmation prompt

#### Scenario: An unsaved change on the edit screen's own nav prompts first

- **WHEN** the developer has an unsaved change on the open draft and
  chooses "Back to processes", "Versions" or "Player"
- **THEN** the screen asks for confirmation before navigating

#### Scenario: An unsaved change on the studio area's top-level nav prompts first

- **WHEN** the developer has an unsaved change and chooses the
  "Processes", "Tools" or "Templates" tab in the studio area's navigation
- **THEN** the screen asks for confirmation before navigating

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

## ADDED Requirements

### Requirement: Discarding a draft confirms in a modal dialog

The edit screen's Discard control SHALL confirm in a modal dialog of the
application's own, not in the browser's `confirm()` prompt. The dialog SHALL
take the treatment `studio-publish` fixes for the publish dialog. That means
the native `dialog` element opened with `showModal()`, an accessible name
through `aria-labelledby`, and a platform cancel read as a decline. It also
means the initial focus and the focus return that requirement fixes.

Here the confirming control destroys the draft, and the studio carries no undo.
So the declining control SHALL hold the initial focus, and the destructive one
SHALL NOT. Document order alone puts the destructive control first.

The dialog SHALL state the process and the draft revision it will drop. It
SHALL state that the published versions stay. It SHALL state that only the
unpublished draft goes. That last sentence is the one fact a developer
needs. The native prompt could not carry it beside the facts above.

Declining SHALL leave the draft untouched and SHALL send no request. A
discard the engine refuses SHALL render its reason inside the open dialog.
The publish dialog reports a refusal the same way.

#### Scenario: Discarding confirms with the facts first

- **WHEN** the developer chooses Discard on an open draft
- **THEN** a modal dialog opens naming the process and the draft revision
- **AND** it states that the published versions stay
- **AND** no discard request is sent until the developer confirms

#### Scenario: Declining keeps the draft

- **WHEN** the developer cancels that dialog, or dismisses it with Escape
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
