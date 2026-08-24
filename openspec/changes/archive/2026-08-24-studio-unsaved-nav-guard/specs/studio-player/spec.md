## MODIFIED Requirements

### Requirement: Player is one of the edit screen's togglable surfaces

The studio area's edit screen already toggles between Structure (Canvas +
Panels) and JSON. Player and Tools are additional, mutually-independent
navigation destinations, not additional toggle states of the same screen,
since neither drives a Draft the way Structure/JSON do. Switching to Player
or Tools while the draft carries an unsaved change goes through the
`studio-app` capability's unsaved-changes guard (Requirement: "Leaving the
edit screen with unsaved changes prompts first"): confirming the prompt
discards the in-progress edits, the same way an explicit Discard already
does; canceling leaves the developer on the edit screen with the draft
untouched. Switching to Player or Tools with a clean draft (nothing unsaved)
SHALL NOT discard it; returning to the edit screen SHALL show that unchanged
draft exactly as it was left.

#### Scenario: Leaving and returning to the edit screen preserves the draft

- **WHEN** a developer with no unsaved edits navigates to Player and back to
  the edit screen
- **THEN** the draft is unchanged from before the round trip

#### Scenario: Unsaved edits on a Player navigation are lost only after confirming

- **WHEN** a developer has unsaved edits on a draft, navigates to Player, and
  confirms the unsaved-changes prompt
- **THEN** the edits are discarded, the same way an explicit Discard already
  discards them
