## ADDED Requirements

### Requirement: A migration transform is checked against the source catalog

A migration `transforms` expression SHALL be parse- and type-checked when its plan
is registered, against the **source** version's field catalog rather than the
target's. A transform reads the instance's pre-migration data and writes a target
field, so its identifiers resolve in the version the instance is leaving.

The check therefore spans two bodies — source catalog for the expression, target
catalog for the field it writes — and cannot be expressed by the single-body
validation entry point. It SHALL have its own entry point taking both bodies.

#### Scenario: A transform reading a source field is accepted

- **WHEN** a transform references a field key declared by the source version
- **THEN** it type-checks and registration succeeds

#### Scenario: A transform reading a field only the target declares is refused

- **WHEN** a transform references a field key the source version does not declare
- **THEN** registration fails with a located issue naming the transform

#### Scenario: A transform writing a field the target does not declare is refused

- **WHEN** a `transforms` key names a `FieldId` absent from the target catalog
- **THEN** registration fails

### Requirement: A transform's result type matches the field it writes

A transform's inferred result type SHALL match the declared type of the target
field it writes, with an unknowable type (a plugin field or data source, which
infers as `dyn`) accepted.

Instance `data` is untyped against the catalog, but every guard reading that field
on the target version is typed against it. A transform yielding a string into a
field declared `number` therefore makes each such guard raise, which guard totality
converts to `false` — a silently wrong branch rather than an error. This is the
same failure mode the `deadline` site's expected-type check exists to prevent, and
it uses the same mechanism.

#### Scenario: A matching result type is accepted

- **WHEN** a transform yielding a number targets a field declared `number`
- **THEN** registration succeeds

#### Scenario: A mismatched result type is refused

- **WHEN** a transform yielding a string targets a field declared `number`
- **THEN** registration fails naming the transform and both types

#### Scenario: An unknowable result type is accepted

- **WHEN** a transform's result type infers as `dyn` because it reads a plugin field
- **THEN** registration succeeds, the type being unknowable at this layer

### Requirement: A migration transform sees data and instance only

The context a transform is checked and evaluated against SHALL be `data` (the
source version's catalog, keyed by field `key`) and `instance`, and nothing else.

`actor` SHALL be withheld: migration is an operator action against a whole
population, and admitting `actor` would let a rule that is supposed to be uniform
produce different data per instance. This is the first site to withhold `actor`, so
the environment builder gains a dimension. It is exercised only from the migration
entry point, which builds its own environment, so no existing cached environment
changes meaning.

`child` SHALL be withheld: migration is not a step entry and no child is in scope.

Data sources SHALL be withheld, for the reason a timer `deadline` withholds them:
they are not resolved on this path, so a transform referencing one would raise for
every instance in the population.

`result` remains scoped to `Action.output`. Time functions remain forbidden.

#### Scenario: A transform referencing actor is refused

- **WHEN** a transform references `actor`
- **THEN** registration fails

#### Scenario: A transform referencing a data source is refused

- **WHEN** a transform references a declared data source's result
- **THEN** registration fails

#### Scenario: A transform referencing child is refused

- **WHEN** a transform references `child.outcome` or `child.data`
- **THEN** registration fails

#### Scenario: A transform may read the instance projection

- **WHEN** a transform references a field of `instance`
- **THEN** it type-checks against the same projection guards see

#### Scenario: A transform calling a time function is refused

- **WHEN** a transform calls `now()`, `timestamp()`, or `duration()`
- **THEN** registration fails

#### Scenario: Ordinary sites still resolve actor

- **WHEN** a process body is validated after the migration entry point exists
- **THEN** every guard, view, and mapping site still resolves `actor` exactly as
  before
