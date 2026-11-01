# Spec Delta

## MODIFIED Requirements

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
warns about. This requirement exempts one refusal rule, which
`docs/decisions.md` records as open: the timers panel's refusal.

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
  timers panel
- **THEN** the rule computes the advisory role's color, in both color schemes

#### Scenario: An incomplete condition's dashed box reads the role

- **WHEN** a condition row stands incomplete
- **THEN** its dashed border computes the advisory role's color, in both
  color schemes

#### Scenario: No component style reads the ramp's light step

- **WHEN** a contributor searches the component styles of both packages
- **THEN** none of them names the accent ramp's light step
