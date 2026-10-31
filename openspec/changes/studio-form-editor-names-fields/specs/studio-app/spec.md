## MODIFIED Requirements

### Requirement: The effect half states its own empty state

The effect half SHALL show an empty state for as long as no step view
references the selected field. It SHALL say that no step asks for the
field yet.

It SHALL offer the route from there to a step's form, "Put this field on a
step". That route SHALL open the form editor (`studio-form-editor`) for the
first step a person works. The selected field then stands in the editor's
palette.

A step a person works is neither an end nor a call to another process. The
route takes the initial step when a person works it. Otherwise it takes the
first such step in the draft's own order. A draft with no step a person
works SHALL offer no route.

<!-- antislop: allow trailing-negation -->
<!-- Why: copied word for word from the live requirement. -->
The empty state SHALL take the empty tone, never the refusal tone. A
field no step asks for yet is an unfinished draft, not a broken one.

#### Scenario: An unused field draws the empty state

- **WHEN** the developer selects a field no step view references
- **THEN** the effect half says that no step asks for the field yet
- **AND** it offers the route to a step view, in the empty tone

#### Scenario: The empty state clears when a step references the field

- **WHEN** a step view gains a reference to the selected field
- **THEN** the effect half lists that step, and the empty state goes

#### Scenario: The route opens the first step's form

- **WHEN** the initial step is a step a person works, labelled Submit
- **AND** the author presses "Put this field on a step"
- **THEN** the form editor opens for Submit
- **AND** the selected field stands in its palette

#### Scenario: The route skips a step no person works

- **WHEN** the initial step calls another process
- **AND** the next step in the draft's order is one a person works, labelled
  Review
- **AND** the author presses "Put this field on a step"
- **THEN** the form editor opens for Review

#### Scenario: No step a person works offers no route

- **WHEN** every step of the draft is an end or a call to another process
- **THEN** the effect half offers no "Put this field on a step" control

## REMOVED Requirements

### Requirement: The Form section's configured-field count reads field entries alone

**Reason**: The Form section states its form's size as a sentence now. The
rule moved to `studio-step-page`, "The Form section states the form's size in
words", with both scenarios.

**Migration**: None.
