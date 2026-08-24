## ADDED Requirements

### Requirement: Leaving the edit screen with unsaved changes prompts first

Every control that navigates away from an open draft SHALL check the same
dirty state the header bar already computes (draft vs. last-saved body)
before it navigates. That includes the edit screen's own "Back to
processes", "Versions" and "Player" links, and the studio area's top-level
"Processes", "Tools" and "Templates" tabs.

When the draft carries no unsaved change, a control SHALL navigate exactly
as it does today, with no prompt.

When the draft carries an unsaved change, a control SHALL ask for
confirmation before navigating, the same `confirm()`/`t()` pattern the
toolbar's own Publish and Discard controls already use. Confirming SHALL
proceed with the navigation; the unsaved edits are lost, exactly as an
explicit Discard already loses them. Canceling SHALL leave the developer on
the edit screen with the draft untouched.

This requirement covers only the in-app links named above. A browser-level
navigation (the Back button, closing the tab, an address-bar navigation) is
out of scope.

#### Scenario: A clean draft navigates without a prompt

- **WHEN** the developer has made no change since the draft last saved and
  chooses "Back to processes", "Versions", "Player", or a top-level studio
  tab
- **THEN** the screen navigates immediately, with no confirmation prompt

#### Scenario: An unsaved change on the edit screen's own nav prompts first

- **WHEN** the developer has an unsaved change on the open draft and
  chooses "Back to processes", "Versions" or "Player"
- **THEN** the screen asks for confirmation before navigating

#### Scenario: An unsaved change on the studio area's top-level nav prompts first

- **WHEN** the developer has an unsaved change on the open draft and
  chooses the "Processes", "Tools" or "Templates" tab in the studio area's
  own navigation
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
