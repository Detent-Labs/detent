## ADDED Requirements

### Requirement: Publish rejects a body carrying an invalid expression

Publish SHALL parse- and type-check every `Expression` in the body it is about to
persist, and SHALL reject the publish when any expression is invalid. The check
runs over the **compiled** body — the compile pass's output, so a step that pass
injects is held to the same rule as an authored one — and **before any persist**,
so a rejected publish leaves no row, no version number consumed, and no partially
validated definition behind.

Receiving the compiled body is a **placement invariant, not an observable
behaviour**. The cancel sink injected today declares no expression, and the check
never reads `contract`, so for every body expressible now the compiled and
authored forms check identically and no test can distinguish them. It is stated
so that a compile pass which later injects an expression is covered by
construction, rather than by someone remembering to re-order the call.

The rejection SHALL carry every located issue, not only the first, so an author
fixes one publish's worth of expressions at a time.

An unknown handler type, an invalid plugin config and an invalid expression are
one class of failure: a publish error, never a runtime error. Deferring an
expression failure to runtime is unrecoverable in practice — a broken guard is
total, so it evaluates `false` forever and parks the instance on a wait-state
with no signal; a broken mapping throws inside outbox delivery, re-invokes the
external handler on each retry, and dead-letters, parking the parent.

#### Scenario: a body with an unparseable expression is not published

- **WHEN** `publishBody` is called with a body containing an expression whose
  `src` does not parse as CEL
- **THEN** it throws, reporting the location and message of each invalid
  expression, and no definitions row is written

#### Scenario: a body with an unknown field reference is not published

- **WHEN** `publishBody` is called with a body whose guard references a field key
  absent from the catalog
- **THEN** it throws and no version is assigned

#### Scenario: a body whose Action.output reads outside `result` is not published

- **WHEN** `publishBody` is called with a body whose `Action.output` expression
  references `data`, `instance`, `actor`, `child`, or a data-source result
- **THEN** it throws, rather than persisting a definition whose writeback would
  throw on every delivery attempt

#### Scenario: a rejected publish consumes no version number

- **WHEN** a publish is rejected for an invalid expression and a valid body is
  then published for the same `processId`
- **THEN** the valid body receives the version the rejected publish would have
  received

#### Scenario: the check is handed the compiled body

- **WHEN** publish validates a body's expressions
- **THEN** the value passed to the check is the compile pass's output, not the
  authored input — so an expression on an injected step would be checked, and the
  body validated is the body persisted

## MODIFIED Requirements

### Requirement: Publish is monotonic and idempotent-on-identical

Publishing an authored body SHALL compile it (cancel-sink injection) and hash the
compiled body. If a version with that `definitionHash` already exists for the
`processId`, publish is a no-op returning the existing version. Otherwise the
store SHALL validate the compiled body's expressions and cross-process wiring,
then assign the next monotonic `version` for that `processId` and insert the new
version.

Expression and cross-process validation SHALL run on the insert path only, after
the hash-hit lookup: a body already published is not re-validated, so a
tightening of either check never retroactively rejects a definition that
instances are already pinned to. Duration validation is the exception by
construction — it lives inside the compile pass the hash itself derives from, so
it necessarily precedes the lookup.

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
