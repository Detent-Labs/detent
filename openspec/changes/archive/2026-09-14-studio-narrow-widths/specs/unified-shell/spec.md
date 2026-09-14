## MODIFIED Requirements

### Requirement: The header and register tab render from compiled styles

The shell header and its register tab SHALL render from compiled component
styles. Their rules SHALL leave `shell.css`. The compiled result SHALL match
the previous stylesheet declaration for declaration, apart from the wrap.
That covers the flex layout and gap, the divider border and the muted
background. It also covers the tab's monospace uppercase type, its accent
background and its clipped leading corner.

The header SHALL wrap at every width. The requirement "The header wraps at
every width" states where each item goes.

#### Scenario: The header keeps its look

- **WHEN** a browser renders the header after the migration
- **THEN** its computed `display`, gap, border, background and the tab's
  clip-path equal the values the deleted stylesheet declared

#### Scenario: The header wraps on a narrow viewport

- **WHEN** the viewport is narrower than the header's items at their
  narrowest
- **THEN** the header's items wrap onto more than one line

### Requirement: The account group and menu render from compiled styles

The shell's account group and its account menu SHALL render from compiled
component styles. Their rules SHALL leave `shell.css`. The compiled result
SHALL match the previous stylesheet declaration for declaration, with one
exception. The account group SHALL grow into its line's free room, in place
of a leading auto margin. The identity span SHALL contain its inline size,
grow, and align its text to the end.

The match covers the group's gap and alignment, the menu's position, spacing
and border, and each menu row's own layout.

The menu's open state SHALL compile from a StyleX conditional value keyed
on the native `:popover-open` pseudo-class. No hand-written rule SHALL
select on `:popover-open` after migration.

#### Scenario: The account group and menu keep their look

- **WHEN** a browser renders the account group and an open account menu
  after the migration
- **THEN** the group's gap and alignment equal the values the deleted
  stylesheet declared
- **AND** so do the menu's computed layout, spacing and border
- **AND** the group grows into its line's free room, in place of a leading
  auto margin

#### Scenario: The menu still opens and closes through the Popover API

- **WHEN** an actor triggers the account menu
- **THEN** it opens through the native Popover API, unchanged from before
  the migration
- **AND** its open-state layout renders correctly

### Requirement: The rest of shell.css renders from compiled styles

The remaining rules of `shell.css` SHALL render from compiled component
styles. Five things have them. One is the shared nav wrapper every area's
root component renders. The rest are the login screen, the error banner, the
error boundary fallback, and the profile page. The file `shell.css` SHALL
have no rule this migration covers.

The compiled result SHALL match the previous stylesheet declaration for
declaration, with one exception: the nav wrapper SHALL NOT grow.

The shared nav wrapper's class SHALL migrate at every call site together.
That includes the studio area's own root component. Deferring that one call
site would leave it with a literal class no compiled rule matches. Nothing
else in the studio needs to change to make that true.

#### Scenario: The nav wrapper keeps its look everywhere

- **WHEN** a browser renders any area's nav wrapper after the migration,
  studio's included
- **THEN** its computed gap and its 30rem order and basis equal the values
  the deleted stylesheet declared
- **AND** it takes none of the header's free room

#### Scenario: The login, error and profile screens keep their look

- **WHEN** a browser renders the login screen after the migration
- **THEN** its computed layout, spacing, color and border equal the
  values the deleted stylesheet declared
- **AND** the same holds for an error banner, the error boundary
  fallback, and the profile page

## ADDED Requirements

### Requirement: The header wraps at every width

The shell header SHALL wrap at every width and in every area. An item its
line cannot hold SHALL move to a further line. An item wider than a whole
line SHALL stay on one line. An area nav wider than the header therefore
still overflows it. In the studio, no header item SHALL clip. There the
header SHALL NOT push the page into a sideways scroll, down to a window 400px
wide.

The identity span beside the account button SHALL shorten to its 6rem floor
before the row breaks. Its text ends in an ellipsis once it shortens. Where
even the floor leaves too little room, the account group SHALL move to its
own line. There it keeps to the header's trailing edge, with the identity
span immediately left of the account button.

At 30rem and below, the register tab and the account group SHALL share the
first line. The area nav SHALL take a line of its own under them.

The header's muted background and its 2px divider SHALL span every line,
with the divider under the last one. A wrap SHALL NOT change the order in
which keyboard focus or a screen reader reaches the header's controls.

#### Scenario: A wide window keeps the header on one line

- **WHEN** an actor opens the studio in a window 1440px wide
- **THEN** the header holds one line
- **AND** the actor's name stands in full beside the account button

#### Scenario: The name shortens before the line breaks

- **WHEN** the actor `demo-superuser@example.test` opens the studio in a
  window 680px wide
- **THEN** the header still holds one line
- **AND** the actor's name ends in an ellipsis

#### Scenario: The account group moves to a second line

- **WHEN** the studio opens in a window 560px wide
- **THEN** the register tab and the area nav hold the first line
- **AND** the account group holds a second line, at the header's trailing
  edge
- **AND** no header item clips, and the page does not scroll sideways

#### Scenario: A phone window puts the nav under the account group

- **WHEN** the studio opens in a window 400px wide
- **THEN** the register tab and the account group share the first line
- **AND** the area nav holds the line under them
- **AND** the page does not scroll sideways because of the header

#### Scenario: A wrap keeps the focus order

- **WHEN** a keyboard user tabs through the header in a window 560px wide
- **THEN** focus reaches the area nav's buttons first and the account button
  last, the same order as at 1440px
