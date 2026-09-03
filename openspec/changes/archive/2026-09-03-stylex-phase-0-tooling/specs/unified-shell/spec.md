## ADDED Requirements

### Requirement: The header and register tab render from compiled styles

The shell header and its register tab SHALL render from compiled component
styles. Their rules SHALL leave `shell.css`. The rendered result SHALL match
the previous stylesheet declaration for declaration. That covers the flex
layout and gap, the divider border and the muted background. It also covers
the tab's monospace uppercase type, its accent background and its clipped
leading corner. Below 30rem the header SHALL wrap.

#### Scenario: The header keeps its look

- **WHEN** a browser renders the header after the migration
- **THEN** its computed `display`, gap, border, background and the tab's
  clip-path equal the values the deleted stylesheet declared

#### Scenario: The header wraps on a narrow viewport

- **WHEN** the viewport is narrower than 30rem
- **THEN** the header's items wrap onto more than one line

### Requirement: Global rules live beside the tokens, not among them

`tokens.css` SHALL carry no element selector and no universal selector. The
reset, the `:focus-visible` ring and the element defaults SHALL live in a
separate `global.css`. The shell SHALL import both once, from its entry
module, ahead of any area or form-ui stylesheet.

Shared control classes MAY stay in `tokens.css` until the phase that
migrates them. The `.btn` family has 209 call sites across every area, so it
does not move with the reset.

#### Scenario: A token file selects no element

- **WHEN** a contributor opens `tokens.css`
- **THEN** no rule there selects an element type or `*`

#### Scenario: The reset still applies

- **WHEN** any area renders
- **THEN** the universal `box-sizing` rule and the focus ring still apply
