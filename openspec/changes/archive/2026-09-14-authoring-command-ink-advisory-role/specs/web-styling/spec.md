## ADDED Requirements

### Requirement: The advisory tone reads its own role

The shell's token sheet SHALL declare an advisory role, and the token module
SHALL alias it like every other role. In the light scheme the role SHALL
resolve to `#e25a40`. In the dark scheme it SHALL resolve to `#ff9783`. Each
value SHALL clear WCAG 1.4.11's 3:1 non-text minimum against its own scheme's
page ground. It SHALL clear the same minimum against that scheme's muted
surface.

The advisory tone draws four marks. Two are a warning callout's rule and an
empty form card's border. The other two are the dashed boxes of an incomplete
condition and an unresolved migration mapping. Each of the four SHALL read the
advisory role.

A warning callout sets refusal text beside a 3px rule, next to the value it
warns about. This requirement exempts three refusal rules, which
`docs/decisions.md` records as open: the step page's 2px warning, the checks
rail's held-back group and the timers panel's refusal.

No component style in `packages/web` or `packages/form-ui` SHALL read the
accent ramp's light step. The role SHALL draw a rule or a border alone. A
stamp keeps its five tones, and none of them reads this role.

#### Scenario: The light role clears the non-text minimum

- **WHEN** the browser prefers the light color scheme
- **THEN** the advisory role resolves to `#e25a40`
- **AND** it measures at least 3:1 against the page ground
- **AND** it measures at least 3:1 against the muted surface

#### Scenario: The dark role clears the non-text minimum

- **WHEN** the browser prefers the dark color scheme
- **THEN** the advisory role resolves to `#ff9783`
- **AND** it measures at least 3:1 against the page ground
- **AND** it measures at least 3:1 against the muted surface

#### Scenario: A warning callout's rule reads the role

- **WHEN** a studio screen sets refusal text beside a 3px rule, outside the
  checks rail and the timers panel
- **THEN** the rule computes the advisory role's color, in both color schemes

#### Scenario: An incomplete condition's dashed box reads the role

- **WHEN** a condition row stands incomplete
- **THEN** its dashed border computes the advisory role's color, in both
  color schemes

#### Scenario: No component style reads the ramp's light step

- **WHEN** a contributor searches the component styles of both packages
- **THEN** none of them names the accent ramp's light step

### Requirement: The authoring command turns its text to ink under the pointer

An authoring command is a studio ghost button in slate, in the mono face at
11px. Under the pointer it SHALL keep the muted surface wash, and its text
SHALL turn to ink. While pressed it SHALL keep the wash of ink at 14%, and its
text SHALL turn to ink. Against either wash its text SHALL measure at least
4.5:1, in both color schemes.

The rule SHALL hold for every authoring command. That covers a form card's
open control, the form tab strip's controls, and the change list's commands.

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
