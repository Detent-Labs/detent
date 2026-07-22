## MODIFIED Requirements

### Requirement: Publish is monotonic and idempotent-on-identical

Publishing an authored body SHALL compile it (cancel-sink injection) and hash the
compiled body. If a version with that `definitionHash` already exists for the
`processId`, publish is a no-op returning the existing version. Otherwise the
store SHALL validate the compiled body's actions against the injected action
registry, its expressions, and its cross-process wiring, then assign the next
monotonic `version` for that `processId` and insert the new version.

Action-registry, expression, and cross-process validation SHALL run on the
insert path only, after the hash-hit lookup: a body already published is not
re-validated, so a tightening of any of the three checks — including a
handler being registered later, or its `configSchema` tightening later —
never retroactively rejects a definition that instances are already pinned
to. Duration validation is the exception by construction — it lives inside
the compile pass the hash itself derives from, so it necessarily precedes
the lookup.

#### Scenario: Re-publishing an identical body is a no-op

- **WHEN** the same authored body is published twice
- **THEN** the second publish creates no new version and returns the first

#### Scenario: Publishing a changed body assigns the next version

- **WHEN** an authored body that differs from the latest published body is
  published for the same `processId`
- **THEN** the store assigns `version = latest + 1` and persists it

#### Scenario: An already-published body is not re-validated

- **WHEN** a body identical to an already-published version is published again
  after the expression check has tightened
- **THEN** publish returns the existing version without raising, because the
  hash-hit path precedes expression validation

#### Scenario: An already-published body is not re-validated against a newly stricter registry

- **WHEN** a body identical to an already-published version is published
  again after a handler it uses gained a `configSchema` the original
  `config` would now fail
- **THEN** publish returns the existing version without raising, because the
  hash-hit path precedes the action-registry check

## ADDED Requirements

### Requirement: Publish requires an action registry and rejects an invalid action

`publishBody` SHALL take the process's action `Registry` as a required
argument and SHALL reject the publish, before any persist, when the compiled
body carries an action whose `type` is not registered or whose `config`
violates its handler's declared `configSchema`. This closes the same class of
gap the expression check closes: an unknown handler type or an invalid
plugin config publishing cleanly today only fails at outbox delivery — retry,
dead-letter, parked instance — with no author-visible signal at the point the
mistake was made.

The rejection SHALL carry every located issue, not only the first, so an
author fixes one publish's worth of action defects at a time. This check
SHALL run on the compiled body, after the hash-hit no-op return, in the same
insert-path position as the expression check.

#### Scenario: A body with an unregistered action type is not published

- **WHEN** `publishBody` is called with a body containing an action whose
  `type` is absent from the given registry
- **THEN** it throws, reporting the location and the unregistered `type`,
  and no definitions row is written

#### Scenario: A body with a schema-violating action config is not published

- **WHEN** `publishBody` is called with a body containing an action whose
  `config` fails its resolved handler's declared `configSchema`
- **THEN** it throws, reporting the location and the violation, and no
  definitions row is written

#### Scenario: A rejected publish consumes no version number

- **WHEN** a publish is rejected for an invalid action and a valid body is
  then published for the same `processId`
- **THEN** the valid body receives the version the rejected publish would
  have received

#### Scenario: A body with only valid actions publishes normally

- **WHEN** `publishBody` is called with a body whose every action resolves in
  the registry and satisfies its handler's declared `configSchema` (or the
  handler declares none)
- **THEN** the action-registry check raises nothing and publish proceeds to
  its remaining checks
