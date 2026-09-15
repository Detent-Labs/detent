## MODIFIED Requirements

### Requirement: The authoring command turns its text to ink under the pointer

An authoring command is a studio ghost button in slate, in the mono face at
11px. Under the pointer it SHALL keep the muted surface wash, and its text
SHALL turn to ink. While pressed it SHALL keep the wash of ink at 14%, and its
text SHALL turn to ink. Against either wash its text SHALL measure at least
4.5:1, in both color schemes.

The rule SHALL hold for every authoring command. That covers a form card's
open control, the form tab strip's controls, and the change list's commands.
It also covers the form editor's move-up and move-down controls. Those
controls sit on both a placed field's card and a group card's own legend.
They also cover a placed field's own remove control. A group card's own
`Remove ({count})` control is exempt: it keeps its distinct destructive
treatment, since it performs a cascading, multi-entry removal.

A disabled authoring command SHALL take no hover or press look. Its text SHALL
stay slate under the pointer, and its ground SHALL stay transparent. It keeps
the shared disabled opacity.

#### Scenario: Hover turns the open control's text to ink

- **WHEN** the pointer rests on a form card's open control
- **THEN** its text reads ink
- **AND** its background reads the muted surface
- **AND** its text measures at least 4.5:1 against that background, in both
  color schemes

#### Scenario: Pressing keeps the strip control's text readable

- **WHEN** the pointer holds the form tab strip's add control down
- **THEN** its text reads ink
- **AND** its background reads ink at 14%
- **AND** its text measures at least 4.5:1 against that background, in both
  color schemes

#### Scenario: The change list's command follows

- **WHEN** the pointer rests on a change list's command
- **THEN** its text reads ink
- **AND** its background reads the muted surface

#### Scenario: A disabled command takes no hover look

- **WHEN** the pointer rests on a disabled move control in the form tab strip
- **THEN** its text stays slate
- **AND** its background stays transparent

#### Scenario: A placed field's move and remove controls follow

- **WHEN** the pointer rests on a placed field's move-up, move-down or
  remove control in the form editor
- **THEN** its text reads ink
- **AND** its background reads the muted surface
- **AND** its text measures at least 4.5:1 against that background, in both
  color schemes

#### Scenario: A group card's own move controls follow

- **WHEN** the pointer rests on a group card's own move-up or move-down
  control, in its legend
- **THEN** its text reads ink
- **AND** its background reads the muted surface

#### Scenario: A group card's own remove control is exempt

- **WHEN** the pointer rests on a group card's own `Remove ({count})`
  control
- **THEN** it keeps its `.btn.btn-secondary.btn-destructive` look
- **AND** it does not take the authoring-command style
