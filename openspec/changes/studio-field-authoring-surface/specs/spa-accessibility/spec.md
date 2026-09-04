## ADDED Requirements

### Requirement: A reordering gesture inside a list answers the keyboard in that list

A package may offer a drag that moves an entry inside a list. That list SHALL
answer the same move from the keyboard. The move SHALL happen in the list
itself. A separate panel, a dialog or a JSON editor SHALL NOT be the
only keyboard route.

The canvas requirement above sends a keyboard user to the panel equivalent.
That answer works because the canvas draws a graph, and a panel states the
same graph in controls. A list has no such second statement of itself. The
list is already the panel, so a detour would lead back to the same list.

The moving entry SHALL keep keyboard focus across the move. A keyboard user
who moves an entry three positions SHALL do so with three keystrokes, not
three focus hunts.

Each move SHALL announce its result to a screen reader through a live
region. The announcement SHALL name the entry and its new place.

#### Scenario: A keyboard user moves an entry the drag also moves

- **WHEN** a keyboard user focuses an entry a pointer can drag and presses
  the documented move keystroke
- **THEN** the entry moves in the list, exactly as the drag moves it

#### Scenario: Focus follows the moved entry

- **WHEN** a keyboard user moves the focused entry one place
- **THEN** that same entry still holds keyboard focus in its new place

#### Scenario: The move announces itself

- **WHEN** a keyboard user moves an entry
- **THEN** a live region names the entry and where it landed

#### Scenario: No detour stands in for the in-list move

- **WHEN** a keyboard user needs to move an entry
- **THEN** the list answers the keystroke, and no dialog and no separate
  editor opens to take the move instead
