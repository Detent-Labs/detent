# studio-migration-plan-form Specification

## Purpose

A field-mapping form for a migration plan, built over the source version's
catalog and the target version's catalog. It replaces raw-id typing for
every `MigrationSpec` key, and keeps the raw-JSON textarea reachable as the
escape hatch.

## Requirements

### Requirement: The migration-plan screen offers a form built from both versions' catalogs

The studio area SHALL read the source version's body and the target
version's body when the migration-plan screen opens. It SHALL show a form
whose choices come from those two bodies. The form SHALL cover every
`MigrationSpec` key: `stepMap`, `fieldMap`, `transforms`, `onUnmappable`
and `unmappableStep`.

Each choice SHALL name its step or field by `key` and `label`. A raw id
alone is not enough, because an id is an opaque UUID.

A field catalog SHALL hold the leaf fields a `group` field nests, and SHALL
NOT hold the `group` field itself. An instance's `data` is flat and keyed
by a leaf field, so a group carries no value to map.

No picker SHALL offer the reserved cancel-sink step.

#### Scenario: The form lists the source catalog for a fieldMap key

- **WHEN** a developer adds a field-map row
- **THEN** the source side offers the fields the source version declares,
  named by `key` and `label`

#### Scenario: The form lists the target catalog for a fieldMap value

- **WHEN** a developer picks the target side of a field-map row
- **THEN** only the fields the target version declares appear as choices

#### Scenario: The form lists both step sets for a stepMap row

- **WHEN** a developer adds a step-map row
- **THEN** the source side offers the source version's steps and the
  target side offers the target version's steps

#### Scenario: A transforms row names a target field

- **WHEN** a developer adds a transform
- **THEN** the developer picks the target field from the target version's
  catalog, and the expression stays a CEL text input

#### Scenario: The form offers a field nested in a group

- **WHEN** the target version declares a `group` field holding two leaf
  fields
- **THEN** both leaf fields appear as mapping choices, and the group does
  not

### Requirement: The form produces the same MigrationSpec the JSON textarea produces

The form SHALL send the same `MigrationSpec` object shape the raw-JSON
textarea sends today. It SHALL add no key the schema does not declare. It
SHALL omit an empty map rather than send an empty object for it.

A `transforms` value SHALL be an `Expression`, not a bare string. The form
SHALL wrap the text an author types and SHALL read that same text back.

The form SHALL carry `unmappableStep` when `onUnmappable` is
`route-to-step`, and SHALL carry neither otherwise. The pairing is an iff
in the schema. The form SHALL hold it by construction, so the schema
refinement cannot fail on the form's own output.

#### Scenario: A form-built plan matches a hand-written one

- **WHEN** a developer builds one field-map entry and one step-map entry
  in the form
- **THEN** the saved plan is the same object a developer typing the
  equivalent JSON would have saved

#### Scenario: Choosing reject-and-pin drops the unmappable step

- **WHEN** a developer switches `onUnmappable` from `route-to-step` to
  `reject-and-pin`
- **THEN** the plan carries no `unmappableStep`

#### Scenario: Choosing route-to-step never leaves the step empty

- **WHEN** a developer chooses `route-to-step`
- **THEN** the plan carries an `unmappableStep` at once, from the target
  version's steps

#### Scenario: A transform carries the expression wrapper

- **WHEN** a developer types a CEL source string into a transform row
- **THEN** the saved plan holds `{ lang: "cel", src }` under the target
  field id

#### Scenario: An empty form saves an empty plan

- **WHEN** a developer saves without adding a row or choosing a policy
- **THEN** the saved plan is `{}`, the same value the empty textarea
  produces today

### Requirement: An existing plan opens in the form unchanged

A plan already stored for the version pair SHALL open in the form with
every entry shown. Reading a plan into the form and writing it back
without an edit SHALL produce the same plan.

An entry may name an id the matching catalog does not declare. That entry
SHALL stay in the form, and SHALL stay in the saved plan. The form SHALL
mark it as unresolved. The form SHALL NOT drop it. Dropping it would lose
part of a stored plan the author never edited.

#### Scenario: A hand-authored plan round-trips through the form

- **WHEN** a developer opens a plan written earlier as raw JSON, then
  saves it without an edit
- **THEN** the saved plan equals the plan the screen read

#### Scenario: An unresolved id survives the round trip

- **WHEN** a stored plan names a field id the target catalog does not
  declare
- **THEN** the form shows that row as unresolved, and saving without an
  edit keeps the id

### Requirement: The form reports what the browser can check, before the save

The form SHALL show an inline error for a rule it can evaluate from the
two bodies it already holds. Three rules qualify:

- a `fieldMap` that maps two sources onto one target;
- a `fieldMap` pair whose CEL types disagree;
- a `stepMap` value or an `unmappableStep` naming the reserved cancel-sink
  step.

The type rule SHALL compare CEL types, not declared field types. Two fields
sharing one declared type can still disagree, because a `format` moves the CEL
type. A `{type: "number", format: "integer"}` field reports `int`. A plain
`number` field reports `double`. A check over the declared type alone would
miss that pair. It would also flag `file` against a plugin type, which the
server accepts, since both report `dyn`.

The form SHALL show each error at the row it applies to. The server keeps
every check it runs today. The form adds no rule the server does not
already enforce.

#### Scenario: The form reports a non-injective field map at the row

- **WHEN** two field-map rows target the same field
- **THEN** the form shows an error on the offending rows before the
  developer saves

#### Scenario: The form reports a type mismatch at the row

- **WHEN** a field-map row moves a `string` field onto a field the target
  version declares as `number`
- **THEN** the form shows an error on that row

#### Scenario: An integer target disagrees with a plain number source

- **WHEN** a field-map row moves a `number` field declaring no format onto a
  field the target version declares as `{type: "number", format: "integer"}`
- **THEN** the form shows an error on that row, because `double` and `int` are
  different CEL types

#### Scenario: Two declared types sharing one CEL type pass

- **WHEN** a field-map row moves a `file` field onto a field the target
  version declares with a plugin envelope type
- **THEN** the form shows no error, because both hold the CEL type the
  server compares

#### Scenario: A valid plan shows no inline error

- **WHEN** every row resolves and no rule above is broken
- **THEN** the form shows no inline error

### Requirement: The raw-JSON textarea stays reachable and stays in sync

The screen SHALL offer a switch between the form and the raw-JSON
textarea. Each side SHALL open on the plan the other side currently holds.
The textarea SHALL keep the behavior it has today, including its
parse-error message on save.

#### Scenario: Switching to JSON shows the form's plan

- **WHEN** a developer builds a mapping in the form and switches to the
  textarea
- **THEN** the textarea holds the plan the form built

#### Scenario: Switching back to the form shows the edited JSON

- **WHEN** a developer edits the plan in the textarea and switches back to
  the form
- **THEN** the form shows the edited plan

#### Scenario: Unparsable JSON blocks the switch back

- **WHEN** the textarea holds text that is not JSON and the developer
  switches to the form
- **THEN** the screen reports the parse error and stays on the textarea

### Requirement: The screen falls back to the textarea when a version body fails to load

The form needs both bodies. WHEN either body fails to load, the screen
SHALL show the raw-JSON textarea. It SHALL state why the form is
unavailable. Plan editing SHALL stay possible in that state.

#### Scenario: A failed body request leaves the textarea usable

- **WHEN** the request for the target version's body fails
- **THEN** the screen shows the textarea, names the reason, and still
  saves a plan typed into it

### Requirement: The orphan-key dry run keeps its behavior

The orphan-key dry run SHALL stay on the screen, below whichever side of
the switch is open. Its two scan buttons and its result list SHALL behave
as they do today.

#### Scenario: The dry run works while the form is open

- **WHEN** a developer scans a version while the form is open
- **THEN** the scan result appears, the same result the textarea-only
  screen shows today
