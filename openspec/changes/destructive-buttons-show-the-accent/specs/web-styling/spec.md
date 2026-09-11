## ADDED Requirements

### Requirement: A destructive control renders outlined in the accent

Every control carrying the literal class `.btn-destructive` SHALL also carry
`.btn-secondary`. That covers every area of `packages/web`. Which controls
carry the class stays as it stands.

Such a control SHALL render its text and its border in the accent. Its
background SHALL stay transparent at rest. It SHALL render neither filled nor
red. That treatment is the one `DESIGN.md` states. No later rule in the shared
stylesheet SHALL override it.

On hover and while pressed, the control SHALL take the secondary control's
wash. Its text and its border SHALL then read `--color-accent-on-muted`, the
accent step that clears a tinted ground. The plain accent measures under
4.5:1 on that wash. A disabled control SHALL keep the accent at the shared
disabled opacity. Keyboard focus SHALL draw the shared accent focus ring.

#### Scenario: Cancel instance shows the accent outline

- **WHEN** an operator opens a running instance
- **THEN** the Cancel instance control's computed text color and border color
  equal the accent
- **AND** its computed background is transparent

#### Scenario: Hover reads the accent step for a tinted ground

- **WHEN** the pointer rests on a destructive control
- **THEN** its text and its border read `--color-accent-on-muted`
- **AND** its background shows the secondary control's hover wash
- **AND** its text contrast against that wash is at least 4.5:1

#### Scenario: Pressing keeps the text readable

- **WHEN** the pointer holds a destructive control down
- **THEN** its text and its border read `--color-accent-on-muted`
- **AND** its text contrast against the pressed wash is at least 4.5:1

#### Scenario: A destructive control differs from the secondary one beside it

- **WHEN** the instance screen shows Cancel instance beside Refresh
- **THEN** the two controls differ in text color and in border color

#### Scenario: A disabled destructive control keeps the accent

- **WHEN** a destructive control carries the `disabled` attribute
- **THEN** it renders at the shared disabled opacity, with its text and its
  border still in the accent

#### Scenario: Every destructive control carries the secondary class

- **WHEN** any element in `packages/web` carries `.btn-destructive`
- **THEN** the same element carries `.btn-secondary`
