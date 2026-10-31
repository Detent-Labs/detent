# Spec Delta

## ADDED Requirements

### Requirement: The publish dialog states the changes since the base version

The publish dialog SHALL carry a Changes row among its facts. For a draft on
a published version the row SHALL read how many changes the draft holds
since that version. The row SHALL offer a disclosure that opens the change
list inside the dialog. For a process with no published version the row SHALL say this
publish mints the first version. The dialog SHALL read the base body when it
opens, and the row SHALL say so while the read runs.

#### Scenario: The row counts the changes

- **WHEN** an author who renamed one field and added one path opens the
  publish dialog
- **THEN** the Changes row reads two changes since the base version
- **AND** opening its disclosure shows the change list with those two rows

#### Scenario: A first publish has no change list

- **WHEN** an author opens the publish dialog on a process with no
  published version
- **THEN** the Changes row says this publish mints the first version
- **AND** no disclosure stands in the row

#### Scenario: An unchanged draft says so

- **WHEN** an author opens the publish dialog on a draft that matches its
  base version
- **THEN** the Changes row says the draft has no changes since that
  version

#### Scenario: The row waits for the base body

- **WHEN** the publish dialog opens and the base body has not arrived yet
- **THEN** the Changes row says the dialog is reading the published version
- **AND** the confirming control stays available

#### Scenario: A failed read leaves the publish possible

- **WHEN** the base body's read fails
- **THEN** the Changes row states the failure in its own words
- **AND** the confirming and declining controls work as before

#### Scenario: The disclosure keeps the dialog's focus order

- **WHEN** a keyboard user opens the dialog
- **THEN** the declining control holds the initial focus
- **AND** the Changes disclosure is a tab stop between the facts and the
  controls
