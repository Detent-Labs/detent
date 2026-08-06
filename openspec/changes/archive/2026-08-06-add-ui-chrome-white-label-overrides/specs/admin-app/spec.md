## ADDED Requirements

### Requirement: A UI-strings screen edits wording overrides

The admin area SHALL carry a `/ui-strings` screen. It SHALL let an
operator pick an area and a locale. The choice of area SHALL come from
among the areas that already carry a `t(locale, key)` catalog. For the
selected area and locale, the screen SHALL list every catalog key. Each
row SHALL show that key's builtin value and an editable override input.

The screen SHALL seed each override input from any override already
stored for that key. Saving SHALL write the input's value as the
override. Clearing an input SHALL delete the stored override for that
key.

This screen SHALL sit behind `system:admin`, the same role every other
admin screen already requires.

#### Scenario: The screen lists a catalog's keys

- **WHEN** an operator selects an area and a locale on the screen
- **THEN** the screen lists every key that area's builtin catalog declares
  for that locale

#### Scenario: An existing override pre-fills its input

- **WHEN** a key already carries a stored override
- **THEN** the screen shows that override's value in the key's input

#### Scenario: Saving an input stores the override

- **WHEN** an operator types a value into a key's input and saves
- **THEN** the system stores that value as the key's override

#### Scenario: Clearing an input removes the override

- **WHEN** an operator clears a key's input and saves
- **THEN** the system deletes that key's stored override

#### Scenario: An actor without `system:admin` sees the empty state

- **WHEN** an actor without `system:admin` opens the screen
- **THEN** the area shows its explanatory empty state
