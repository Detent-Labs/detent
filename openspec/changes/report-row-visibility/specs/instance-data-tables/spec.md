<!-- antislop: allow-file passive-voice -->
<!-- Every scenario here uses the fixed SHALL/WHEN/THEN Gherkin grammar the rest of this repo's specs use; that grammar is structurally passive. -->

## MODIFIED Requirements

### Requirement: Report sharing narrows access, never widens it

Executing a report SHALL additionally need `can(actor, "read", processId,
db)` to answer true on the report's target process. An actor may pass the
report's owner, editor or viewer check. That actor might still hold no
`read` permission on the target process. Such an actor SHALL receive an
empty table rather than a refusal.

Passing both checks SHALL NOT return every instance of the process. A caller
without `ADMIN_ROLE` SHALL receive only the rows they may see, by the
`instance-visibility-set` capability's rule. A row outside that set SHALL be
absent. There SHALL be no error, no marker and no count of what was withheld.
That is the rule the empty table above already follows.

An `ADMIN_ROLE` caller SHALL receive every matching row. That role reads any
instance directly and lists every one under `scope=all`, so a report of theirs
narrows nothing.

The bound SHALL apply after that narrowing, and the truncation flag SHALL
report the narrowed set. A viewer SHALL NOT receive a short table reported as
complete.

The report itself does not name every field a source instance might expose.
An empty result reveals nothing about instances that exist. Sharing a
report with an actor SHALL therefore never grant that actor visibility into
data they could not otherwise read.

#### Scenario: A viewer without process read access gets an empty table

- **WHEN** an actor listed in a report's `viewers` list holds no `read`
  permission on the report's target process
- **THEN** executing the report returns an empty table, not a refusal and
  not an error

#### Scenario: A viewer with process read access gets the full table

- **WHEN** an actor listed in a report's `viewers` list also holds `read` on
  the report's target process
- **AND** that actor may see every matching instance
- **THEN** executing the report returns the matching rows

#### Scenario: A viewer sees only the rows they may see

- **WHEN** an actor passes both the membership check and the `read` check
- **AND** some matching instances lie outside that actor's visible set
- **THEN** the returned table holds the rows inside it and no others
- **AND** the response names no error and no withheld count

#### Scenario: A revoked viewer loses one row and keeps the rest

- **WHEN** an administrator has revoked a viewer from one matching instance
- **AND** that viewer holds no claim and no candidacy on its current step
- **THEN** that instance's row is absent and every other row stands

#### Scenario: An operator's report stays unnarrowed

- **WHEN** an actor holding `ADMIN_ROLE` executes the report
- **THEN** every matching row is returned

#### Scenario: Truncation reports the narrowed set

- **WHEN** 60 instances match the query and the viewer may see 51 of them
- **THEN** the table holds 50 rows and reports truncation
- **AND** with 50 visible among the same 60 it holds 50 rows and reports none

#### Scenario: The CSV export narrows the same way

- **WHEN** a viewer downloads the same report as CSV
- **THEN** the file holds exactly the rows the table holds

### Requirement: Previewing an unsaved draft requires the same process read permission

An unsaved draft configuration is a query and column list an actor composes
before saving it as a report. Resolving column choices or previewing a
table for that draft SHALL need the same `read` permission check. Executing
a saved report needs that same check: `can(actor, "read", processId, db)`
on the named process. An actor lacking that permission SHALL receive an
empty table, or an empty column-choice result, from the preview. This
matches what executing a saved report over the same process would return.
The preview SHALL never return the process's real field values or instance
data.

The preview SHALL narrow per row exactly as a saved execution does. An author
composing a draft SHALL see the rows they may see and no others. A preview
that showed more would let an author read through the builder what the saved
report withholds.

#### Scenario: A preview for a process the actor cannot read shows no data

- **WHEN** an actor holding no `read` permission on a process previews an
  unsaved draft configuration naming that process
- **THEN** the preview returns an empty result, not the process's actual
  field values or instance data

#### Scenario: A preview and a saved execution of the same query agree

- **WHEN** an actor without `read` permission on a process previews an
  unsaved draft
- **AND** that actor then saves it as a report and executes it
- **THEN** both the preview and the saved execution return the same empty
  result for that actor

#### Scenario: A preview narrows per row like a saved execution

- **WHEN** an actor with `read` permission previews a draft over a process
  holding instances outside that actor's visible set
- **THEN** the preview returns only the rows inside it
