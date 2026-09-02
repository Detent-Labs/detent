<!-- antislop: allow-file passive-voice sentence-length run-ons paragraph-length synonym-rotation -->
<!-- Gherkin grammar is structurally passive, and the requirement below is copied whole from the live spec, whose debt predates this change; only the visible-scope paragraph is new. -->

## MODIFIED Requirements

### Requirement: A read returning instance data without label resolution

The Runtime API Layer SHALL expose a read returning four things per matched
instance. They are its `instanceId`, its pinned `version`, its `data` payload,
and its `redactedAt` where redaction wrote one. It SHALL return nothing else.

The read SHALL accept these optional filters: `processId`, `version`, `status`,
`currentStepId`, `startedBy`, `claimedBy`, `excludeInstanceId`, `createdAfter`,
`createdBefore` and `dataWhere`. It SHALL combine them conjunctively.

The read SHALL reject `assignedTo`, `assignedToRoles`, `scope` and
`includeDegraded` as a caller error. Each names behaviour the list read
resolves and this read does not. Ignoring one would answer a question the
caller did not ask. A cursor is not among them, since this read takes no cursor
argument at all.

The read rejects `assignedTo` and `assignedToRoles`. Together those two form
the list read's inbox predicate, and this read resolves no inbox. It rejects
`scope` for the same reason. That value is the HTTP layer's derivation of the
same predicate from the credential.

A `claimedBy` filter names an actor too, and the read accepts it. A caller
states that id, and nothing derives it from the credential. An `includeDegraded`
flag has meaning only on a read that resolves a summary. A cursor belongs to a
paged read, and this read does not page.

A `version` filter SHALL accompany a `processId` filter, the rule the list read
carries. The read SHALL reject a `version` with no `processId` as a caller
error.

The four returned fields serve one consumer requirement. A report cell can be
empty for three different reasons, and its reader must tell them apart. The
field held no value. The field did not exist in that instance's version. Or
redaction cleared the value.

The pinned `version` separates the second case against that version's field
catalog, and `redactedAt` separates the third. Both already sit on the parsed
instance, so neither costs a definition-store lookup.

The read SHALL resolve no process or step labels. It SHALL NOT consult the
definition store. An option list re-resolves on every form render, every
submission, every timer fire and every automatic transition. Label resolution
is work each of those discards.

The read SHALL NOT page by cursor. It SHALL bound the result by a maximum
count, with a documented default and an enforced maximum. A caller asking for
more than the enforced maximum SHALL receive the enforced maximum, not the
number asked for.

The read SHALL report when that bound truncated the result. A caller can then
tell a complete answer from a cut one. A result filling the bound exactly SHALL
report no truncation. The read SHALL order by the instance's creation time,
newest first, breaking ties by instance id. So one filter selects one subset,
call after call.

The read SHALL NOT scope results to the calling actor implicitly.

The read SHALL accept one further optional filter, a resolved principal set
naming an actor. When a caller passes it, the read SHALL return only the rows
that set may see, by the `instance-visibility-set` capability's rule. The
result stays bounded and truncation-reporting after that narrowing, so a
narrowed result never reads as a complete one.

This is not the rejected `scope`. That value names a derivation the HTTP layer
makes from a credential. This one is a resolved set the caller states, the way
`claimedBy` names an actor the caller states. The read still derives nothing
from a credential, and two callers passing one identical filter still receive
one identical result.

A caller passing none SHALL receive today's unnarrowed result. The engine's own
readers pass none. They run with no actor, so they have no set to match.

The read SHALL still return an instance whose pinned `(processId, version)` has
no resolvable published body. This read exposes no field that the body
resolves. So what degrades a list summary has no effect here.

#### Scenario: The read returns identity, data and redaction state

- **WHEN** the read runs and two instances match
- **THEN** each returned item carries `instanceId`, `version` and `data`
- **AND** no item carries `processLabel`, `stepLabel`, `status`, or
  `transitionSeq`

#### Scenario: A redacted instance is distinguishable from an empty one

- **WHEN** redaction cleared one matched instance, and another never wrote
  field F
- **THEN** the redacted instance's item carries a `redactedAt` timestamp
- **AND** the other instance's item carries no `redactedAt`

#### Scenario: The read rejects a filter it does not accept

- **WHEN** a caller passes `assignedTo`, `assignedToRoles`, `scope` or
  `includeDegraded`
- **THEN** the read rejects the call as a caller error

#### Scenario: The read does not narrow to the calling actor

- **WHEN** two callers run the read with one identical filter
- **THEN** both receive the same items

#### Scenario: A stated principal set narrows the rows

- **WHEN** a caller passes a principal set naming an actor
- **AND** some matching instances lie outside that actor's visible set
- **THEN** the read returns only the instances inside it

#### Scenario: A caller passing no principal set sees every match

- **WHEN** a caller passes no principal set
- **THEN** the read returns every matching instance, as it does today

#### Scenario: An unresolvable body does not remove an instance

- **WHEN** a matched instance pins a `(processId, version)` with no published
  body
- **THEN** the read still returns that instance with its `instanceId` and
  `data`

#### Scenario: The bound truncates and says so

- **WHEN** the read runs with a maximum count of 10 and 25 instances match
- **THEN** it returns 10 items
- **AND** it reports that the bound truncated the result

#### Scenario: The read hands back no cursor

- **WHEN** the read runs and the bound truncates the result
- **THEN** the envelope carries no cursor for a following page

#### Scenario: The read rejects a version with no processId

- **WHEN** a caller passes a `version` and no `processId`
- **THEN** the read rejects the call as a caller error

#### Scenario: An unbounded result reports no truncation

- **WHEN** the read runs with a maximum count of 10 and 3 instances match
- **THEN** it returns 3 items
- **AND** it reports no truncation

#### Scenario: A result filling the bound exactly reports no truncation

- **WHEN** the read runs with a maximum count of 10 and exactly 10 instances
  match
- **THEN** it returns 10 items
- **AND** it reports no truncation

#### Scenario: The enforced maximum caps an oversized request

- **WHEN** a caller asks for more items than the enforced maximum
- **THEN** the read returns at most the enforced maximum

#### Scenario: A truncated result is the same subset every time

- **WHEN** the read runs twice with one filter and a maximum count that cuts
  the result
- **THEN** both calls return the same items, newest first
