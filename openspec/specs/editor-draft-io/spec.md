# editor-draft-io

## Purpose

Defines file-based Draft load/save and validated authored-JSON export —
no server, database, or HTTP API involved; publish stays engine-side.

## Requirements

### Requirement: Draft can be saved to and loaded from a file
The editor SHALL support saving the current Draft to a file and loading a
previously saved Draft file back into the editor, with no server, database,
or HTTP API involved.

#### Scenario: Save then load round-trips the Draft
- **WHEN** an author saves the current Draft to a file and then loads that
  same file into a fresh editor session
- **THEN** the loaded Draft is structurally equivalent to the Draft that
  was saved, including all entity ids

#### Scenario: Loading an invalid Draft file is rejected with a clear error
- **WHEN** an author attempts to load a file that fails the load-safety
  structural check (not valid JSON, or not shaped like a process body at
  all)
- **THEN** the editor reports a load error and does not silently accept a
  malformed Draft

### Requirement: Export produces a validated authored ProcessBody
Exporting SHALL only be available for a Draft that passes full validation
(the requirements in editor-live-validation), and SHALL produce JSON that
parses successfully against the contract's `authoredProcessBody` schema.
Export SHALL NOT call `publishBody` or otherwise contact a running engine.

#### Scenario: Export is blocked while validation issues remain
- **WHEN** the current Draft has one or more outstanding validation issues
  (excluding "not checked" externally-scoped ones)
- **THEN** the export action is unavailable or refuses to produce output

#### Scenario: Export output is valid AuthoredProcessBody JSON
- **WHEN** an author exports a Draft that passes validation
- **THEN** the exported JSON parses successfully against
  `authoredProcessBody` from the engine package's `./schema` export

#### Scenario: Export does not publish
- **WHEN** an author exports a Draft
- **THEN** no network call or engine `publishBody` invocation occurs as
  part of the export action
