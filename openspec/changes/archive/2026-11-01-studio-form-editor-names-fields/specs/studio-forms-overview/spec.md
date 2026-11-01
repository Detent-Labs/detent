## MODIFIED Requirements

### Requirement: A card opens the form editor for its step

A card SHALL carry one control that opens the form editor for that step. The
control SHALL name whether it starts a form or opens an existing one. Its
accessible name SHALL lead with those visible words. It SHALL then state the
step's label, as the card's head prints it. Controls on two cards with
different step labels SHALL carry different names. Pressing the control
SHALL open the form editor at `edit/form/:stepId`.

The control SHALL stand at least 24px tall, the minimum target size of WCAG
2.5.8.

On an empty form's card the control SHALL stand alone in the foot, at the
row's trailing edge.

The form editor a card opens SHALL stand under the tab row with the Forms tab
current. Its breadcrumb SHALL lead with "Forms" (`studio-form-editor`).
Leaving the form editor SHALL return to the Forms tab where the author
started.

#### Scenario: An empty form offers to start one

- **WHEN** a step's view has no field entry
- **THEN** its card's control names starting the form

#### Scenario: Each control names its step

- **WHEN** a draft holds two steps with a form, labelled Intake and Review
- **THEN** the control on Intake's card carries an accessible name that
  leads with its visible words and names Intake
- **AND** the two controls' accessible names differ

#### Scenario: The open control meets the minimum target size

- **WHEN** an author measures any card's open control
- **THEN** it stands at least 24px tall

#### Scenario: The empty card's control keeps its edge

- **WHEN** a step's view has no field entry
- **THEN** its card's foot holds the control alone, at the row's trailing
  edge

#### Scenario: Leaving the form editor returns to Forms

- **WHEN** an author opens the form editor from a card and then leaves it
- **THEN** the Forms tab is the open one

#### Scenario: The editor keeps the Forms tab current

- **WHEN** an author opens the form editor from the Intake card
- **THEN** the tab row stands above the editor with the Forms tab current
- **AND** the breadcrumb's first crumb reads "Forms"
