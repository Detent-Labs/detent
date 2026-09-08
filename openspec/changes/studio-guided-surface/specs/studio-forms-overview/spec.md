## Purpose

The Forms tab gathers every form a process asks a participant to fill in. One
card per step carries a miniature of that step's form. An author reads the
whole process's paperwork at a glance and opens any one of them.

## ADDED Requirements

### Requirement: The Forms tab carries one card per step that asks for something

The Forms tab SHALL carry one card for every step that declares a view. A step
declaring no view SHALL carry no card. The cards SHALL follow the same
reachability order the steps rail uses.

The tab SHALL lay the cards in a grid that reflows with the window width.

#### Scenario: A step without a view carries no card

- **WHEN** a draft holds three task steps and one of them declares no view
- **THEN** the Forms tab carries two cards

#### Scenario: The cards follow the steps order

- **WHEN** an author reads the Forms tab
- **THEN** the first card names the step the steps rail numbers one

### Requirement: A card names its step and counts its fields

A card SHALL carry a kicker naming the step's kind. Under the kicker it SHALL
carry the step's label. Under the label it SHALL carry the number of field
entries the view holds.

A view holding no entry SHALL read as an empty form. That card SHALL take the
advisory color the checks already use for an empty form.

#### Scenario: A card counts its field entries

- **WHEN** a step's view holds four field entries
- **THEN** its card reads four fields

#### Scenario: An empty form marks itself

- **WHEN** a step's view holds no entry
- **THEN** its card names the form as empty
- **AND** the card takes the advisory color

### Requirement: A card carries a miniature of its form

A card SHALL carry a miniature of the step's form. The miniature SHALL follow
the view's own order. Each entry SHALL contribute one label and one bar
standing for the control.

The bar SHALL take its height from the field's kind, so a long-text field
reads taller than a one-line field. A required entry SHALL carry a mark beside
its label. The miniature SHALL take no keyboard focus and no pointer
interaction.

#### Scenario: The miniature follows the view order

- **WHEN** a step's view holds an amount field before a purpose field
- **THEN** the miniature carries the amount label above the purpose label

#### Scenario: The miniature marks a required entry

- **WHEN** a view entry declares `required: true`
- **THEN** the miniature carries a mark beside that entry's label

#### Scenario: The miniature takes no focus

- **WHEN** an author walks the Forms tab with the Tab key
- **THEN** the focus never lands inside a miniature

### Requirement: A card opens the form editor for its step

A card SHALL carry one control that opens the form editor for that step. The
control SHALL name whether it starts a form or opens an existing one. Pressing
it SHALL open the form editor at `edit/form/:stepId`.

Leaving the form editor SHALL return to the Forms tab where the author started.

#### Scenario: An empty form offers to start one

- **WHEN** a step's view holds no entry
- **THEN** its card's control names starting the form

#### Scenario: Leaving the form editor returns to Forms

- **WHEN** an author opens the form editor from a card and then leaves it
- **THEN** the Forms tab is the open one

### Requirement: A card reports its step's form issues

A card SHALL carry the number of open issues that name its step's view. A card
whose step's view draws no issue SHALL carry no badge.

Pressing the badge SHALL open the Checks tab, narrowed to that step.

#### Scenario: A form issue reaches its card

- **WHEN** one view entry names a field the catalog no longer declares
- **THEN** that step's card carries a badge reading one

#### Scenario: The badge narrows the Checks tab to its own step

- **WHEN** an author presses a card's issue badge
- **THEN** the Checks tab opens
- **AND** it lists the open issues on that step alone

#### Scenario: A narrowed Checks tab reaches every check again

- **WHEN** an author reads a Checks tab narrowed to one step
- **THEN** the tab carries a control that shows every check again
