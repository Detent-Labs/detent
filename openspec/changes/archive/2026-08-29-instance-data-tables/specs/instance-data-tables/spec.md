## Purpose

A report is a saved, shareable definition that reads one process's instances
as a table of field-value columns. It reuses the existing instance-query
filtering and the existing process-scoped `read` permission. It does not
introduce a second query engine or a second access-control model.

## ADDED Requirements

### Requirement: A report is a stored object naming a query and a column list

The engine SHALL store a report with an `owner`, a target `processId`, and a
query configuration. The query configuration uses the same filter axes
`queryInstances` accepts. Those axes are `status`, a date range, and a list
of field comparisons. The engine SHALL also store an ordered list of columns
for the report. A column SHALL be either a direct reference to one field id,
or a `merge` column. A `merge` column SHALL name an ordered list of source
field ids.

A report SHALL also carry a name. A report SHALL also carry two principal
lists, `viewers` and `editors`. Each principal list SHALL be a list of actor
ids and role or group names.

#### Scenario: An author creates a report with its query and columns

- **WHEN** an author saves a report naming a process, a set of filters, and
  direct and merge columns
- **THEN** the stored report carries all of them, and re-reading it returns
  the same configuration

#### Scenario: A personal report has empty principal lists

- **WHEN** an author creates a report with no viewers and no editors
  specified
- **THEN** the engine stores it with both lists empty, and only its owner
  may read or update it

### Requirement: The owner stays in the editors list

A report's `editors` list SHALL always include its `owner`. The engine
SHALL reject an update that removes the owner from `editors`. The engine
SHALL also reject an update that sets the report's `owner` to an actor not
already in `editors`.

#### Scenario: The engine rejects removing the owner from editors

- **WHEN** an update to a report's `editors` list omits the current owner
- **THEN** the engine rejects the update, and the stored `editors` list
  stays unchanged

#### Scenario: The engine rejects reassigning the owner to a non-editor

- **WHEN** an update sets a report's `owner` to an actor not already listed
  in its `editors`
- **THEN** the engine rejects the update, and the stored `owner` and
  `editors` stay unchanged

### Requirement: Report access is owner, editor or viewer, checked by membership

An actor SHALL update or delete a report only if they are its `owner` or
listed in its `editors`. That listing may be by id, by a role they hold, or
by a group they belong to. This is the same eligibility test
`isEligibleCandidate` already applies to assignment candidates. That test
itself matches only an id or a role and has no notion of a group. The
report-access check therefore first resolves a listed group to its current
member ids before applying that test.

Executing a report means reading its table. An actor SHALL execute a report
only if they are its `owner`, or listed in `editors` or `viewers`. This uses
the same eligibility test as update and delete. The engine SHALL refuse an
actor satisfying none of the three.

#### Scenario: An editor may update a report

- **WHEN** an actor listed in a report's `editors` list submits an update to
  its columns
- **THEN** the update succeeds

#### Scenario: A viewer may execute but not update

- **WHEN** an actor listed only in a report's `viewers` list requests its
  table
- **THEN** the engine returns the table
- **AND** the engine refuses an update request from that actor

#### Scenario: The engine refuses an unrelated actor

- **WHEN** an actor listed in none of a report's owner, `editors` or
  `viewers` requests its table
- **THEN** the engine refuses the request

#### Scenario: Role membership grants access the same as an id

- **WHEN** a report's `viewers` list names a role
- **AND** an actor holding that role, and not individually named, requests
  its table
- **THEN** the engine returns the table

#### Scenario: Group membership grants access the same as an id

- **WHEN** a report's `viewers` list names a group
- **AND** an actor belongs to that group, but is not individually named
- **AND** that actor holds none of their own roles in the list, and
  requests its table
- **THEN** the engine returns the table

#### Scenario: Leaving a group revokes access with no report update

- **WHEN** an actor belonged to a group named in a report's `viewers` list
- **AND** that actor's membership in the group ends
- **AND** the actor then requests the report's table
- **THEN** the engine refuses the request, and makes no update to the
  report itself

### Requirement: A report shared through a group is discoverable by its members

The list of reports an actor may access SHALL include a report naming a
group the actor belongs to. That group may appear in the report's `viewers`
list or its `editors` list. The report SHALL appear even when the report
names that actor nowhere else. This mirrors the group-membership grant
named "Group membership grants access the same as an id". That grant
already gives execution and update access. Applied to discovery, an actor
able to execute a report by id SHALL also find it in their list.

#### Scenario: A report shared only through a group appears in the actor's list

- **WHEN** an actor belongs to a group named in a report's `viewers` or
  `editors` list
- **AND** the report names that actor nowhere else
- **THEN** listing that actor's accessible reports includes it

### Requirement: Report sharing narrows access, never widens it

Executing a report SHALL additionally need `can(actor, "read", processId,
db)` to answer true on the report's target process. An actor may pass the
report's owner, editor or viewer check. That actor might still hold no
`read` permission on the target process. Such an actor SHALL receive an
empty table rather than a refusal.

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
- **THEN** executing the report returns the matching rows

### Requirement: Sharing with an actor lacking process access is not blocked

A named actor, role or group might lack the `read` permission on the target
process. The engine SHALL NOT reject saving a report's `viewers` or
`editors` list for that reason. Whether that omission reaches the report's
author as a hint is a presentation concern outside this capability.

#### Scenario: Sharing to an ineligible viewer still saves

- **WHEN** an author updates a report's `viewers` list to include an actor
  with no `read` permission on the target process
- **THEN** the update succeeds

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

### Requirement: Column choices come from the union of field catalogs in range

A report's available columns come from the field catalogs of the target
process's published versions. Resolving those columns SHALL consider only a
version with at least one instance in the report's query range. Resolving
those columns SHALL return the union of those catalogs. The engine SHALL
mark each field in that union with which of those versions declare it. An
author can then tell a field every version declares from a field only an
older version declares.

#### Scenario: The engine offers a field only an older version declares

- **WHEN** a process has an older published version declaring field A, and
  a newer version that dropped it
- **AND** instances of both versions fall in the report's query range
- **THEN** the engine offers field A as a column choice, marked as declared
  only in the older version

### Requirement: A cell distinguishes no-value, not-yet-existing and redacted

Rendering one instance's value for a direct-field column SHALL distinguish
three distinct empty conditions. It SHALL NOT collapse them into one blank
representation. In the first condition, the field exists in the instance's
pinned version but holds no value. In the second condition, the field does
not exist in the instance's pinned version's catalog at all. In the third
condition, redaction has set the instance's `redactedAt`. Each of the three
conditions SHALL be identifiable by the consumer of the report execution
result.

Redaction is a property of the instance, not of one field. Once redaction
sets an instance's `redactedAt`, every direct-field column's cell for that
instance SHALL render as redacted. This holds regardless of whether the
field itself was ever marked redactable. The redacted state SHALL take
priority over the no-value and not-applicable-to-this-version states for
that instance.

#### Scenario: The engine marks a field missing from the instance's version as absent

- **WHEN** a report column names a field that the instance's pinned version
  does not declare
- **AND** redaction has not set the instance's `redactedAt`
- **THEN** the engine marks that instance's cell for the column as
  not-applicable-to-this-version, distinct from an empty value

#### Scenario: The engine marks every field on a redacted instance as redacted

- **WHEN** redaction has set an instance's `redactedAt`
- **AND** a report column names a field on that instance, whether or not
  the field was ever marked redactable
- **THEN** the engine marks that instance's cell for the column redacted
- **AND** that mark is distinct from an empty value and from a
  not-applicable field

#### Scenario: The engine marks a field with no value as such

- **WHEN** a report column names a field the instance's pinned version
  declares
- **AND** that instance never wrote a value for it
- **AND** redaction has not set the instance's `redactedAt`
- **THEN** the engine marks that instance's cell as holding no value,
  distinct from the other two empty conditions

### Requirement: A merge column takes the first non-empty source value and marks a collision

A `merge` column's value for one instance SHALL be the first non-empty
value in the column's declared source-field order. That value comes only
from fields the instance's pinned version declares and has written. The
engine SHALL NOT silently choose one source field when more than one holds
a non-empty value. Instead the cell SHALL contain the concatenation of
every non-empty source field's value.

The engine SHALL also mark that row as a collision for that column. A merge
column's value type SHALL be text. It SHALL sort as text regardless of the
source fields' own declared types.

When no source field holds a non-empty value on an instance, the cell SHALL
be a no-value cell, not a value cell holding the empty string — the same
distinct empty state a direct field's cell carries, so a reader does not
mistake a merge column's absence of data for an actual empty value.

When redaction has set an instance's `redactedAt`, a merge column's cell
for that instance SHALL render as redacted. This is not an ordinary empty
value. Redaction takes priority over the column's usual
first-non-empty-source and collision computation. This is the same
priority the direct-field rule above gives the redacted state. The same
unconditional clear wipes a merge column's source fields too.

#### Scenario: The first populated source field wins with no collision

- **WHEN** a merge column names two source fields in order
- **AND** only the second field holds a value on an instance
- **THEN** the cell shows that value, and the engine does not mark the row
  as a collision for that column

#### Scenario: Two populated source fields concatenate and mark a collision

- **WHEN** a merge column names two source fields, and both hold a value on
  one instance
- **THEN** the cell contains both values concatenated, and the engine marks
  that row as a collision for that column

#### Scenario: A merge column execution reports its collision count

- **WHEN** an actor executes a report containing a merge column over a set
  of instances
- **THEN** the result states how many rows the engine marked as a collision
  for that column

#### Scenario: A merge column on a redacted instance renders redacted

- **WHEN** the engine evaluates a merge column's source fields for an
  instance
- **AND** redaction has set that instance's `redactedAt`
- **THEN** the cell renders as redacted, not as an ordinary empty value
- **AND** none of its source fields holds a post-redaction value

#### Scenario: No source field holds a value

- **WHEN** a merge column's source fields are, for one instance, each
  undeclared by that instance's version, never written, or empty
- **THEN** the cell is a no-value cell
- **AND** the engine does not mark that row as a collision for that column

### Requirement: Report execution reuses the instance-query filter axes and its bounding

A report's query configuration SHALL accept exactly the filter axes the
`instance-data-query` capability's read accepts. Those axes are target
process, instance status, a date range, and field comparisons. Executing a
report SHALL apply the same bounding behavior as that read. More matching
instances may exist than the execution can return. When that happens, the
result SHALL say so explicitly. The result SHALL NOT silently return a
partial table indistinguishable from a complete one.

#### Scenario: The engine marks an oversized result truncated

- **WHEN** a report's query matches more instances than the execution's
  bound
- **THEN** the engine marks the returned table truncated, and the table
  does not silently appear complete

#### Scenario: The engine does not mark a within-bound result truncated

- **WHEN** a report's query matches fewer instances than the execution's
  bound
- **THEN** the engine does not mark the returned table truncated
