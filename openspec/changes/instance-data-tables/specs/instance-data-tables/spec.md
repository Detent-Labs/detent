## Purpose

Saved, shareable reports that read one process's instances as a table of
field-value columns, reusing the existing instance-query filtering and the
existing process-scoped `read` permission rather than introducing a second
query engine or a second access-control model.

## ADDED Requirements

### Requirement: A report is a stored object naming a query and a column list

A report SHALL be stored with an `owner`, a target `processId`, a query
configuration (the same filter axes `queryInstances` accepts: `status`, a
date range, and a list of field comparisons), and an ordered list of
columns. A column SHALL be either a direct reference to one field id, or a
`merge` column naming an ordered list of source field ids. A report SHALL
also carry a name and two principal lists, `viewers` and `editors`, each a
list of actor ids and role or group names.

#### Scenario: A report is created with its query and columns

- **WHEN** a report is saved naming a process, a set of filters, and a list
  of direct and merge columns
- **THEN** the stored report carries all of them, and re-reading it returns
  the same configuration

#### Scenario: A personal report has empty principal lists

- **WHEN** a report is created with no viewers and no editors specified
- **THEN** it is stored with both lists empty, and only its owner may read or
  edit it

### Requirement: The owner cannot be removed from editors

A report's `editors` list SHALL always include its `owner`. An update that
removes the owner from `editors`, or that changes the report's `owner` to an
actor not already in `editors`, SHALL be rejected.

#### Scenario: Removing the owner from editors is rejected

- **WHEN** an update to a report's `editors` list omits the current owner
- **THEN** the update is rejected and the stored `editors` list is unchanged

#### Scenario: Reassigning the owner to a non-editor is rejected

- **WHEN** an update changes a report's `owner` to an actor not already
  listed in its `editors`
- **THEN** the update is rejected and the stored `owner` and `editors` are
  unchanged

### Requirement: Report access is owner, editor or viewer, checked by membership

An actor SHALL edit or delete a report only if they are its `owner` or listed
in its `editors`, by id, by a role they hold, or by a group they belong to —
the same eligibility test `isEligibleCandidate` already applies to
assignment candidates, with a listed group first resolved to its current
member ids, since `isEligibleCandidate` itself matches only an id or a
role and has no notion of a group. An actor SHALL execute (read the table
of) a report only if they are its `owner`, or listed in `editors`, or
listed in `viewers`, by the same test. An actor satisfying none of the
three SHALL be refused.

#### Scenario: An editor may update a report

- **WHEN** an actor listed in a report's `editors` list submits a change to
  its columns
- **THEN** the update succeeds

#### Scenario: A viewer may execute but not edit

- **WHEN** an actor listed only in a report's `viewers` list requests its
  table
- **THEN** the table is returned
- **AND** an update request from that actor is refused

#### Scenario: An unrelated actor is refused

- **WHEN** an actor listed in none of a report's owner, `editors` or
  `viewers` requests its table
- **THEN** the request is refused

#### Scenario: Role membership grants access the same as an id

- **WHEN** a report's `viewers` list names a role, and an actor holding that
  role who is not individually named requests its table
- **THEN** the table is returned

#### Scenario: Group membership grants access the same as an id

- **WHEN** a report's `viewers` list names a group, and an actor who
  belongs to that group but is not individually named and holds none of
  its own roles in the list requests its table
- **THEN** the table is returned

#### Scenario: Leaving a group revokes access with no report edit

- **WHEN** an actor who belonged to a group named in a report's `viewers`
  list is removed from that group's membership, and then requests the
  report's table
- **THEN** the request is refused, with no change made to the report itself

### Requirement: A report shared through a group is discoverable by its members

Listing the reports an actor may access SHALL include a report that names a
group the actor belongs to in its `viewers` or `editors` list, even when
that actor is named nowhere else on the report. This mirrors the same
group-membership grant "Group membership grants access the same as an id"
already gives execution and edit access, applied to discovery: an actor
able to execute a report by id SHALL also find it in their list.

#### Scenario: A report shared only through a group appears in the actor's list

- **WHEN** an actor belongs to a group named in a report's `viewers` or
  `editors` list, and is named nowhere else on the report
- **THEN** listing that actor's accessible reports includes it

### Requirement: Report sharing narrows access, never widens it

Executing a report SHALL additionally require that the requesting actor holds
the `read` permission (as defined by the `authorization` capability) on the
report's target process. An actor who passes the report's own
owner/editor/viewer check but holds no `read` permission on the target
process SHALL receive an empty table rather than a refusal, since the report
itself does not name every field a source instance might expose and an empty
result reveals nothing about instances that exist. Sharing a report with an
actor SHALL therefore never grant that actor visibility into data they could
not otherwise read.

#### Scenario: A viewer without process read access gets an empty table

- **WHEN** an actor listed in a report's `viewers` list holds no `read`
  permission on the report's target process
- **THEN** executing the report returns an empty table, not a refusal and not
  an error

#### Scenario: A viewer with process read access gets the full table

- **WHEN** an actor listed in a report's `viewers` list also holds `read` on
  the report's target process
- **THEN** executing the report returns the matching rows

### Requirement: Sharing with an actor lacking process access is not blocked

Saving a report's `viewers` or `editors` list SHALL NOT be rejected because a
named actor, role or group lacks the `read` permission on the target
process. Whether that omission is surfaced to the report's author as a hint
is a presentation concern outside this capability.

#### Scenario: Sharing to an ineligible viewer still saves

- **WHEN** a report's `viewers` list is updated to include an actor with no
  `read` permission on the target process
- **THEN** the update succeeds

### Requirement: Previewing an unsaved draft requires the same process read permission

Resolving column choices or previewing a table for an unsaved draft
configuration — a query and column list an actor is composing before
saving it as a report — SHALL require the same `read` permission check
executing a saved report requires: `can(actor, "read", processId, db)` on
the named process. An actor lacking that permission SHALL receive an empty
table (or an empty column-choice result) from the preview, exactly as
executing a saved report over the same process would, never the process's
real field values or instance data.

#### Scenario: A preview for a process the actor cannot read shows no data

- **WHEN** an actor holding no `read` permission on a process previews an
  unsaved draft configuration naming that process
- **THEN** the preview returns an empty result, not the process's actual
  field values or instance data

#### Scenario: A preview and a saved execution of the same query agree

- **WHEN** an actor without `read` permission on a process previews an
  unsaved draft, then saves it as a report and executes it
- **THEN** both the preview and the saved execution return the same empty
  result for that actor

### Requirement: Column choices come from the union of field catalogs in range

Resolving which fields are available as columns for a report SHALL consider
the field catalog of every published version of the target process that has
at least one instance in the report's query range, and SHALL return the
union of those catalogs. Each field in that union SHALL be marked with which
of those versions declare it, so an author can tell a field present in every
version from one only an older version carried.

#### Scenario: A field only an older version declares is offered

- **WHEN** a process has an older published version declaring field A and a
  newer version that dropped it, and instances of both versions fall in a
  report's query range
- **THEN** field A is offered as a column choice, marked as present only in
  the older version

### Requirement: A cell distinguishes no-value, not-yet-existing and redacted

Rendering one instance's value for a direct-field column SHALL distinguish
three distinct empty conditions and SHALL NOT collapse them into one blank
representation: the field exists in that instance's pinned version but holds
no value; the field does not exist in that instance's pinned version's
catalog at all; and the instance has been redacted. Each SHALL be
identifiable by the consumer of the report execution result.

Redaction is a property of the instance, not of one field: once an
instance's `redactedAt` is set, every direct-field column's cell for that
instance SHALL render as redacted, regardless of whether the field itself
was ever marked redactable. The redacted state SHALL take priority over the
no-value and not-applicable-to-this-version states for that instance.

#### Scenario: A field absent from an instance's version is marked absent

- **WHEN** a report column names a field that the instance's pinned version
  does not declare, on an instance that has not been redacted
- **THEN** that instance's cell for the column is marked as
  not-applicable-to-this-version, distinct from an empty value

#### Scenario: Every field on a redacted instance is marked redacted

- **WHEN** a report column names a field on an instance whose `redactedAt`
  is set, whether or not that field was ever marked redactable
- **THEN** that instance's cell for the column is marked redacted, distinct
  from an empty value and from a not-applicable field

#### Scenario: A field with no value is marked as such

- **WHEN** a report column names a field the instance's pinned version
  declares, and that instance never wrote a value for it and has not been
  redacted
- **THEN** that instance's cell is marked as holding no value, distinct from
  the other two empty conditions

### Requirement: A merge column takes the first non-empty source value and marks a collision

A `merge` column's value for one instance SHALL be the first non-empty value,
in the column's declared source-field order, among the fields that instance's
pinned version declares and has written. When more than one of that
instance's source fields holds a non-empty value, the cell SHALL contain the
concatenation of all of them rather than silently choosing one, and that row
SHALL be marked as a collision for that column. A merge column's value type
SHALL be text, and it SHALL sort as text regardless of the source fields'
own declared types.

A merge column's cell for an instance whose `redactedAt` is set SHALL render
as redacted rather than as an ordinary empty value, taking priority over its
usual first-non-empty-source and collision computation — the same priority
the direct-field rule above gives the redacted state, since a merge column's
source fields are wiped by the same unconditional clear.

#### Scenario: The first populated source field wins with no collision

- **WHEN** a merge column names two source fields in order, and only the
  second field holds a value on an instance
- **THEN** the cell shows that value, and the row is not marked as a
  collision for that column

#### Scenario: Two populated source fields concatenate and mark a collision

- **WHEN** a merge column names two source fields, and both hold a value on
  one instance
- **THEN** the cell contains both values concatenated, and that row is
  marked as a collision for that column

#### Scenario: A merge column execution reports its collision count

- **WHEN** a report containing a merge column is executed over a set of
  instances
- **THEN** the result states how many rows were marked as a collision for
  that column

#### Scenario: A merge column on a redacted instance renders redacted

- **WHEN** a merge column's source fields are evaluated for an instance
  whose `redactedAt` is set
- **THEN** the cell renders as redacted, not as an ordinary empty value, even
  though none of its source fields holds a post-redaction value

### Requirement: Report execution reuses the instance-query filter axes and its bounding

A report's query configuration SHALL accept exactly the filter axes the
`instance-data-query` capability's read accepts: target process, instance
status, a date range, and field comparisons. Executing a report SHALL apply
the same bounding behavior as that read: when more matching instances exist
than the execution can return, the result SHALL say so explicitly rather
than silently returning a partial table indistinguishable from a complete
one.

#### Scenario: An oversized result is marked truncated

- **WHEN** a report's query matches more instances than the execution's
  bound
- **THEN** the returned table is marked truncated, and does not silently
  appear complete

#### Scenario: A result within the bound is not marked truncated

- **WHEN** a report's query matches fewer instances than the execution's
  bound
- **THEN** the returned table is not marked truncated
