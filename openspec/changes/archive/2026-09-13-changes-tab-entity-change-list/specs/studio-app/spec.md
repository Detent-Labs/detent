## MODIFIED Requirements

### Requirement: The panels screen's Changes view shows what a publish would change

The Changes tab SHALL state the difference between the draft and the version the
draft sits on. It answers the question a publish raises.

The tab SHALL read the draft as the editor holds it, including changes the
author has not saved. The `process-version-inspection` capability's versions
screen reads the saved draft from the server instead.

Both screens SHALL use one difference computation. The tab SHALL pass the base
version as the before side and the draft as the after side. Every row then runs
from the published value toward the draft value, the direction a publish moves.

The tab SHALL list one row per changed entity. A row names its entity by label
and by key. A data source has no label, so its row names its key alone. A row
carries one stamp, reading added, changed or removed.

Rows SHALL stand under seven group headings, in this order: Process, Fields,
Data sources, Steps, Paths, Forms, Contract. A group holding no row SHALL NOT
appear.

A list SHALL pair its members by anchor. Steps, fields,
paths, timers, actions and data sources pair by `id`. Fields pair across the
whole catalog, so a field moved into another group stays one row. A form entry
pairs by its `ref`, a form tab by its `key`, and a field option by its `value`.
A note has no anchor, so notes pair by their position among the view's
notes.

Each group owns a fixed set of rows:

- Process holds one row for the process's own keys and its initial step.
- Fields holds one row per field. The group a field sits in is one of its
  properties.
- Data sources holds one row per data source.
- Steps holds one row per step. A step's assignment, timers and actions are its
  properties.
- Paths holds one row per path. The row names the step the path leaves.
- Forms holds one row per step whose view differs. Its entries, tabs, notes and
  columns are that row's properties.
- Contract holds one row for the input fields, output fields and outcomes.

A list whose members differ only in position SHALL add one order property to
the row owning that list. The property SHALL name that list, such as Step order
or Form order. It SHALL add no row for a moved member.

A step the draft adds SHALL also add a row under Paths for each of its paths. It
SHALL add a row under Forms for its view. A step the draft drops SHALL do the
same with removed rows.

Every row SHALL stand folded when the change list first appears. Leaving the tab
and returning to it SHALL keep each row's open state. A folded row SHALL name the
properties that differ, four at most, and then state how many more differ. An
open row SHALL show each property's value before and after.

A value SHALL read in words where the tab has a word for the property. A
localized text reads in the editor's content locale, falling back to the base
locale. A difference in any other locale reads as a property of
its own, named with that locale. A yes-or-no value reads as yes or no. A
reference to another entity reads as that entity's label. A CEL expression reads
as its source text.

A property the tab has no word for SHALL read under its JSON key, with its
values printed as JSON. No difference SHALL drop out of the list for want of a
word.

An open row SHALL offer a command opening the tab that owns its entity. The
Process row SHALL offer none: no single tab holds the process's own keys. Every
open row SHALL hold a Developer view, listing the row's JSON paths with their
values before and after. The tab SHALL offer one command that opens every row, and folds them
all again.

A row SHALL keep its open state across a later draft change that leaves its
entity in the list.

<!-- The compile pass's cancel sink is the engine's own term. -->
<!-- antislop: allow synonym-rotation -->
The tab SHALL strip the compiled content from the base version's body first. The
versions screen gives that body the same treatment. The compile pass injects a
cancel sink, and no author wrote it.

A process with no base version SHALL read as a first publish. The tab says so,
and it has no difference.

An empty difference SHALL read as such. The tab says the draft matches its base
version.

The Changes tab SHALL print its number of rows as its own count.

#### Scenario: A draft over a published version shows its difference

- **WHEN** the author opens the Changes tab on a draft of a published process
- **THEN** the tab states what the draft changes against its base version

<!-- The scenario name repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
#### Scenario: An unsaved edit reaches the view

- **WHEN** the author renames a step and opens the Changes tab without saving
- **THEN** the Steps group holds one changed row for that step
- **AND** opening the row shows the published label before and the unsaved
  label after

#### Scenario: One added field reads as one added row

- **WHEN** the author adds one field to a catalog of 51 fields
- **THEN** the Fields group holds one added row, naming the new field
- **AND** no row repeats any of the other 51 fields

#### Scenario: A field moved into another group stays one row

- **WHEN** the author moves a field out of one group and into another
- **THEN** the Fields group holds one changed row for that field
- **AND** its Group property reads the old group's label before and the new
  group's label after

#### Scenario: A reorder reads as one order property

- **WHEN** the author swaps two field entries on a step's form and changes
  nothing else
- **THEN** the Forms group holds one changed row for that step
- **AND** that row's only property is Form order

#### Scenario: An added step brings its paths and its form

- **WHEN** the author adds a step carrying two paths and a view
- **THEN** the Steps group holds one added row for the step
- **AND** the Paths group holds two added rows, and the Forms group holds one

#### Scenario: A folded row names four properties at most

- **WHEN** the author changes six entries on one step's form
- **THEN** that step's folded row under Forms names four of them
- **AND** it states that two more differ

#### Scenario: A label reads in the content locale

- **WHEN** the author sets the editor's content locale to German, and renames a
  field's German label
- **THEN** the field's open row shows the German label before and after

#### Scenario: A property with no word reads under its JSON key

- **WHEN** the draft adds a key to a step that the tab has no word for
- **THEN** the step's row lists that key as a property
- **AND** its value prints as JSON

#### Scenario: An open row opens the tab owning its entity

- **WHEN** the author opens a row under Paths and presses its open command
- **THEN** the Paths tab opens

#### Scenario: An open row stays open after a further change

- **WHEN** the author opens a field's row, then changes another field on the
  Fields tab
- **THEN** the first field's row still stands open on the Changes tab

#### Scenario: A publish moves the base and the view follows it

- **WHEN** the author publishes the draft from the header bar and returns to
  the Changes tab
- **THEN** the tab reads the newly published version, with no reload
- **AND** it reports that the draft matches that version

#### Scenario: A never-published process reads as a first publish

- **WHEN** the author opens the Changes tab on a process with no base version
- **THEN** the tab says the publish would be the first one, and it has no
  difference

#### Scenario: A draft matching its base reads as no difference

- **WHEN** the author opens the Changes tab on a draft nobody has changed
  since it seeded from its base version
- **THEN** the tab says the draft matches that version

#### Scenario: The count counts rows

- **WHEN** a draft renames one field and adds one path
- **THEN** the Changes tab's count reads 2
