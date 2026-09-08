## ADDED Requirements

### Requirement: A pressed bulk flag badge fills with its own flag color

A bulk flag badge the field matrix draws SHALL fill with the color of the
flag it sets, once pressed. The `visible` badge SHALL take the visible
flag's color, `required` the required flag's, and `readonly` the readonly
flag's. No badge SHALL fill with the accent.

The badge and the legend that explains it SHALL read one color per flag.
The legend already draws a swatch in each flag's color. A badge in the
accent contradicts the swatch beside it.

The pressed style SHALL follow the same rule every other state on this
surface follows. Code SHALL pick a named compiled style from the flag it
already holds. No stylesheet SHALL select on the `aria-pressed` attribute
the button carries.

#### Scenario: Each pressed badge takes its own flag's color

- **WHEN** the developer presses the `required` bulk badge on a column
  header
- **THEN** that badge fills with the required flag's color
- **AND** it matches the swatch the legend draws for `required`
- **AND** no badge on the screen fills with the accent

#### Scenario: The badge label stays legible on every flag color

- **WHEN** the developer presses any bulk badge, in either color scheme
- **THEN** its label meets the 4.5:1 contrast minimum against its fill

#### Scenario: The accent stays with the screen's one primary action

- **WHEN** the developer reads the field matrix with several badges pressed
- **THEN** the accent fill appears on the publish control alone
