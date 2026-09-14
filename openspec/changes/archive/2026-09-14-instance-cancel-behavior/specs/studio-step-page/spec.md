## MODIFIED Requirements

### Requirement: The step page stands its sections open in two columns

The step page SHALL lay its sections in two columns. No section SHALL
collapse. The leading column SHALL carry Path to, Assignment, Cancellable,
Which process it calls, and How the case ends. The trailing column SHALL
carry On entry, On exit, Time limit, and Step form fields.

A section SHALL stand only where the step's kind declares it. A task step
carries Assignment. A subprocess step carries Which process it calls. An end
step carries How the case ends. It has no outgoing path, so it carries
neither On exit nor Time limit.

A task step and a subprocess step both carry Cancellable. An end step has no
Cancellable section. An instance resting on a terminal step has already left
the running state the field governs. So the setting has nothing left to
apply to.

This replaces the runtime-order register of collapsible sections. An author
reads every setting of one step without opening anything.

#### Scenario: A task step carries the task sections

- **WHEN** the step page holds a task step that is not an end
- **THEN** the page carries Path to, Assignment, Cancellable, On entry, On
  exit, Time limit and Step form fields
- **AND** the page has no Which process it calls section

<!-- Why: the scenario header below has to match the base spec's heading in
     openspec/specs/studio-step-page/spec.md, byte for byte. -->
<!-- antislop: allow negation-habit -->
#### Scenario: An end step carries no outgoing path

- **WHEN** the step page holds an end step
- **THEN** the page carries How the case ends
- **AND** the page has no Path to section, no On exit section, no Time
  limit section and no Cancellable section

#### Scenario: Every section stands open

- **WHEN** an author opens any step on the step page
- **THEN** every section of that step is readable without a press

## ADDED Requirements

### Requirement: The Cancellable section sets a step's participant-cancel override

The Cancellable section SHALL let an author set that step's `cancellable`
field to one of three states. Those are unset (inherit the process's own
default), explicitly cancellable, or explicitly not cancellable. Setting it SHALL write
`Step.cancellable` in the draft; choosing the inherit state SHALL remove the
key from the step rather than writing a redundant explicit value equal to the
process's current default.

The section SHALL name the effective outcome in the inherit state: whether a
running instance would resolve as cancellable there. That way, an author
need not open the process-wide setting separately to know what "inherit"
currently means.

#### Scenario: Setting a step to explicitly not cancellable

- **WHEN** an author sets a task step's Cancellable section to "not
  cancellable"
- **THEN** the draft's step carries `cancellable: false`

#### Scenario: Returning a step to the inherited default

- **WHEN** an author returns a step's Cancellable section from an explicit
  state to "inherit"
- **THEN** the draft's step has no `cancellable` key

#### Scenario: The inherit state names the process's current default

- **WHEN** a step's Cancellable section stands in the inherit state and the
  process itself declares `cancellable: false`
- **THEN** the section names the effective outcome as not cancellable
