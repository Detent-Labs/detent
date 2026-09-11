## MODIFIED Requirements

### Requirement: The Forms tab carries one card per step that asks for something

The Forms tab SHALL carry one card for every step that declares a view. A step
declaring no view SHALL have no card. The cards SHALL follow the same order the
steps rail uses, which is the draft's own order.

The tab SHALL lay the cards in a grid that reflows with the window width.

<!-- Why: the scenario name repeats the live spec's own, so the delta matches it. -->
<!-- antislop: allow negation-habit -->
#### Scenario: A step without a view carries no card

- **WHEN** a draft holds three task steps and one of them declares no view
- **THEN** the Forms tab carries two cards

#### Scenario: The cards follow the steps order

- **WHEN** an author reads the Forms tab
- **THEN** the first card names the step the steps rail numbers one
