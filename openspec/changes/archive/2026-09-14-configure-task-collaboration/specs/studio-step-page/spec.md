## MODIFIED Requirements

### Requirement: The step page stands its sections open in two columns

The step page SHALL lay its sections in two columns. No section SHALL
collapse. The leading column SHALL carry Path to, Assignment, Which
process it calls, and How the case ends. The trailing column SHALL carry
On entry, On exit, Time limit, Step form fields, and Collaboration.

A section SHALL stand only where the step's kind declares it. A task step
carries Assignment. A subprocess step carries Which process it calls. An
end step carries How the case ends. It has no outgoing path, so it
carries neither On exit nor Time limit. A subprocess step has no
Collaboration section, being an automatic wait-state with no
participant-facing task screen.

This replaces the runtime-order register of collapsible sections. An
author reads every setting of one step without opening anything.

#### Scenario: A task step carries the task sections

- **WHEN** the step page holds a task step that is not an end
- **THEN** the page carries Path to, Assignment, On entry, On exit, Time
  limit, Step form fields and Collaboration
- **AND** the page has no Which process it calls section

<!-- antislop: allow negation-habit --> <!-- Scenario title must match the base spec verbatim for OpenSpec's archive matching; rewording "carries no" to "has no" breaks that match. -->
#### Scenario: An end step carries no outgoing path

- **WHEN** the step page holds an end step
- **THEN** the page carries How the case ends
- **AND** the page has no Path to section and no On exit section
- **AND** the page has no Time limit section

#### Scenario: Every section stands open

- **WHEN** an author opens any step on the step page
- **THEN** every section of that step is readable without a press

#### Scenario: A subprocess step has no Collaboration section

- **WHEN** the step page holds a subprocess step
- **THEN** the page carries Which process it calls
- **AND** the page has no Collaboration section

## ADDED Requirements

### Requirement: The Collaboration section offers a three-state control per field

The Collaboration section SHALL carry a three-state control each for
Comment and Attachments, offering three states: Default, On, and Off.
Selecting Default SHALL clear the step's own override for
that key, so the step reads as `undefined` for it. It then inherits the
process default at once, including any later change to it. Selecting On
or Off SHALL set the step's own override to `true` or `false`. While
Default is the selected state, the control SHALL visibly name the
process-wide default's current resolved value for that key. That value
might show as "Currently: on".

#### Scenario: Selecting Default clears the step's own override

- **WHEN** an author selects Default on the Attachments control for a
  step that previously overrode `attachments: false`
- **THEN** the step's `collaboration.attachments` becomes `undefined`,
  and the control shows the process's current default value

#### Scenario: A step's override survives a later process-default change

- **WHEN** an author sets a step's Attachments control to On, overriding
  a process default of `false`
- **THEN** changing the process-wide default afterward SHALL NOT change
  that step's resolved `attachments`, which stays `true`
