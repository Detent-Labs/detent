<!-- antislop: allow-file sentence-length passive-voice -->
<!-- Why: a MODIFIED block copies its base wording from the live spec, whose debt a new file counts as a rise. -->
# Spec Delta

## ADDED Requirements

### Requirement: Removing steps from the canvas confirms first

The canvas bar's Remove step and Remove steps SHALL open the studio's dialog form before the removal. One selected step SHALL take the dialog the step page's Remove this step opens. Several SHALL take a dialog that names each step. A decline SHALL leave the draft untouched and return the focus to the pressed control.

#### Scenario: One selected step asks first

- **WHEN** an author presses Remove step in the canvas bar with one step selected
- **THEN** a dialog reads "Remove “Review”?" and the draft still holds the step

#### Scenario: Several selected steps are named

- **WHEN** an author presses Remove steps with three steps selected
- **THEN** a dialog reads "Remove 3 steps?" and names each one
- **AND** declining leaves all three in the draft

## MODIFIED Requirements

### Requirement: Arrange confirms before discarding a hand-placed layout

Arrange SHALL ask the author to confirm before it runs, in the studio's
dialog form. This holds
whenever the draft carries at least one step with an explicit stored
position, or at least one waypoint. A draft with neither SHALL arrange
with no confirmation, since nothing hand-placed is at risk. The
confirmation text SHALL say that each path loses the bends placed on it, the
author's word for a waypoint.

#### Scenario: A brand-new canvas arranges without a confirmation

- **WHEN** every step in the draft is still at its computed default,
  with no explicit stored position
- **AND** no path in the draft carries a waypoint
- **AND** an author activates Arrange
- **THEN** the layout updates with no confirmation step

#### Scenario: A hand-placed draft confirms before arranging

- **WHEN** at least one step in the draft carries an explicit stored
  position
- **AND** an author activates Arrange
- **THEN** Arrange asks the author to confirm before the layout updates

#### Scenario: A waypoint-only draft confirms before arranging

- **WHEN** no step in the draft carries an explicit stored position,
  but at least one path carries a waypoint
- **AND** an author activates Arrange
- **THEN** Arrange asks the author to confirm before the layout updates

#### Scenario: Declining the confirmation leaves the layout untouched

- **WHEN** the confirmation appears and the author declines it
- **THEN** the draft's stored layout keeps its prior positions

#### Scenario: The confirmation names the waypoints an arrange will clear

- **WHEN** the draft carries at least one waypoint and an author
  activates Arrange
- **THEN** the confirmation text says each path loses the bends placed on it
