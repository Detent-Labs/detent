## Why

One key, `FieldDef.type`, does three jobs at once. It fixes the value form the
engine checks, the semantics a validator would enforce, and the widget the
renderer draws. Ten enum members collapse onto five engine types, so five of
them exist for the renderer alone. A `date` field accepts `"banane"` today,
because `typeMatches` reads `typeof value === "string"` and stops there.

Every new widget costs a member in `baseFieldType`, a row in `JS_TYPE`, a case
in `celType`, an entry in `FIELD_TYPE_LABELS` and a branch in `FieldForm`. That
price is why `docs/decisions.md` turned down a "Long text" type.

This change splits the key along the three jobs. A widget then costs a
`control` member, and a validated semantic costs a `format` member. Decisions
D1 to D25 in `docs/field-model-redesign.md` settle every question this
proposal implements.

## What Changes

- **BREAKING** `FieldDef.type` shrinks to six value forms: `string`, `number`,
  `boolean`, `list`, `file`, `group` (D2). Each maps to exactly one CEL type
  and one JS type, so neither `celType` nor `JS_TYPE` collapses members after
  this.
- **BREAKING** `select`, `multiselect`, `date`, `datetime` and `reference`
  leave the type enum (D4, D5, D25). A one-pick field is `string`, a
  several-pick field is `list`, and what makes either a picker is the presence
  of `options` or `dataSource`. A `reference` field becomes `string`, which is
  what its CEL type, its JS type and its rendered control already were.
- `FieldDef` gains an optional `format`, a closed enum of four members: `date`,
  `datetime`, `integer`, `email` (D6, D20). A format validates its value, and
  that check joins `typeMatches`, the one type rule submission and outbox
  writeback already share (D19).
- `FieldDef` gains an optional `control`, a closed enum of three members:
  `multiline`, `radio`, `checkboxes` (D21). It sits at catalog level, with no
  per-step override in this round (D8). An omitted `control` means the default
  control for the type, so every body written today keeps its rendering.
- A field declaring `format: "integer"` reports the CEL type `int` rather than
  `double` (D24). An author can then write `data.anzahl % 2 == 0`, which fails
  the check today.
- The compile pass gains one check. It rejects a `format` or a `control` the
  field's `type` does not allow, from one table of allowed pairs (D22). It also
  rejects a literal `FieldDef.default` that its own field's `format` refuses
  (D19).
- The studio's field editor gains a format picker and a control picker. Each
  offers what the same table allows for the selected type.
- The renderer draws a `<textarea>`, a radio pair and a checkbox group, which
  no body could reach before.

The design record's own boundaries put six things out of scope. Change 2 takes
the `person` format and `org.actor-from-field`. Change 3 takes display elements
in the view. Change 4 takes item lists, per S1. The `richtext`, `image` and
`signature` formats wait for D20's own reasons. A per-step `control` override
waits per S5 and D8.

## Capabilities

### New Capabilities

None. The change reshapes an existing contract key and the surfaces that read
it.

### Modified Capabilities

- `definition-contract`: the field type enum shrinks, and `format` and
  `control` join `FieldDef`. One compile-pass check rejects a disallowed pair,
  and a literal default a format refuses. The `columnMapping` type rule names
  `string` where it named `select`.
- `cel-expressions`: each of the six types maps to one CEL type, and
  `format: "integer"` reports `int`. The deadline site's accept-and-reject
  scenarios name the new types.
- `runtime-api`: submission validation checks the declared `format` beside the
  declared type, and the type-match step names the six types.
- `runtime-field-type-check-consolidation`: the one shared table covers the
  six types. The format check sits beside it, not in a second copy.
- `field-tree-check-consolidation`: the merged field-tree walk runs five checks
  instead of four.
- `form-ui`: the renderer picks its widget from `type`, `format` and `control`
  together. It gains the textarea, the radio pair and the checkbox group.
- `studio-app`: the type picker lists six types, and a format picker and a
  control picker join it. The Default value zone follows the new types.
- `studio-field-validation-form`: the offered-key table follows the six
  types.
- `studio-column-mapping-form`: the editor appears for a `string` field bound
  to a `"db.list"` source, and a `list` field shows none.
- `studio-condition-builder`: operand typing follows the six types, and an
  `int` operand writes a bare integer literal rather than the `double` form.
- `studio-migration-plan-form`: the CEL-type comparison rule states why two
  fields sharing a declared type can still disagree.
- `data-source-resolution`: `heldValues` carries one value for a `string`
  field and the whole array for a `list` field.
- `instance-query-data-source`: the non-scalar `valueFromField` rejection names
  `list` and `group`.
- `instance-data-query`: the array-valued comparison backstop names a `list`
  field.
- `authored-content-localization`: the nested-label scenario names a field
  carrying `options` rather than a `select`-typed field.

## Impact

Engine and schema: `src/schema/definition.ts` (`baseFieldType`, `fieldDef`,
`JS_TYPE`, `typeMatches`, `expectedTypeLabel`), `src/cel/check.ts` (`celType`
and its two schema builders, `fieldTypeById`), `src/schema/compile.ts`
(`checkFieldTree`, `checkColumnMapping`), `src/engine/definitions.ts`
(`isNonScalarFieldType`), `src/engine/migration.ts`, `src/engine/outbox.ts`,
`src/runtime/api.ts`.

Web: in `packages/form-ui`, `FieldForm.tsx`, `types.ts` (whose `WireField`
lists the wire field's keys by hand) and `issue-messages.ts`. In
`packages/web`, the field catalog panel, `field-type-labels.ts`,
`field-preview.ts`, `mintField.ts`, `defaultValueLogic.ts`,
`fieldValidationLogic.ts`, `columnMappingLogic.ts`, `conditionLogic.ts`,
`ruleLogic.ts`, `migrationPlanLogic.ts` and the studio area's stylesheet.

Definitions, docs and tests: nine field declarations across four files under
`examples/`, plus `docs/authoring-guide.md`, `docs/current-state.md`,
`docs/decisions.md` and `docs/browser-checks.md`. Twelve engine suites and
several web suites name a removed field type.

One recorded decision reverses. Today `docs/decisions.md` says the contract has
no multiline string variant. It gates a future one on rendered behavior that a
`string` field cannot already express. `control: "multiline"` is that
behavior.

A dev database holding a body with a removed type value no longer reads. The
contract module is also the deserializer, which is why. No deployment runs this
engine, and no stored instance pins such a body. The repair is a reseed.
