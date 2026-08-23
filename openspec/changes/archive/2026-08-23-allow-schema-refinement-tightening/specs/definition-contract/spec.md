## ADDED Requirements

### Requirement: An authoring invariant argues its own placement

An authoring invariant SHALL live either in the `definition.ts` schema or on the
publish path in `compile.ts`. Neither placement is the default. A change that
adds an invariant SHALL state the placement it takes and the reason.

The read path SHALL NOT settle that question on its own. `definition.ts`
deserializes stored bodies. A tightened refinement there makes a body published
before it fail to parse. That outcome parks the instances pinned to that body.

It stops no worker. Every body-resolving worker resolves a body inside its own
per-item error boundary. One unparseable body therefore never ends a pass. The
read-path cost stays small. It is a cost to weigh, never a veto.

Two criteria SHALL decide the placement:

- An invariant that a hand-written body must not bypass SHALL live on the
  publish path. `publishedProcessBody` checks only the cancel-sink count. A
  schema refinement alone therefore lets a body of that shape through.
- An invariant whose violation cannot exist in an already-published body MAY
  live in the schema. A key introduced together with its invariant has no such
  body behind it.

#### Scenario: A tightened schema refinement parks only its own instances

- **WHEN** a refinement in `definition.ts` tightens, and a body published
  earlier no longer parses
- **THEN** each worker resolving that body skips the affected instance, and
  every other instance in the same pass proceeds

#### Scenario: A publish-path check rejects a body the published schema accepts

- **WHEN** a hand-written body satisfies `publishedProcessBody` and breaks an
  invariant placed on the publish path
- **THEN** publishing rejects it with a located error

#### Scenario: A change states the placement it takes

- **WHEN** a change adds an authoring invariant
- **THEN** its spec names the placement and the criterion that decided it

## MODIFIED Requirements

### Requirement: A field may map data source columns onto other fields

`FieldDef` SHALL gain an optional `columnMapping`, an object whose key is a
column key and whose value is a `FieldId`.

The compile pass SHALL enforce every rule below, and SHALL reject a body that
breaks one. These are publish-path checks. An unbypassable check is the reason,
per the placement requirement above.

- A field declaring `columnMapping` SHALL declare `dataSource`. A mapping over
  inline options names a column no list declares.
- A field declaring `columnMapping` SHALL have `type` `"select"`. A
  `multiselect` picks several rows, and one target field cannot take several
  values.
- Each key SHALL match `/^[a-z_][a-z0-9_]*$/` and stay within `MAX_KEY_LENGTH`.
- Each target SHALL resolve against the body's recursive field set.
- A target SHALL NOT be the mapping field itself.
- A target SHALL NOT be a `group` field. A group holds fields and takes no
  value.
- Two keys SHALL NOT name one target. Two columns writing one field give the
  write no order.

The compile pass SHALL NOT check a key against any data list. Publishing stays
independent of the state of the data, exactly as `db-data-source-type` already
requires. A key naming no declared column writes nothing at runtime.

#### Scenario: A valid mapping publishes
- **WHEN** an author publishes a `select` field bound to a data source, mapping
  `price` onto a `number` field of the catalog
- **THEN** the publish succeeds

#### Scenario: A mapping without a data source fails the publish
- **WHEN** a field declares `columnMapping` and inline `options`
- **THEN** the publish fails with a validation error naming that field

#### Scenario: A mapping on a multiselect fails the publish
- **WHEN** a `multiselect` field declares `columnMapping`
- **THEN** the publish fails with a validation error naming that field

#### Scenario: An unresolvable target fails the publish
- **WHEN** a `columnMapping` value names a `FieldId` the body does not declare
- **THEN** the publish fails with a validation error naming that field

#### Scenario: A self-target fails the publish
- **WHEN** a `columnMapping` value names the mapping field itself
- **THEN** the publish fails with a validation error naming that field

#### Scenario: A group target fails the publish
- **WHEN** a `columnMapping` value names a field whose type is `"group"`
- **THEN** the publish fails with a validation error naming that field

#### Scenario: Two columns onto one target fail the publish
- **WHEN** two `columnMapping` keys name one `FieldId`
- **THEN** the publish fails with a validation error naming that field

#### Scenario: A key naming no declared column still publishes
- **WHEN** an author maps a column key that the bound list does not declare
- **THEN** the publish succeeds, because publishing reads no data list

### Requirement: A view field naming a technical field declares neither `required` nor `readonly`

The compile pass SHALL reject a `view.fields[]` entry whose `ref` names a
`technical` field, when that entry declares `required` or `readonly` at
all. This holds for a literal `true`, a literal `false`, and a CEL
expression alike. This is a publish-path check. An unbypassable check is the
reason, per the placement requirement above.

The rule follows the shape the definition contract already applies to
`options`/`dataSource` and to `duration`/`deadline`. Two facts cannot both
hold, so the compile pass rejects the pair. It never resolves one key over
the other. A display-only key, such as `order` or `group`, still passes on
a technical field's view entry.

#### Scenario: A required key on a technical field's entry fails the publish

- **WHEN** a step's view entry names a `technical` field and declares
  `required: true`
- **THEN** the publish fails with a validation error naming that field and
  step

#### Scenario: A literal readonly:false on a technical field's entry fails the publish

- **WHEN** a step's view entry names a `technical` field and declares
  `readonly: false`
- **THEN** the publish fails with a validation error naming that field and
  step

#### Scenario: A redundant readonly:true on a technical field's entry fails the publish

- **WHEN** a step's view entry names a `technical` field and declares
  `readonly: true`
- **THEN** the publish fails with a validation error naming that field and
  step

#### Scenario: A CEL required on a technical field's entry fails the publish

- **WHEN** a step's view entry names a `technical` field and declares
  `required` as a CEL expression
- **THEN** the publish fails with a validation error naming that field and
  step

#### Scenario: A display-only entry on a technical field publishes

- **WHEN** a step's view entry names a `technical` field and declares
  `order` alone, with neither `required` nor `readonly`
- **THEN** the publish succeeds
