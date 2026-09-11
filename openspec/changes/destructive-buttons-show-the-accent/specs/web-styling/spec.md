## ADDED Requirements

### Requirement: A destructive control renders outlined in the accent

A control that commits a destructive action SHALL carry the literal class
`.btn-destructive` beside `.btn-secondary`. That covers every area of
`packages/web`.

Such a control SHALL render its text and its border in the accent. Its
background SHALL stay transparent at rest. It SHALL render neither filled nor
red. That treatment is the one `DESIGN.md` states. No later rule in the shared
stylesheet SHALL override it.

On hover and while pressed, the control SHALL take the secondary control's
wash. Its text and its border SHALL stay in the accent. A disabled control
SHALL keep the accent at the shared disabled opacity. Keyboard focus SHALL
draw the shared accent focus ring.

#### Scenario: Cancel instance shows the accent outline

- **WHEN** an operator opens an instance the operator may cancel
- **THEN** the Cancel instance control's computed text color and border color
  equal the accent
- **AND** its computed background is transparent

#### Scenario: Hover keeps the accent

- **WHEN** the pointer rests on a destructive control
- **THEN** its text and its border stay in the accent
- **AND** its background shows the secondary control's hover wash

#### Scenario: A destructive control differs from the secondary one beside it

- **WHEN** the draft confirmation dialog shows its destructive control beside
  Cancel
- **THEN** the two controls differ in text color and in border color

#### Scenario: A disabled destructive control keeps the accent

- **WHEN** a destructive control carries the `disabled` attribute
- **THEN** it renders at the shared disabled opacity, with its text and its
  border still in the accent

#### Scenario: Every destructive control carries the secondary class

- **WHEN** any element in `packages/web` carries `.btn-destructive`
- **THEN** the same element carries `.btn-secondary`
