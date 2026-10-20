## REMOVED Requirements

### Requirement: Path-submit buttons accept a style prop for their wrapper

**Reason**: No caller in the product passes the prop. Only a test did.

**Migration**: A caller that needs another wrapper layout wraps
`PathButtons` in its own element. The requirement "Path-submit buttons keep
their own wrapper layout" keeps the two rules that still hold.

## ADDED Requirements

### Requirement: Path-submit buttons keep their own wrapper layout

`PathButtons` SHALL draw its wrapper with the layout `form-ui` declares for
it. It SHALL take no prop that changes that layout.

Its button element SHALL keep a plain, literal class name for the shared
control style. `form-ui` SHALL NOT declare a compiled style for that class.

#### Scenario: The wrapper uses the form-ui layout

- **WHEN** a caller renders `PathButtons`
- **THEN** the wrapper carries the compiled layout `form-ui` declares, and
  no other style

#### Scenario: The button's control class stays literal

- **WHEN** `PathButtons` renders a submit button
- **THEN** the button element carries the literal `btn btn-primary` class
