## ADDED Requirements

### Requirement: The report builder offers a CSV download once a process owner saves a report

The report builder screen SHALL offer a control to download the current
report's table as CSV. The control SHALL appear only once the process
owner has saved the report. A saved report carries a report id. An
unsaved draft carries none: it has no saved table to export, and cannot
reach the export route. Choosing the control SHALL save the downloaded
file with a `.csv` extension.

#### Scenario: The download control is hidden for an unsaved report

- **WHEN** a process owner is building a new report and has not yet saved
  it
- **THEN** the report builder shows no CSV download control

#### Scenario: The download control appears once a process owner saves a report

- **WHEN** a process owner saves a report, or reopens one they already
  saved
- **THEN** the report builder shows a control to download the report's
  table as CSV

#### Scenario: Choosing the control downloads a CSV file

- **WHEN** a process owner chooses the CSV download control on a saved
  report
- **THEN** the browser saves a file with a `.csv` extension containing the
  report's current table

### Requirement: The reporting area shows the CSV download control's wording from its catalog

The CSV download control's label SHALL come from the reporting area's own
catalog through `t(locale, key)`. It SHALL follow the same
English/German key-parity rule the area's existing controls already
follow.

#### Scenario: A locale switch shows the control's label in the newly chosen locale

- **WHEN** a process owner switches the account menu's language while the
  report builder is open
- **THEN** the CSV download control's label shows in the newly chosen
  locale
