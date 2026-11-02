## MODIFIED Requirements

### Requirement: The form editor writes straight into the draft

<!-- The screen's Discard control drops every unsaved change; removing a card takes one entry off the form. -->
<!-- antislop: allow synonym-rotation -->
The editor SHALL write directly to the in-browser draft as the author works.
It offers no Save button. The draft's automatic save carries each change to the
server, as `studio-app` states.

Navigating away and back SHALL carry the same draft state, since every
change already lands in the draft.

#### Scenario: Navigating away keeps every change

- **WHEN** the developer navigates away from the form editor after moving or
  adding a field
- **THEN** the draft keeps that change
- **AND** the draft's automatic save carries that change

#### Scenario: Returning to the editor shows the same state

- **WHEN** the developer navigates away from the form editor and back to it,
  without an intervening save
- **THEN** the page carries the same fields, in the same order, the developer
  left it in
