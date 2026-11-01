# Spec Delta

## MODIFIED Requirements

<!-- antislop: allow synonym-rotation -->
<!-- Why: a remove control acts on one step; the canvas's delete control acts on a whole selection. -->
### Requirement: The configuration pane's masthead names the step

<!-- Why: a remove control acts on one step; the canvas's delete control acts on a whole selection. -->
<!-- antislop: allow synonym-rotation -->
The masthead SHALL NOT stand. The step page carries the step's name line, its
first-step mark and its remove control. Those belong to `studio-step-page`.

The step's key field SHALL stand in the step page's Developer view. The
key-derivation requirement below governs it.

The step's `id` SHALL stand in the step page's Developer view. That disclosure
carries the step's JSON as well, read-only.

The missing-translation warning SHALL stand beside the name line and beside
the description line. Those stay two of the six `LocalizedTextInput` sites
`studio-app` requires a warning at. Each warning is a sibling of its field,
never nested inside a label.

The step's open issue count SHALL stand on its rail row. That count totals the
step's own issues and those of its paths, timers and actions.

The outcome field SHALL stand in the step page's "How the case ends" section.
An end step declares its outcome on departure.

<!-- The scenario names below repeat the live spec's wording verbatim, so a delta can match them. -->
<!-- antislop: allow synonym-rotation -->
#### Scenario: The masthead shows the step's identity

- **WHEN** an author opens a step on the step page
- **THEN** the page carries the step's kind, its label, its key and its
  description
- **AND** the Canvas tab has no masthead

#### Scenario: The label edits inline

- **WHEN** an author types a new label into the step page's name line
- **THEN** the draft's step label changes
- **AND** the key derives per the key-derivation requirement below

#### Scenario: The masthead keeps its translation warnings

- **WHEN** the content locale is `de` and the step's label has no `de`
  value
- **THEN** the missing-translation warning stands beside the name line

#### Scenario: The masthead sets the initial step

- **WHEN** an author marks a step as the draft's first step
- **THEN** the draft's `workflow.initialStep` names that step
- **AND** the step page carries the first-step mark

#### Scenario: The overflow shows raw JSON

- **WHEN** an author opens the step page's Developer view
- **THEN** that disclosure carries the step's JSON, read-only

#### Scenario: The overflow offers step removal

- **WHEN** an author presses the step page's remove control
- **THEN** the step leaves the draft
- **AND** the step page holds the first remaining step in the rail's order

#### Scenario: The issue count covers a path's issue

- **WHEN** a step has no issue of its own, and one of its paths carries a
  failing guard
- **THEN** that step's rail row counts one
