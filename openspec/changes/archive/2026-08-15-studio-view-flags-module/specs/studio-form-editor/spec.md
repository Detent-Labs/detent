## MODIFIED Requirements

### Requirement: A selected field's strip sets its overrides and span

Selecting a placed field SHALL show a strip below the canvas for that
field. The strip SHALL offer `visible`, `required`, and `readonly`.
Each is a three-way choice among `true`, `false`, and a CEL
expression. Choosing the expression option SHALL reveal an input for
that field's expression. The strip SHALL also offer `group` and
`span`.

Each control SHALL start at the value the engine resolves for an absent
key. That value is true for `visible`. It is false for `required` and for
`readonly`. `resolveFlag` (`src/runtime/api.ts`) sets those three. The
strip SHALL show what the engine does, not what the key holds.

Each control SHALL write its key only on a departure from that default.
On a return to the default, the control SHALL clear the key. A view
entry that carried no `visible` key SHALL carry none again, after a tick
and an untick.

That rule keeps `ProcessBody` still under a change that alters no
behaviour. A written `visible: true` moves `definitionHash`, and an
identical re-publish then stops being a no-op.

A `visible` of literal `false` SHALL disable the `required` and the
`readonly` control. It SHALL clear both keys. A `visible` that holds a
CEL expression SHALL leave both controls alone. Nobody can read an
expression's value without an instance.

#### Scenario: An absent visible key shows the field as visible

- **WHEN** the developer selects a placed field whose view entry carries
  no `visible` key
- **THEN** the strip's `visible` control reads true

#### Scenario: Returning to the default clears the key

- **WHEN** the developer sets a placed field's `visible` to false, then
  back to true
- **THEN** the view entry carries no `visible` key

#### Scenario: A departure from the default writes the key

- **WHEN** the developer sets a placed field's `visible` to false
- **THEN** the view entry carries `visible: false`

#### Scenario: An absent required key reads false

- **WHEN** the developer selects a placed field whose view entry carries
  no `required` key
- **THEN** the strip's `required` control reads false

#### Scenario: Hiding a field disables and clears its other two flags

- **WHEN** the developer sets a placed field's `visible` to false on an
  entry carrying `required: true` and `readonly: true`
- **THEN** the strip disables the `required` and `readonly` controls
- **AND** the view entry carries neither key

#### Scenario: A CEL visible leaves the other two controls alone

- **WHEN** a placed field's `visible` is a CEL expression
- **THEN** the strip leaves the `required` and `readonly` controls
  enabled

#### Scenario: Leaving the expression option restores the default, not false

- **WHEN** the developer switches a placed field's `visible` from the
  expression option to the boolean option
- **AND** that entry carries `required: true` and `readonly: true`
- **THEN** the view entry carries no `visible` key
- **AND** the `required` and `readonly` keys stay as they were

#### Scenario: Switching an override to an expression reveals the input

- **WHEN** the developer sets a selected field's `required` choice to
  the expression option
- **THEN** a CEL expression input appears in the strip for `required`

#### Scenario: Changing span changes the field's width on the canvas

- **WHEN** the developer sets a selected field's `span` to `2` on a
  `columns: 2` view
- **THEN** that field's card widens to span both columns on the canvas
