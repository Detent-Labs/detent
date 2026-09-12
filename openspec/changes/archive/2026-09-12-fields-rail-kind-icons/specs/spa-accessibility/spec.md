## MODIFIED Requirements

### Requirement: A reordering gesture inside a list answers the keyboard in that list

A package may offer a drag that moves an entry inside a list. That list SHALL
answer the same move from the keyboard. The move SHALL happen in the list
itself. A separate panel, a dialog or a JSON editor SHALL NOT be the
only keyboard route.

The canvas requirement above sends a keyboard user to the panel equivalent.
That answer works because the canvas draws a graph, and a panel states the
same graph in controls. A list has no such second statement of itself. The
list is already the panel, so a detour would lead back to the same list.

One kind of move takes a different route. A drag can move an entry into a
group or out of one. That move SHALL answer the keyboard in the editor beside
the list, which selecting the entry opens. That editor is no detour. Selection
opens it anyway, and it states the entry's own properties, its group among
them. A dialog and a JSON editor never qualify.

A move among siblings stays under the rule above.

The moving entry SHALL keep keyboard focus across the move. A keyboard user
who moves an entry three positions SHALL do so with three keystrokes and no
focus hunt. On the editor route, focus SHALL stay on the editor's move
control.

Each move SHALL announce its result to a screen reader through a live
region. The announcement SHALL name the entry and its new place.

#### Scenario: A keyboard user moves an entry the drag also moves

- **WHEN** a keyboard user focuses an entry a pointer can drag among its
  siblings
- **AND** the user presses the documented move keystroke
- **THEN** the entry moves in the list, exactly as the drag moves it

#### Scenario: Focus follows the moved entry

- **WHEN** a keyboard user moves the focused entry one place
- **THEN** that same entry still holds keyboard focus in its new place

#### Scenario: The move announces itself

- **WHEN** a keyboard user moves an entry
- **THEN** a live region names the entry and where it landed

#### Scenario: No detour stands in for the in-list move

- **WHEN** a keyboard user needs to move an entry to a new place among its
  siblings
- **THEN** the list answers the keystroke, and no dialog and no separate
  editor opens to take the move instead

#### Scenario: A change of group answers the keyboard in the entry's editor

- **WHEN** a keyboard user selects a field entry in the studio's Fields rail
  and tabs into the editor beside it
- **THEN** the editor's move control moves that field into a group or out of
  one
- **AND** a live region names the field and where it landed, and focus stays
  on that move control
