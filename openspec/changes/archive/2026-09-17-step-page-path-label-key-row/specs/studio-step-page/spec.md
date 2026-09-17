## ADDED Requirements

### Requirement: The Path to section stands each path's Label and Key side by side

Each path row in the Path to section SHALL stand its Label and Key fields
side by side. The row SHALL use two columns, the label in the wider one.

Under the step page's narrow-viewport breakpoint the row SHALL collapse to
one column, label over key. This is the same row pattern the step's own
Label and Key already use in the masthead.

The row's "to" field SHALL stand in its own full-width row below Label and
Key. It SHALL stand outside the Label/Key row.

#### Scenario: A path's Label and Key stand in one row

- **WHEN** an author opens the Path to section on a wide viewport
- **THEN** a path row's label and its key stand in one row
- **AND** the label's column is wider than the key's column

#### Scenario: A path row collapses under the narrow breakpoint

- **WHEN** an author opens the Path to section under the step page's
  narrow-viewport breakpoint
- **THEN** a path row stands the label over the key, each its own
  full-width row

#### Scenario: The "to" field stays on its own row

- **WHEN** an author opens the Path to section on a wide viewport
- **THEN** a path row's "to" field stands on its own row below the label
  and key row
