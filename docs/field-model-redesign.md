# Field model redesign: the decisions

A design record, not a spec. It holds what a brainstorming session settled on
2026-08-30. The OpenSpec changes that follow can cite a numbered decision
instead of deriving it again.

Four changes come out of this record. Change 1 is the foundation. The others
build on it or stand beside it. Each one writes its own proposal, specs and
tasks under `openspec/changes/`.

## What is wrong today

One key, `FieldDef.type`, does three jobs. Two places map it to the type the
engine sees. Both collapse the same ten members onto the same five:

| CEL type (`cel/check.ts:50`) | JS type (`definition.ts:373`) | Members |
|---|---|---|
| `string` | `"string"` | string, date, datetime, select, reference |
| `double` | `"number"` | number |
| `bool` | `"boolean"` | boolean |
| `list<string>` | `"string[]"` | multiselect |
| `dyn` | `"any"` | file, group |

Five of the ten members exist to drive the widget switch in
`packages/form-ui/src/FieldForm.tsx:160-206` and the label in
`field-type-labels.ts`. They carry no engine semantics. A `date` field accepts
`"banane"` today. The check in `typeMatches` reads `typeof value === "string"`
and nothing else.

The cost lands on every new field type. One added widget costs a member in
`baseFieldType` and a row in `JS_TYPE`. It also costs a case in `celType`, an
entry in `FIELD_TYPE_LABELS` and a branch in `FieldForm`. That cost is why
`docs/decisions.md` rejected a "Long text" type.

## The model: three keys

| Key | What it carries | Who reads it |
|---|---|---|
| `type` | the value form | CEL check, `typeMatches`, generated columns |
| `format` | the semantics of the value | validation, publish-time checks, reporting |
| `control` | the input form | `FieldForm` alone |

One test sorts every case: **does anything besides the renderer read it?** Yes
puts it in `format`. No puts it in `control`.

Three keys are less machinery than one, not more. The table above measures what
today's single key already hides.

## Decisions

### The type axis

**D1.** The single `type` key splits into three keys, `type`, `format` and
`control`, per the model above.

**D2.** The `type` enum shrinks to six value forms: `string`, `number`,
`boolean`, `list`, `file`, `group`. Each maps to exactly one CEL type and one
JS type. Neither `celType` nor `JS_TYPE` collapses members after this.

**D3.** A `list` holds strings in this round. A future list of numbers adds an
`items` key. Do not add it now.

**D4.** Change 1 removes `select` and `multiselect`. What makes a field a
picker is the presence of `options` or `dataSource`, not its type. Cardinality
is the type: one pick is `string`, several picks are `list`.

**D5.** Change 1 also removes `date`, `datetime` and `reference` as types. The
first two become formats over `string`. D25 drops `reference` outright.

**D6.** The `format` enum stays closed, so every member keeps a publish-time
check. A field type that no closed member covers uses the plugin envelope
`{type, config}`, which already exists.

**D7.** The `multiline` case is a `control`, not a `format`. A multiline string
is a string, and nothing validates it differently. The `richtext` case goes the
other way. Its value is markup rather than text. A `notification.email` handler
must know that before it escapes the value.

**D8.** The `control` key sits on `FieldDef`, at catalog level. No per-step
override in this round. The catalog-default plus view-override pattern that
`validation` already uses stays available. A later round can reach for it if an
author asks.

**D9.** The integer and floating-point split lands as `format: "integer"`. A
`ponytail:` comment in `cel/check.ts:53-56` names this exact papercut. Every
number is a CEL `double`, so `data.count == 5` needs `== 5.0`. D24 settles what
the format does to the CEL type.

### The person field

**D10.** A person field is `{type: "string", format: "person"}` for one person
and `{type: "list", format: "person"}` for several. Adding it to today's enum
would need two members, `person` and `multiperson`. That repeats the
select-and-multiselect split a second time.

**D11.** The stored value is the principal id alone. It carries no name
snapshot. This follows the audit backbone, where an `assignment.claimed` event
payload is `{actorId}`. The display resolves the name. A renamed account
otherwise leaves a stale name in every instance.

**D12.** A person field accepts an actor id or a group id. Ids carry a type
prefix, so the value says which it is. One format covers both.

**D13.** A new assignment strategy, `org.actor-from-field`, takes
`config: {fieldId}`. It reads `ctx.instance.data[fieldId]`. It needs no engine
change: `AssignmentContext` already carries `instance.data`
(`engine/registry.ts:158-163`). A group id resolves through the same path
`org.group-members` uses.

**D14.** A publish-time check confirms that the field an `org.actor-from-field`
step names declares `format: "person"`. This check is what earns the format its
place. Without it an author can point the strategy at any string field. The
error then appears at runtime as an empty candidate list. Assignment resolution
is total (`engine/registry.ts:234-238`), so the instance parks with no
substitute assignee.

**D15.** The people list a picker reads scopes to the body's own
`allowedGroups`. It fails closed: a body declaring no group offers no list. The
`/admin/users` route stays behind `ADMIN_ROLE`. Change 2 does not widen it. D23
confirms this and adds the second layer beside it.

### Booleans and checkbox lists

**D16.** A radio pair for a boolean field carries one value, not a list of
booleans. It takes its Yes and No labels from the locale catalog. An author
wanting other labels, such as Approved and Rejected, declares a two-option
`{type: "string"}` field. That case needs nothing new.

**D17.** Two shapes hide behind "a list of checkboxes", and one rule separates
them. Ask whether the entries need separate CEL access and separate
requiredness. Separate access means separate `{type: "boolean"}` fields inside
a `group`. One question with several answers means one `{type: "list"}` field
with options and `control: "checkboxes"`. This rule belongs in
`docs/authoring-guide.md`.

**D18.** The current renderer offers `<select multiple>` for a multiselect
field and no alternative. A checkbox list is the better control for a short
option set. The `control` key is what makes it reachable.

### What change 1 ships

**D19.** A `format` validates its value. The check joins `typeMatches`, the one
type rule that submission (`runtime/api.ts:881`) and outbox writeback
(`outbox.ts:295`) already share. Without value validation, no reader outside
the renderer would touch `date`, `datetime` or `email`. Those members would
then be controls, and the `format` axis would collapse into `control`.
Validation is what keeps the two axes apart.

A second reader confirms the decision. ISO-8601 sorts correctly as text, so a
reporting column over a date field needs no Postgres date type. That holds only
while every stored value is ISO-8601. The check is what makes the column
trustworthy. A literal `FieldDef.default` faces the same check at publish time,
because an author writes that value.

**D20.** Change 1 ships four `format` members: `date`, `datetime`, `integer`
and `email`. Each one has a value domain that a regex or a number check
settles. None of them needs a new dependency or a new widget.

The `person` member waits for change 2, which brings the strategy and the
people list it needs. The `richtext` member waits for a change of its own. Its
value is markup, so it raises storage, sanitizing and editor questions.
Markdown storage is the cheaper answer to the first of those.

The `image` and
`signature` members refine a `file`. Files are opaque today. The `JS_TYPE`
record maps `file` to `any`, and `FieldForm:207` renders one in the free-text
fallback. A format over an unbuilt type buys nothing.

The `email` member is the weakest of the four, because `validation.pattern`
already covers it. It ships anyway. It reaches `<input type="email">`, a native
control, instead of twelve hand-written regexes.

**D21.** Change 1 ships three `control` members: `multiline`, `radio` and
`checkboxes`. Each one reaches a native HTML control: a `<textarea>`, a radio
pair, a checkbox group.

An omitted `control` key means the default control for the type. A boolean gets
a checkbox, and a field with options gets a dropdown. Every body written today
stays valid, because none of them carries the key. The `slider` and `stars`
members wait. Neither one is native, and both need their own keyboard and
screen-reader work. Nobody has asked for them.

**D22.** A publish-time check rejects a `format` or a `control` that the field's
`type` does not allow. A field of `{type: "string"}` cannot take
`format: "integer"`, and it cannot take `control: "checkboxes"` either. The
check reads one table of allowed pairs. It belongs in `compile.ts`, beside
`checkTechnicalFields` and `checkFieldKeyFormat`. A hand-written body must not
bypass it, which is the placement rule in
`.claude/rules/authoring-invariants.md`.

**D23.** The people list has two layers. A person field declaring neither
`options` nor `dataSource` reads the body's own `allowedGroups`. An author
declares nothing for that layer. A person field declaring a `dataSource` reads
that source instead, because `dataSource` is orthogonal to `format`.

The second layer is the extension path, and it needs no contract work. A list
by role, a list of the starter's own department, an external directory: each
one is a data source. The registry behind them already takes `db`, already
validates its config at publish time, and already resolves at runtime. D14
still holds, because its check reads `format: "person"` on the field, not the
origin of the options. This answers Q1 and confirms D15.

**D24.** A field with `format: "integer"` reports the CEL type `int`. An author
can then write `data.prioritaet == 3` and `data.anzahl % 2 == 0`. Both fail
today. Every number field reports `double`, a bare `3` is a CEL `int`, and the
library holds no overload for the two together. A `ponytail:` comment at
`cel/check.ts:53-56` records the papercut and names this exact fix.

Two consequences belong in `docs/authoring-guide.md`. Division between two
integers truncates, so `7 / 2` is `3`. An expression mixing an integer field
with a decimal field finds no overload and fails the check.

The blast radius is small. An earlier draft of this record claimed the change
reaches every published guard that compares a number. It does not. The format
is opt-in, and no field carries it today. Existing number fields keep `double`,
and published bodies are frozen. The change reaches only a field an author
newly marks, and the studio reports it at publish time.

**D25.** Change 1 drops `reference`. Its CEL type, its JS type and its rendered
control are those of a `string` (`cel/check.ts:65`, `definition.ts:378`,
`FieldForm.tsx:207`). One line separates the two: `defaultValueLogic.ts:25`
refuses it a default value. No definition under `examples/` declares one. Every
`{type: "reference"}` becomes `{type: "string"}`, and nothing changes.

## What stays out of scope

**S1. Item list.** A repeating sub-table of rows and columns breaks the flat
`data` object keyed by `fieldId`. The definition contract promises that
flatness. Under a sub-table, CEL sees `dyn` and the generated columns find
nothing. It is the most-requested shape in real BPM work, so it gets its own
change, change 4. Record it as an open question in `docs/decisions.md`.

**S2. Display elements.** A chart, a read-only table, a markup block and a tab
panel carry no participant value. They belong in the `view`, beside the field
references it already holds. Putting them in the type enum would repeat the
mistake this record removes. Change 3 carries them.

**S3. Catalog scope.** Reuse of one field across several processes raises a
scoping question. The catalog is per-process today. Out of scope.

**S4. Hierarchical option sets.** A choice tree is a property of the data
source that supplies the options. It is not a property of the field that binds
to that source. Out of scope.

**S5. Per-step `control`.** See D8.

## The four changes, in order

| # | Change | Depends on |
|---|---|---|
| 1 | The `type`, `format` and `control` split | none |
| 2 | Person field, `org.actor-from-field`, people list | 1 |
| 3 | Display elements in the `view` | none |
| 4 | Item list | 1 |

Only the step from 1 to 2 is a hard dependency. Change 3 touches the `view` and
can run beside the others.

## What change 1 touches

This list lets the change size itself before it starts.

Engine and schema:

- `src/schema/definition.ts`: `baseFieldType`, `fieldDef`, `JS_TYPE`,
  `typeMatches`, `leafFields`
- `src/cel/check.ts`: `celType` (`:50`), `fieldTypeById` (`:393`)
- `src/schema/compile.ts`: `checkColumnMapping` (`:509`), which keys off
  `type === "select"` today, and the group checks at `:774`, `:822`, `:949`,
  `:1014`
- `src/engine/definitions.ts`: `isNonScalarFieldType` (`:209`)
- `src/engine/migration.ts`: the `celType` call at `:59`
- `src/runtime/api.ts`: `expectedTypeLabel`, the group check at `:499`
- `src/engine/outbox.ts`: the `typeMatches` call at `:295`

Web:

- `packages/form-ui/src/FieldForm.tsx`: the widget switch at `:160-206`
- `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx`:
  `BASE_FIELD_TYPES` (`:38`) and both pickers
- `packages/web/src/areas/studio/draft/field-type-labels.ts`
- `packages/web/src/areas/studio/draft/field-preview.ts`
- `packages/web/src/areas/studio/panels/shared/defaultValueLogic.ts`
- `packages/web/src/areas/studio/panels/shared/fieldValidationLogic.ts`
- the column-mapping logic and its test

Definitions, docs and specs:

- every field in `examples/`
- `docs/authoring-guide.md`, `docs/current-state.md`, `docs/decisions.md`
- `openspec/specs/definition-contract/spec.md`
- the test suites naming a field type

## Open questions

None. Decisions D19 to D25 answer the six questions this section held. Change 1
can go to a proposal.

Three decisions carry a cost that only an author feels. Watch them once the
first process runs on the new model. Integer division truncates (D24). An
expression mixing an integer field with a decimal field fails the check (D24).
A body declaring no group offers no people list (D15).
