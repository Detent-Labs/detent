## ADDED Requirements

### Requirement: Every area of the browser UI is overridable

The override mechanism SHALL cover each of the five areas the browser UI
ships: `shell`, `app`, `studio`, `admin` and `reporting`. Each SHALL resolve
an override ahead of its builtin catalog value, under its own area name.

The UI-strings screen's area picker SHALL offer all five. It SHALL offer them
in a fixed order that does not depend on object key order.

#### Scenario: An override applies to an admin screen

- **WHEN** an override row exists for area `admin`, a locale and a key that
  the admin catalog declares
- **THEN** the admin screen showing that key renders the override's value

#### Scenario: An override applies to a reporting view

- **WHEN** an override row exists for area `reporting`, a locale and a key
  that the reporting catalog declares
- **THEN** the reporting view showing that key renders the override's value

#### Scenario: The picker offers all five areas

- **WHEN** an operator opens the UI-strings screen
- **THEN** the area picker offers `shell`, `app`, `studio`, `admin` and
  `reporting`
