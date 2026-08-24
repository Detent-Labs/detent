# group-scope-validation

## Purpose

Holds the database-backed publish-time check that every group id a
process's own `allowedGroups` names exists and permits that process. The
check resolves against the live `group-administration` store. This is a
third DB-resolving publish-time check, alongside `cross-process-validation`'s
`validateCrossProcess` and `validateProcessChaining`. It runs at the same
placement inside `publishBody`, after the hash-hit idempotent no-op
return. That placement also sits after the in-process
`validateReferences`/CEL checks `definition-contract` places on the
compile pass.

This capability holds only the publish-time check. It does not hold the
`allowedGroups` field itself, a `definition-contract` schema addition. It
also does not hold the compile-pass structural check tying a step's
`org.group-members` reference to `allowedGroups`. That check stays under
`definition-contract` too. It runs inside `compileProcessBody` on two
lists already present in the body, with no database involved. This check
is the one of the three that resolves against the database, so it follows
`cross-process-validation`'s placement precedent.

## Requirements

### Requirement: Every declared allowedGroups entry names a group whose scope permits this process

At publish, for every entry in the compiled body's `allowedGroups`, the
engine SHALL confirm two facts against the groups store. A group with that
id SHALL exist, and its scope SHALL permit this process. A `"global"`-
scoped group permits every process. A `"processes"`-scoped group permits
only a process whose id appears in that group's `processIds`. A violation
of either fact SHALL fail the publish, naming the offending group id and
the reason.

This is a third DB-resolving check, alongside `validateCrossProcess` and
`validateProcessChaining`. It runs inside `publishBody`, not inside
`compileProcessBody`. So `definition-contract`'s own compile-pass
placement rule, for the step-level `groupId` check, does not govern this
check.

This check is a hard publish rejection, never a silent empty-candidates
fallback. It is an authoring-time reference check on the list the author
declared. It is not the runtime resolution `group-based-assignment`
defines for an already-published body. The two stay independent. A group
deleted or rescoped after publish does not retroactively change the
resolution an already-running instance sees.

The check SHALL run at the same relative position `validateReferences`'s
existing checks already occupy in the publish path. It runs after the
hash-hit idempotent no-op return, on the compiled body. A re-publish of a
body whose hash already matches a stored version SHALL therefore stay a
no-op. That holds even when a referenced group's scope changed since that
first publish. The check SHALL use the
same per-request, per-tenant database handle already threaded through
every other publish-time check. It SHALL never use a handle bound once at
server startup.

#### Scenario: A globally scoped allowedGroups entry publishes for any process

- **WHEN** a process declares `"allowedGroups": ["group_finance"]`, and
  `group_finance`'s scope is `{ "type": "global" }`
- **THEN** the publish succeeds (subject to every other invariant)

#### Scenario: A processes-scoped allowedGroups entry publishes for a listed process

- **WHEN** a process `proc_expense` declares `"allowedGroups":
  ["group_finance"]`, and `group_finance`'s scope is `{ "type":
  "processes", "processIds": ["proc_expense"] }`
- **THEN** the publish succeeds (subject to every other invariant)

#### Scenario: A processes-scoped allowedGroups entry fails for an unlisted process

- **WHEN** a process `proc_travel` declares `"allowedGroups":
  ["group_finance"]`, and `group_finance`'s scope is `{ "type":
  "processes", "processIds": ["proc_expense"] }` (not `proc_travel`)
- **THEN** the publish fails with a validation error naming
  `"group_finance"`

#### Scenario: An allowedGroups entry naming no group fails the publish

- **WHEN** a process declares `"allowedGroups": ["group_ghost"]`, and no
  group named `group_ghost` exists in the groups store
- **THEN** the publish fails with a validation error naming
  `"group_ghost"`

#### Scenario: An identical re-publish stays a no-op despite a scope change

<!-- antislop: allow passive-voice -->
<!-- Why: a Scenario's WHEN/AND steps name the triggering condition, not a caller; "is called"/"been rescoped" match this file's other scenario steps' style. -->
- **WHEN** `publishBody` is called with a body whose hash matches an
  already-published version
- **AND** a group that body's `allowedGroups` names has since been
  rescoped to no longer permit this process
- **THEN** the call returns the existing version without running the
  database-backed scope check
