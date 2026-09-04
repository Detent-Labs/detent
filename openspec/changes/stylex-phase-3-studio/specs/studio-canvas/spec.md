## ADDED Requirements

### Requirement: The process-identity header bar renders from compiled styles

`panels/ProcessHeaderBar.tsx` renders the process-identity header bar,
per this capability's own "A process-identity header bar shows draft
and publish status" requirement. The header bar SHALL render from
compiled component styles. Its two dialogs are each a different
capability's own concern. Only the header bar itself is this
requirement's scope.

#### Scenario: The header bar keeps its look

- **WHEN** a browser renders the process-identity header bar
- **THEN** its computed layout, spacing, color and border equal the
  values the deleted stylesheet declared

### Requirement: The inspector's identity zone and diagnostics drawer render from compiled styles

`panels/StepsPanel.tsx` renders three named regions. They are the
inspector's identity zone, its behavior-zone tab list, and its
diagnostics drawer (`.claude/rules/ui-glossary.md`'s own names for
them). All three SHALL render from compiled component styles. The
rendered result SHALL match the previous stylesheet declaration for
declaration.

#### Scenario: The inspector's own chrome keeps its look

- **WHEN** a browser selects a step and opens the inspector
- **THEN** all three regions keep their computed layout, spacing, color
  and border
- **AND** every value matches the deleted stylesheet's own

### Requirement: The inspector's Paths and Timers tabs render from compiled styles

`panels/PathsPanel.tsx` and `panels/TimersPanel.tsx`, the inspector's
own behavior-zone tabs, SHALL render from compiled component styles.
The rendered result SHALL match the previous stylesheet declaration for
declaration.

#### Scenario: The Paths tab keeps its look

- **WHEN** a browser opens the inspector's Paths tab
- **THEN** its computed layout, spacing, color and border equal the
  values the deleted stylesheet declared

### Requirement: The dock's own layout renders from compiled styles

`dock/EditorDock.tsx` SHALL render from compiled component styles. That
covers the dock's collapsed strip, its tab row, and each tab's content
frame. The rendered result SHALL match the previous stylesheet
declaration for declaration.

`canvas/CanvasView.tsx` and `canvas/EditRail.tsx` render the three
columns above the dock, and this requirement leaves both untouched.
This requirement covers only the dock itself.

#### Scenario: The dock keeps its look and its tab switch still works

- **WHEN** a browser expands the dock and switches between its tabs
- **THEN** the dock's computed layout equals the value the deleted
  stylesheet declared
- **AND** each tab still shows its own content on selection

### Requirement: The edit screen's own layout renders from compiled styles

`screens/EditScreen.tsx`, the layout the structure view sits in, SHALL
compile from typed StyleX style objects. The rendered result SHALL
match the previous stylesheet declaration for declaration.

One class stays a literal exception: `.canvas-group-name`, on the
inspector's group-rename label. `canvas/CanvasView.tsx` still renders
it too. It migrates only when that file does, per `web-styling`'s "A
shared class stays literal until its last consumer migrates" rule.

#### Scenario: The edit screen keeps its look

- **WHEN** a browser opens the edit screen's structure view
- **THEN** its computed layout equals the value the deleted stylesheet
  declared

#### Scenario: The group-rename label still renders correctly, unmigrated

- **WHEN** the inspector shows a group's rename label
- **THEN** it still carries the literal `canvas-group-name` class
- **AND** its computed style matches `canvas/CanvasView.tsx`'s own
  rendering of the same class, unchanged by this migration
