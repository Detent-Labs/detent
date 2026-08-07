<!-- antislop: allow-file passive-voice synonym-rotation -->
<!-- Why passive-voice: a scenario states an outcome, and the actor is the
     system under test. Why synonym-rotation: this file quotes the exact
     name of an existing requirement, "The CEL surface stays reachable
     from every builder site," for cross-reference; "surface" there is a
     proper-noun-ish quote, not a synonym choice against this file's own
     "show". Matches this capability's own live spec's precedent for
     both. -->
## ADDED Requirements

### Requirement: An automatic path's guard shows a plain-English summary on its canvas edge

The canvas SHALL show a plain-English summary of an automatic path's
guard as a label on that path's edge. A new pure function,
`summarizeCondition`, SHALL build that summary from the same
`Condition`/`Row` model the builder already computes for that guard.
It SHALL NOT read `celReadout`, the builder's raw-CEL preview text, to
produce this summary. That text is CEL syntax, not a sentence.

A guard the builder cannot represent as rows SHALL show its raw CEL text
as the edge label instead. See "A fragment the builder cannot represent
survives as a raw row" above.

#### Scenario: A single-row guard shows its plain-English form

- **WHEN** an automatic path's guard reads `data.status == "approved"`,
  and the builder shows it as one row
- **THEN** the path's canvas edge shows a label built from that row, not
  the raw CEL

#### Scenario: An unbuildable guard shows raw CEL on the edge

- **WHEN** an automatic path's guard holds a fragment the builder keeps
  as a raw row
- **THEN** the path's canvas edge shows that fragment's CEL text as the
  label

### Requirement: The path inspector shows a "triggered by" control, and the guard under an "Only when" heading

The path inspector SHALL render the path's existing `trigger` field
as a two-option segmented control, labeled "triggered by". The options
are a participant's choice (`trigger: "manual"`), and a condition
(`trigger: "automatic"`). This SHALL set the same field the path
inspector sets today; it adds no new field.

Choosing "a condition" SHALL show the existing `ConditionBuilder` row
UI under an "Only when" heading. Choosing "a participant's choice"
SHALL hide it, since a manual path carries no guard.

#### Scenario: Choosing "a condition" shows the guard under "Only when"

- **WHEN** the developer selects "a condition" in a path's "triggered
  by" control
- **THEN** the path's `trigger` becomes `automatic`
- **AND** the existing `ConditionBuilder` row UI renders under an
  "Only when" heading

#### Scenario: Choosing "a participant's choice" hides the guard

- **WHEN** the developer selects "a participant's choice" in a path's
  "triggered by" control
- **THEN** the path's `trigger` becomes `manual`
- **AND** no "Only when" panel renders for that path

### Requirement: The path-guard site's CEL toggle is a labeled "Developer view" disclosure

The path-guard condition site's CEL toggle SHALL become a collapsible
disclosure labeled "Developer view". This SHALL hold on the canvas edit
screen only. This is the same toggle "The CEL surface stays reachable
from every builder site" describes.

The toggle's label and placement change at this one site. Its behavior
does not: the mode still does not persist to the draft or to the
published body.

This requirement covers the path-guard site only. The view-override
sites (`visible`, `required`, `readonly`) keep their existing toggle
presentation; they sit outside this change's scope.

#### Scenario: The path-guard site's toggle reads "Developer view"

- **WHEN** a developer opens a path's guard editor on the canvas edit
  screen
- **THEN** the CEL toggle appears as a "Developer view" disclosure

#### Scenario: The toggle's mode still does not persist

- **WHEN** a developer opens the "Developer view" disclosure, reads the
  CEL, and navigates away
- **THEN** no part of the draft records that the disclosure was open
