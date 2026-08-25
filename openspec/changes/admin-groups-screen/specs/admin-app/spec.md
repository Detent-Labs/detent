## ADDED Requirements

### Requirement: A Groups screen lists, filters, creates, edits and deletes groups

The `/groups` screen SHALL list groups through `GET /admin/groups`. Each row
SHALL show the group's name, its scope, and its member count. A global
group's scope SHALL read as "Global." A processes-scoped group's scope SHALL
read as the count of processes it names, for example "3 processes."

`GET /admin/groups` paginates the same way `GET /admin/users` does. The
screen SHALL walk its cursor to completion before it filters or renders.
This mirrors the Users screen's own `load()`, which loops on the returned
cursor until the cursor runs out. It SHALL show every group the walk
collects.

The screen SHALL offer a process-filter picker above the list. That picker
is a plain `<select>` populated from the existing `GET /processes` route,
following the Migrations screen's picker exactly. Selecting a process SHALL
narrow the visible rows to global groups plus groups whose scope names that
process. Clearing the filter SHALL restore every group.

The screen SHALL offer group creation through `POST /admin/groups`, taking a
name and an initial scope. A save control and a cancel control SHALL sit
beside the form. The process filter may be active at the moment creation
opens. When it is, the form SHALL pre-fill the new group's scope to that
one process, not global. The operator SHALL still be free to edit the
scope before saving.

The screen SHALL offer rename per row through
`PATCH /admin/groups/:groupId/name`. This mirrors the Users screen's inline
roles editor. A per-row control replaces the name cell with a text input,
holding the group's current name. A save control and a cancel control
SHALL sit beside it. Cancelling SHALL leave the stored name untouched.

The screen SHALL offer scope editing per row through
`PATCH /admin/groups/:groupId/scope`. The editor SHALL offer a Global/Processes
switch. Choosing Processes SHALL reveal a picker offering every process,
letting the operator name one or more. An empty processes list is not a
meaningful scope, so the screen SHALL refuse a save that names none,
client-side. Cancelling SHALL leave the stored scope untouched.

The screen SHALL offer member editing per row through
`PATCH /admin/groups/:groupId/members`. This mirrors the Users screen's roles
editor's own shape. A per-row control replaces the member-count cell with a
text input, holding the group's current members as comma-separated emails.
Elsewhere, `group-based-assignment` names a member id matching no account
as a first-class, persistent state.

A stored member id no loaded account matches SHALL show as that id
itself. This keeps a dangling member visible instead of dropping it from
the text. A save control and a cancel control SHALL sit beside it.

The account directory `GET /admin/users` already walks in full, the same
way the Users screen's own manager control resolves an account. The screen
SHALL resolve each typed entry against that directory by email. It SHALL
refuse an entry matching no loaded email, client-side, before any request
fires. One entry escapes that refusal. An entry that exactly matches an id
already in the row's own pre-edit member list SHALL pass through
unchanged. That pass-through carries a dangling member forward across an
edit that does not touch it.

It SHALL report a refusal inline in the editor. Saving SHALL send the
whole resolved member set, so a member the input omits is a member
removed. Cancelling SHALL leave the stored members untouched.

The screen SHALL offer deletion per row through `DELETE /admin/groups/:groupId`,
behind a confirmation naming the group. A 409 from that route means the
deletion guard fired: a published process still references the group. The
screen SHALL show that refusal as its own message.

When the 409 body carries structured blocking process ids, that message
SHALL name every blocking process by its label. It SHALL resolve each
label against the already-loaded process list.

The 409 body may instead carry only a count or a free-text message, with
no structured ids. When it does, that message SHALL be a fixed message
stating that a published process still blocks the deletion. It SHALL NOT
name individual processes by label. It SHALL NOT derive a count or any
other detail from the response body's own message text. That text carries
no safety guarantee. The rows SHALL stay unchanged after a refused
deletion.

The screen SHALL follow the same refresh convention as every other
Operations screen. That convention is an explicit refresh control and a
refetch on window focus. A reload SHALL leave an open editor's pending
text untouched. It SHALL also leave an open creation form untouched, the
same guarantee the Users screen makes.

#### Scenario: Listing groups

- **WHEN** the operator opens the Groups screen
- **THEN** the screen shows every group, each with its name, its scope, and
  its member count

#### Scenario: Reaching a group past one page

- **WHEN** more groups exist than one `GET /admin/groups` page holds
- **THEN** the screen walks the returned cursor to completion before it
  renders
- **AND** the list shows every group across every page

#### Scenario: Filtering by process narrows the list

- **WHEN** the operator picks a process in the filter
- **THEN** the list shows only global groups and groups scoped to that
  process

#### Scenario: Clearing the filter restores the full list

- **WHEN** the operator clears the process filter
- **THEN** the list shows every group again

#### Scenario: Creating a group with no filter active

- **WHEN** the operator opens the creation form with no process filter set,
  types a name, and saves
- **THEN** the screen calls `POST /admin/groups` with a global scope, and
  the new group appears among the rows

#### Scenario: Creating a group while filtered pre-fills its scope

- **WHEN** the operator opens the creation form while the process filter
  names a process, and saves without changing the scope
- **THEN** the screen calls `POST /admin/groups` with the scope set to that
  one process

#### Scenario: Renaming a group

- **WHEN** the operator opens the rename editor on a row, changes the text,
  and saves
- **THEN** the screen calls `PATCH /admin/groups/:groupId/name`, and the row
  shows the new name after the refresh

#### Scenario: Cancelling a rename writes nothing

- **WHEN** the operator opens the rename editor, changes the text, and
  cancels
- **THEN** the screen sends no request, and the row shows the stored name

#### Scenario: Switching a group's scope to specific processes

- **WHEN** the operator opens the scope editor on a global group, switches
  to Processes, names one process, and saves
- **THEN** the screen calls `PATCH /admin/groups/:groupId/scope` with that
  process named, and the row shows the new scope after the refresh

#### Scenario: Switching a group's scope back to global

- **WHEN** the operator opens the scope editor on a processes-scoped group,
  switches to Global, and saves
- **THEN** the screen calls the route with a global scope, and the row shows
  "Global" after the refresh

#### Scenario: The scope editor refuses a save naming no process

- **WHEN** the operator selects Processes in the scope editor, names no
  process, and tries to save
- **THEN** the screen sends no request and states why it refuses the save

#### Scenario: Editing group membership

- **WHEN** the operator opens the member editor on a row, types a
  comma-separated list of known emails, and saves
- **THEN** the screen calls `PATCH /admin/groups/:groupId/members` with the
  resolved `user_id` values, and the row's member count reflects the new
  set after the refresh

#### Scenario: The member editor refuses an unknown email

- **WHEN** the operator types an email the account directory does not hold,
  and tries to save the member editor
- **THEN** the screen sends no request and names the unresolved email inline

#### Scenario: Cancelling a member edit writes nothing

- **WHEN** the operator opens the member editor, types, and cancels
- **THEN** the screen sends no request, and the row shows the stored member
  count

#### Scenario: The member editor seeds a dangling member's raw id

- **WHEN** the operator opens the member editor on a row
- **AND** that row's stored member list holds an account id no loaded
  account matches
- **THEN** the editor's initial text shows that id itself, comma-separated
  alongside any resolved emails

#### Scenario: Saving preserves a dangling member untouched

- **WHEN** the operator opens the member editor on a row holding a
  dangling member id
- **AND** edits the text without removing that id's token
- **AND** saves
- **THEN** the screen calls `PATCH /admin/groups/:groupId/members` with that
  dangling id carried forward unchanged among the resolved member ids

#### Scenario: Deleting an unreferenced group

- **WHEN** the operator confirms deleting a group no published process
  references
- **THEN** the screen calls `DELETE /admin/groups/:groupId`, and the row is gone
  after the refresh

#### Scenario: The deletion guard blocks and names the blocking processes

- **WHEN** the operator confirms deleting a group a published process still
  references
- **AND** the route answers 409 with structured blocking process ids
- **THEN** the screen names every blocking process by label
- **AND** the row stays in the list

#### Scenario: The deletion guard blocks with no structured process ids

- **WHEN** the operator confirms deleting a group a published process still
  references
- **AND** the route answers 409 with only a count or free-text message,
  carrying no structured process ids
- **THEN** the screen shows a fixed message with no count and no process
  names
- **AND** the row stays in the list

#### Scenario: A reload leaves an open editor alone

- **WHEN** the operator opens any inline editor on this screen, types, and
  the window regains focus so the screen refetches
- **THEN** the editor stays open and holds the typed text
