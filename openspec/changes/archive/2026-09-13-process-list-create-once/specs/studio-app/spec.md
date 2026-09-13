## ADDED Requirements

### Requirement: A process row writes one draft per press

A press on a process row's "Create draft" SHALL write at most one draft. From
the press until the edit screen opens, that row's "Create draft" button SHALL
read disabled. A press on it during that wait SHALL send no request.

When the published-version read or the draft write fails, the screen SHALL
report the error. The button SHALL then read enabled again, and a later press
SHALL try once more.

The hold SHALL belong to one row. A write in flight for one process SHALL leave
every other row's "Create draft" button enabled.

While it reads disabled, the button SHALL keep its visible label and its
accessible name.

The in-flight rule SHALL live in a pure module with `bun:test` coverage. This
capability's requirement on the studio's testable logic states that pattern.

#### Scenario: A second press sends no second write

- **WHEN** an author presses "Create draft" twice on a published process's row
  before the edit screen opens
- **THEN** the browser issues one read of the published version and one
  `PUT /drafts/:processId` for that process
- **AND** the button reads disabled from the first press until the edit screen
  opens

#### Scenario: The editor's first save follows a double press without a conflict

- **WHEN** an author presses "Create draft" twice, then edits the opened draft
  and saves
- **THEN** the save succeeds, and the screen shows no conflict message

#### Scenario: A failed try enables the button again

- **WHEN** the published-version read or the draft write fails after a press
  on "Create draft"
- **THEN** the screen reports the error, and that row's button reads enabled
- **AND** a new press repeats the requests the first press sent

#### Scenario: Another row stays available

- **WHEN** a draft write for one process is in flight
- **THEN** every other row's "Create draft" button reads enabled

#### Scenario: A disabled button keeps its name

- **WHEN** a row's "Create draft" button reads disabled during its write
- **THEN** its visible label and its accessible name both read "Create draft"

#### Scenario: A test holds the in-flight rule without a DOM

- **WHEN** a test calls the in-flight rule twice for one process before the
  first write settles
- **THEN** the second call runs no write, and the test renders nothing
- **AND** once the first write rejects, a third call runs its write
