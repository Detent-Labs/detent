## ADDED Requirements

### Requirement: The canvas renders from compiled styles

`canvas/CanvasView.tsx` and `canvas/EditRail.tsx` SHALL render from compiled
component styles, reading `form-ui/tokens.stylex`. The rendered result SHALL
match the previous stylesheet declaration for declaration, including every
pointer-driven state (drag, selection, insert-target, group-collapsed) and
every keyboard-driven state (roving focus ring, `:focus-visible` halo).

`canvas-node` and `panzoom-exclude` SHALL remain literal, unhashed class
strings on every element that carries them today. Keyboard-focus targeting
and Panzoom's own exclude-class contract both read one of these two strings
directly, outside the compiled-style system.

#### Scenario: The canvas keeps its look and its keyboard model

- **WHEN** a browser renders the canvas edit screen and a developer walks its
  nodes and edges with the keyboard, in Chromium and in Firefox
- **THEN** the canvas's computed layout, spacing, color and border equal the
  values the deleted stylesheet declared, and the keyboard traversal,
  selection and focus-ring behavior are unchanged from before this change

#### Scenario: Panzoom still excludes every node and edge group from panning

- **WHEN** a developer starts a pointer drag on a step node, an edge group, a
  waypoint handle, or the inline rename field
- **THEN** the press reaches the canvas's own handlers and does not pan the
  canvas, because each of those elements still carries the literal
  `panzoom-exclude` class Panzoom's own exclude-class option reads

## MODIFIED Requirements

### Requirement: The edit screen's own layout renders from compiled styles

`screens/EditScreen.tsx`, the layout the structure view sits in, SHALL
compile from typed StyleX style objects. The rendered result SHALL
match the previous stylesheet declaration for declaration.

#### Scenario: The edit screen keeps its look

- **WHEN** a browser opens the edit screen's structure view
- **THEN** its computed layout equals the value the deleted stylesheet
  declared

#### Scenario: The group-rename label still renders correctly, unmigrated

<!-- This scenario's title predates this delta and now describes a state
     this delta ends. The body below states the corrected, current fact;
     the title stays so `openspec validate` recognizes this as the same
     scenario evolving, not one dropped and a new one added. -->
- **WHEN** the inspector shows a group's rename label
- **THEN** it carries no literal `canvas-group-name` class
- **AND** its computed style, including its `cursor: grab` affordance,
  equals the value the deleted stylesheet declared
