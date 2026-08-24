## Purpose

Holds a groups store, parallel to `auth_users`. It holds named member lists
an operator administers, each scoped to every process or to a named list of
processes. It holds the deletion guard tying a group to the processes that
reference it. It also holds the `/admin/groups*` HTTP API an operator uses
to manage the store.

<!-- antislop: allow sentence-length passive-voice em-dash -->
<!-- Why: the disambiguation cites its source and quotes it inline in one sentence; "is unrelated" states the two concepts' relationship, with no actor to name; the em-dash sets off the inline citation the way this codebase's own decisions.md does. -->
This store is unrelated to a directory/JWT `groups` claim
(`docs/decisions.md` — "a principal, not a permission", `src/auth/jwt.ts::
claimToRoles`), which feeds `Actor.roles` for authorization. This store's
groups are pure assignment-candidate lists, read only by
`org.group-members`.

## ADDED Requirements

### Requirement: A group carries an id, a name, a scope and a member list

The engine SHALL persist a group as an opaque, type-prefixed `group_` id.
It SHALL also persist a display name, a scope, and a list of member ids.

A group's scope SHALL be one of two shapes. The first shape, `{ type:
"global" }`, means any process may reference the group. The second shape,
`{ type: "processes", processIds: string[] }`, means only the listed
processes may reference it.

<!-- antislop: allow passive-voice -->
<!-- Why: "the group is created" names the moment this editability rule takes hold, not an actor's action distinct from the requirement itself. -->
A `"processes"`-scoped group's `processIds` list SHALL be editable
independently of any single process. It is editable at any time after the
group is created, from the admin side. It is NOT fixed at group-creation
time.

A group's member list SHALL hold account ids. The store SHALL NOT need a
listed id to name an existing `auth_users` row. An operator may list a
member before that account exists, or after that account stops existing.
This mirrors how `auth_users.roles` accepts any string.
`group-based-assignment` states which of a group's listed members resolve
as candidates at runtime.

This store SHALL be independent of `auth_users.roles`. `roles` is an
unrelated free-text tag `authorization` reads for system and studio
permission grants. No assignment strategy reads `roles`, and no group
operation reads or writes it.

#### Scenario: A group's shape round-trips

<!-- antislop: allow passive-voice -->
<!-- Why: a WHEN/THEN scenario names the triggering event and the resulting state, not the caller performing it; every scenario in this file follows the same style. -->
- **WHEN** a group is created with a name, a scope and a member list
- **AND** that group is then read back
- **THEN** the name, the scope and the member list read back match what was
  written

<!-- antislop: allow passive-voice -->
<!-- Why: this scenario's title states what happens to the list, not who extends it; the title mirrors the requirement's own wording above. -->
#### Scenario: A processes-scoped group's list is extended later

<!-- antislop: allow passive-voice -->
<!-- Why: the WHEN bullet names the triggering event, mirroring every other scenario's style in this file. -->
- **WHEN** a `"processes"`-scoped group is created naming one process
- **AND** an operator later adds a second process id to that same group's
  `processIds`
<!-- antislop: allow passive-voice -->
<!-- Why: the wrapped `processIds` line above masks to blank and breaks the block above; this directive re-covers the THEN bullet, whose own style matches every other scenario in this file. -->
- **THEN** the group's scope now names both processes, and the group's
  `group_id` is unchanged

<!-- antislop: allow passive-voice -->
<!-- Why: this scenario's title states what happens to the id, not who accepts it. -->
#### Scenario: A member id naming no account is accepted

<!-- antislop: allow passive-voice -->
<!-- Why: the WHEN bullet names the triggering event, mirroring every other scenario's style in this file. -->
- **WHEN** a group's member list is set to include an account id that
  `auth_users` holds no row for
- **THEN** the write succeeds and the group's member list includes that id

### Requirement: Groups are listable by an operator over HTTP

`GET /admin/groups` SHALL return a page of groups, each carrying its
`groupId`, `name`, `scope` and member list. The route SHALL translate
`limit` and `cursor` query parameters the same way `GET /admin/users` does.
It SHALL cap `limit` at the same list bound and default it the same way.

#### Scenario: Listing groups

- **WHEN** an actor holding `system:admin` requests `GET /admin/groups`
- **THEN** the response is 200 with a page of groups, each carrying
  `groupId`, `name`, `scope` and its member list

#### Scenario: Paging

- **WHEN** an actor requests `GET /admin/groups?limit=2` and more than two
  groups exist
- **THEN** the response carries two groups and a cursor; the same request
  with that cursor carries the following groups

### Requirement: An operator can create a group over HTTP

`POST /admin/groups` SHALL create a group from a request body carrying
`name` and `scope`. `name` SHALL be non-empty after trimming, and SHALL be
at most 200 characters, the same bound `auth_users.display_name` and
`grants.ts`'s `role` string already carry. A created group's member list
SHALL start empty; `PATCH /admin/groups/:groupId/members` is the route that
populates it.

#### Scenario: Creating a group

- **WHEN** an actor holding `system:admin` requests `POST /admin/groups`
  with `{ "name": "Finance Approvers", "scope": { "type": "global" } }`
- **THEN** the response is 201, the created group's `name` is `"Finance
  Approvers"`, its `scope` is `{ "type": "global" }`, and its member list is
  empty

#### Scenario: The route refuses an empty name

<!-- antislop: allow passive-voice -->
<!-- Why: the THEN bullet states the resulting non-creation, mirroring every other scenario's style in this file. -->
- **WHEN** a `POST /admin/groups` request sends a `name` that is empty
  after trimming
- **THEN** the response is 400 and no group is created

#### Scenario: The route refuses a name past the length bound

<!-- antislop: allow passive-voice -->
<!-- Why: the THEN bullet states the resulting non-creation, mirroring the empty-name scenario immediately above. -->
- **WHEN** a `POST /admin/groups` request sends a `name` longer than 200
  characters
- **THEN** the response is 400 and no group is created

### Requirement: A group's name is renameable over HTTP

`PATCH /admin/groups/:groupId/name` SHALL set the named group's `name` to
the request body's non-empty (after trimming) `name`. The new `name` SHALL
be at most 200 characters, the same bound the create route enforces. It
SHALL return 200 with the updated group, or 404 when no such `groupId`
exists.

#### Scenario: Renaming a group

- **WHEN** an actor holding `system:admin` requests `PATCH
  /admin/groups/:groupId/name` for an existing group with `{ "name":
  "Regional Approvers" }`
- **THEN** the response is 200 and the group's `name` is `"Regional
  Approvers"`

#### Scenario: The route refuses a rename past the length bound

<!-- antislop: allow passive-voice -->
<!-- Why: the THEN bullet states the resulting non-change, mirroring the create route's own length-bound scenario above. -->
- **WHEN** a `PATCH /admin/groups/:groupId/name` request sends a `name`
  longer than 200 characters
- **THEN** the response is 400 and the group's stored `name` is unchanged

### Requirement: A group's member list is settable over HTTP

`PATCH /admin/groups/:groupId/members` SHALL replace the named group's
whole member list with the request body's `members` array. A member id the
request omits SHALL no longer be a member. It SHALL return 200 with the
updated group, or 404 when no such `groupId` exists.

#### Scenario: Setting members replaces the whole list

<!-- antislop: allow passive-voice -->
<!-- Why: the WHEN bullet names the triggering request, mirroring every other scenario's style in this file. -->
- **WHEN** a group holding members `["user_a", "user_b"]` is sent `{
  "members": ["user_a", "user_c"] }`
- **THEN** the response is 200 and the group's member list is exactly
  `["user_a", "user_c"]`

### Requirement: A group's scope is settable over HTTP

`PATCH /admin/groups/:groupId/scope` SHALL replace the named group's
`scope` with the request body's `scope`, validated against the same two
shapes the create route accepts. It SHALL return 200 with the updated
group, or 404 when no such `groupId` exists. It SHALL return 400 for a
`scope` matching neither shape.

<!-- antislop: allow passive-voice -->
<!-- Why: "the body being published" names the generic subject of the publish-time check this paragraph cross-references, not a specific actor. -->
Narrowing a `"processes"`-scoped group's `processIds` SHALL succeed at
once, with no reference check against any published process. Switching a
group from `"global"` to `"processes"` SHALL succeed the same way. This
holds even when a published process's `allowedGroups` already references
the group and would no longer satisfy the narrowed scope.
`group-scope-validation`'s database-backed scope check runs at PUBLISH
time, over the body being published. It does not re-validate an
already-published body when a group's scope changes under it.

#### Scenario: Narrowing scope after publish succeeds

<!-- antislop: allow passive-voice -->
<!-- Why: the WHEN/THEN bullets name the pre-existing reference and the resulting state, mirroring every other scenario's style in this file. -->
- **WHEN** a `"global"`-scoped group is referenced by a published process's
  `allowedGroups`
<!-- antislop: allow passive-voice -->
<!-- Why: the wrapped `allowedGroups` line above masks to blank and breaks the block above; this directive re-covers the AND/THEN bullets, whose style matches every other scenario in this file. -->
- **AND** an operator narrows that group's scope to `"processes"` naming a
  different process
- **THEN** the scope update succeeds, and the already-published process is
  unaffected

<!-- antislop: allow passive-voice -->
<!-- Why: this requirement's title states the guarded outcome, not who would delete the group; it mirrors this file's other requirement titles. -->
### Requirement: A group cannot be deleted while a published process still references it

`DELETE /admin/groups/:groupId` SHALL refuse when any PUBLISHED process's
`allowedGroups` still names that `groupId`. This mirrors the rule that
already protects a published version an instance references. It also
mirrors the rule that already protects a data list a published body
references.

A refused delete SHALL name every process that blocks it. The route SHALL
delete nothing when the guard refuses. The refusal body's `error.type` SHALL
be the generic `"conflict"` type several unrelated 409s already use. The
body SHALL additionally carry the blocking process ids as a `processIds`
array, a field none of those other `"conflict"` bodies carry.

#### Scenario: A referenced group survives a delete

- **WHEN** an operator deletes a group a published process's
  `allowedGroups` still names
- **THEN** the route refuses, names that process, and the group survives

#### Scenario: An unreferenced group goes away

- **WHEN** an operator deletes a group no published process's
  `allowedGroups` names
- **THEN** the route deletes the group

#### Scenario: Deleting an unknown group

- **WHEN** `DELETE /admin/groups/:groupId` names a `groupId` no group holds
- **THEN** the response is 404

### Requirement: The operator role gates every group route

`system:admin` SHALL gate all six group routes, through the same
`requireRole` check every other `/admin/*` route uses, before any read or
write runs.

<!-- antislop: allow passive-voice -->
<!-- Why: this scenario's title states the outcome for the unauthorized actor, matching this file's other scenario titles. -->
#### Scenario: An actor without the role is refused

- **WHEN** an actor whose resolvable credential's `roles` omits
  `system:admin` calls any of the six group routes
- **THEN** the response is 403 and the route neither reads nor writes a
  group
