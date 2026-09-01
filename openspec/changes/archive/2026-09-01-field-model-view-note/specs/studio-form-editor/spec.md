<!-- antislop: allow-file sentence-length passive-voice -->
<!-- The MODIFIED block below carries live-spec text verbatim, which the archive step matches by exact header, so its existing findings stay unrewritten. -->
## MODIFIED Requirements

### Requirement: The canvas places fields at the view's column count, in array order

The canvas SHALL show the form at the step view's declared column
count (see the `runtime-api` and `form-ui` capabilities for `columns`
and `span`). Position on the canvas SHALL be the view array's own
order, read left to right, then down. This is the same order the
override-row list's `↑`/`↓` buttons already express.

A group field's own member fields SHALL show at the same column count
as the form around them. That matches how `form-ui` lays a group out
(see the `form-ui` capability). The editor SHALL offer no separate
column count for a group.

The canvas places view entries, not field entries alone. A note card takes
its position from the same array and answers the same order rule. Nothing
here reads a card's kind: a note occupies a slot the way a field card does.

#### Scenario: A form built before this editor loads unchanged

- **WHEN** the developer opens the editor for a view whose fields carry
  no `span` or `columns`
- **THEN** the canvas shows one column, every field full width, in the
  view array's existing order

#### Scenario: Dragging a field to a new position changes the array

- **WHEN** the developer drags a placed field to a new position on the
  canvas
- **THEN** the view array's order changes to match, left to right then
  down

#### Scenario: A note card takes its position from the same array

- **WHEN** the developer opens the editor for a view holding a field entry,
  a note and a second field entry
- **THEN** the canvas draws three cards in that order, left to right then
  down

## ADDED Requirements

### Requirement: An author places a note on the form canvas

The form editor SHALL offer adding a note to the step's view. A note SHALL
appear on the canvas as a card among the field cards. It sits at its own
position in the view array. The card shows the text an author gave it.

The palette lists catalog fields not yet on the form. A note belongs to no
catalog, so the editor SHALL offer it beside the palette rather than inside it.

A placed note SHALL answer the same gestures a field card answers. That
includes the keyboard route reaching a field's position without a drag.

#### Scenario: An author adds a note and positions it

- **WHEN** an author adds a note and moves it above the first field card
- **THEN** the note occupies the view array's first position, and the step's
  draft records it there

#### Scenario: A note is reachable without a drag

- **WHEN** an author moves a note using the keyboard route that moves a field
  card
- **THEN** the note changes position the same way a field card does

### Requirement: A note's strip sets its text, its span, its group and its visibility

Selecting a note SHALL open a strip that sets the note's text. It covers the
body's base locale and any other locale the body declares. The strip SHALL set
the note's `span` and its `group`. For `visible` it SHALL offer the same
condition input a field card's strip offers.

The `group` control SHALL be the one a field card's strip already carries. Two
things make it load-bearing rather than decorative. The renderer honors a
note's `group`, per the `form-ui` capability. The keyboard route the
requirement above reuses carries a move-to-group command of its own. A strip
omitting the control would leave an author a gesture they can fire and cannot
see.

The strip SHALL offer no requiredness, no readonly state and no validation. A
note carries none of those. Offering them would invite an author to expect a
value the note never holds.

#### Scenario: An author writes a note's text in the base locale

- **WHEN** an author selects a note and types its text
- **THEN** the draft records that text under the body's `baseLocale`

#### Scenario: A note's strip offers visibility and group but no requiredness

- **WHEN** an author selects a note
- **THEN** the strip shows a condition input for `visible`, a span control and
  a group control
- **AND** it shows no required, readonly or validation control

#### Scenario: An author places a note inside a group from its strip

- **WHEN** an author selects a note and picks a group field's key in its strip
- **THEN** the draft records that key as the note's `group`, and the note
  renders inside that group's container

#### Scenario: The editor reports a note missing its base-locale text

- **WHEN** a step's view holds a note whose text is empty for the body's
  `baseLocale`
- **THEN** the editor reports it before publish, rather than letting publish be
  the first place an author learns of it

### Requirement: A note marks no catalog field as used

A note SHALL appear in no field usage list. A note SHALL mark no catalog field
as used, so the palette keeps offering every field the notes sit beside.

The count of a step's configured fields lives outside the form editor, on the
Steps panel. The `studio-app` capability states its rule.

#### Scenario: A note leaves the usage list alone

- **WHEN** a step's view holds one field entry and three notes
- **THEN** that step appears in the usage list of the one field alone

#### Scenario: A note marks no catalog field as used

- **WHEN** a step's view holds notes alone
- **THEN** the palette still offers every catalog field, and the editor reports
  that step as using none
