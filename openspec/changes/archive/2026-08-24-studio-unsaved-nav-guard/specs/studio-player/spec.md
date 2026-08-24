## MODIFIED Requirements

### Requirement: Player is one of the edit screen's togglable surfaces

The studio area's edit screen already toggles between Structure (Canvas +
Panels) and JSON. Player and Tools are separate, mutually-independent
navigation destinations, not more toggle states of the same screen.
Neither one drives a Draft the way Structure/JSON do.

Switching to Player or Tools while the draft carries unsaved edits goes
through the `studio-app` capability's unsaved-changes guard. That guard is
Requirement "Leaving the edit screen with unsaved changes prompts
first".

Confirming the prompt discards the in-progress edits, the same way an
explicit Discard already does. Canceling leaves the developer on the edit
screen with the draft untouched.

Switching to Player or Tools with a clean draft (nothing unsaved) SHALL NOT
discard it. Returning to the edit screen SHALL show that unchanged draft
exactly as the developer left it.

#### Scenario: Leaving and returning to the edit screen preserves the draft

- **WHEN** a developer with no unsaved edits navigates to Player and back to
  the edit screen
- **THEN** the draft matches its state from before the round trip

#### Scenario: Confirming a Player navigation discards unsaved edits

- **WHEN** a developer has unsaved edits on a draft, navigates to Player, and
  confirms the unsaved-changes prompt
- **THEN** the confirmation discards the edits, the same way an explicit
  Discard already discards them
