## MODIFIED Requirements

### Requirement: The compile-pass field-tree checks share one walk

The write-path field checks SHALL run as one traversal of `body.fields`.
The five checks are: pattern compilation and length, `columnMapping`
validation, field-key format, field-key length, and the `format`/`control`
check the `definition-contract` capability states. One `walkFieldsIndexed`
pass runs all five at each field, instead of five separate traversals.

The merge SHALL NOT change the set of `CompileIssue`s a body produces.
Every violation keeps the same `loc`, `value`, and `message` a
pre-consolidation body would have reported. The merge MAY change the
array's relative order across different checks. A field with violations
from several checks may now report them next to each other. Before the
merge, its violations sat split apart by field order, within each
check's own sweep.

#### Scenario: A body with several field-level defects reports the same issues

- **WHEN** a body's fields carry a mix of pattern, `columnMapping`,
  key-format, key-length, and `format`/`control` violations spread across
  several fields
- **THEN** `compileProcessBody` throws a `CompileValidationError`. Treat
  its issues as a set of `{loc, value, message}` triples. That set
  matches what the five checks produce independently. `body.fields` gets
  walked once instead of five times.

#### Scenario: A disallowed format reports from the same walk

- **WHEN** one field declares a `format` its `type` does not allow and
  another field on the same body carries a key-format violation
- **THEN** both issues appear in the one `CompileValidationError`, each
  located at its own field

#### Scenario: checkLengthBounds retains bounds it does not share with the merged walk

- **WHEN** a body also has a plugin-type site, an expression-length site,
  or a duration-length site over its declared bound
- **THEN** those non-field-tree length checks still report, unchanged.
  Only the field-key-length loop moves into the merged field-tree walk.
  `checkLengthBounds`'s other three sweeps stay where they are.

### Requirement: Leaf-field collection has one shared implementation

`dataSchema`, `contractFieldSchema` (both `src/cel/check.ts`), and
`fieldKeyById` (`src/cel/eval.ts`) SHALL derive their leaf-field list from
one shared helper. That list means every leaf field, with group
containers dropped. The helper is `leafFields(fields: FieldDef[]):
FieldDef[]`, declared in `src/schema/definition.ts` beside
`collectFieldsDeep`. Neither of the three functions SHALL filter
`collectFieldsDeep`'s output for `type !== "group"` inline, on its own.

Each of the three reads the whole `FieldDef`, not its `type` alone, since a
field's CEL type now follows its `format` as well. The helper's return shape
already carries both keys.

#### Scenario: CEL check's data schema excludes group fields

- **WHEN** `validateProcessBody` builds the `data` namespace's type schema
  for a body whose catalog has nested `group` fields
- **THEN** the resulting key set holds exactly the process's leaf fields. A
  `group`-typed field at any depth contributes no entry, matching
  pre-consolidation `dataSchema` output exactly.

#### Scenario: A nested integer field reports int in the data schema

- **WHEN** that same body carries a `{type: "number", format: "integer"}`
  field inside a group
- **THEN** the `data` namespace holds that field's key with the CEL type
  `int`

#### Scenario: Runtime guard context re-keys only leaf fields

- **WHEN** `buildGuardContext` re-keys an instance's `data` payload from
  field id to field key, ahead of evaluating a path guard
- **THEN** the id-to-key map, built from `leafFields`, holds only leaf
  field ids. A `group`-typed field's id, which never appears in a
  submitted payload, stays absent from that map, matching
  pre-consolidation `fieldKeyById` output exactly.
