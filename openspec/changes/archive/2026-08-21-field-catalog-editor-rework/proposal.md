## Why

`field-catalog-redesign` (archived 2026-08-20) organized the field editor
into Field / Values / Rules tabs. The Field tab stacks ten pieces in one
flat column at equal visual weight. Key, label, description and type sit
there. Translation status, a group's children, the developer view, the
preview and the usage list join them. All of it comes before Remove
field. The Fields rail row prints a field's label, its friendly type and
its key on two lines.

Using the shipped screen surfaced both as the wrong shape. The tab hides no
content behind a click, so identity competes for attention with
information the author reads less often. The rail row is busier than a
scan needs.

Separately, `field-catalog-redesign` deliberately shipped no editor for
`FieldDef.default`. The key parses and type-checks. No runtime code applies
it (`docs/decisions.md`). `src/cel/check.ts` already type-checks a
`default` Expression at publish time, in the same scope as a guard
(`walkFields`, `result: false, child: false`). Only the runtime read and
the authoring UI are missing. This change closes that gap alongside the
reorganization, since the new Values-tab section it belongs in did not
exist before.

## What Changes

- The Field tab keeps identity (key, label, description, type) always
  visible. Translation status folds into an inline badge beside the label
  input instead of its own list block. The preview ("How it will look")
  and the usage list ("Used in") become collapsed `<details>` disclosures,
  closed by default. Remove field gets a rule and reduced emphasis at the
  tab's bottom (it already sits last).
- The Values and Rules tabs gain zone labels and a rule between zones.
  This is the same visual language the Field tab now uses. Values splits
  into "Where values come from" (data source or options) and "Column
  mapping". Rules splits into "Only ask this when" (the condition row) and
  "Validation".
- New: a "Default value" zone in the Values tab. A literal input matches
  the field's type: text, number, checkbox, or date. A link-styled toggle
  switches it to a raw CEL text input for an Expression default. This
  reuses the toggle affordance the area already uses. It is not the
  guard-shaped `ConditionInput` component, because a default is a value,
  not a boolean.
- New runtime behavior in `createProcessInstance`
  (`src/runtime/api.ts`). The stub instance it already builds today
  stays unchanged. This change inserts a defaulting loop between
  building the working data object and validating it. That working
  object already carries `opts.data` from the start.

  The loop seeds an instance's initial `data` from the field
  catalog's `default` values. It fills only a slot `opts.data` left
  open, so an explicitly submitted value always wins. A `Literal`
  default applies directly.

  An `Expression` default evaluates through
  `src/cel/eval.ts::buildGuardContext(body, stub, actor)`, the same
  builder every other guard evaluation already uses. The `stub`
  argument is the same preliminary `Instance`-shaped object
  `createProcessInstance` already builds for its own validation step.
  It carries a minted id, the initial step, `transitionSeq: 0`, and
  `status` derived the way `store.ts::createInstance` derives it. That
  stub sets `.data` to the working object filled so far.

  That evaluation runs through the already-exported
  `src/cel/eval.ts::evalFieldMap`, called once per field as a
  single-entry map. `evalFieldMap` already evaluates the expression.
  It then pipes a successful result through `coerceJson` before the
  value lands in `data`.

  <!-- antislop: allow sentence-length -->
  <!-- The linter merges this sentence into the one before it, since
  that one ends on a code span; see
  antislop-sentence-split-breaks-on-code-span.md. Read alone, this
  sentence is 17 words. -->
  That is the same two-step, total-per-entry behavior every other
  value-producing CEL site in this codebase already runs. `cel-js`
  models a CEL `int` as a JS `bigint`.

  That call supplies `instance: { id, status, transitionSeq,
  currentStepId }`, matching `INSTANCE_SCHEMA` exactly. That is the
  same scope `src/cel/check.ts` already type-checks a `default`
  Expression against. It also re-keys `data` from field id to field
  `key`, the same remap every other guard context gets. The function
  mints the id and establishes the stub's non-data fields before the
  defaulting loop runs, not after.
- CEL stays total. A raising Expression leaves the field unset, the
  same "no match" treatment a raising guard gets elsewhere. So does an
  Expression whose result `coerceJson` cannot make JSON-safe. This adds
  no new `InstanceEvent` kind: the default is author-controlled
  authoring-time data, not an outbox delivery outcome worth an audit
  trail.
- This change scopes the behavior to leaf fields. A `group` field's own
  default is never read, because its own entry carries no value in the
  flat `data` payload. The walk still visits its children.
- Default-seeding applies only to `createProcessInstance`'s own
  top-level instance creation. A subprocess spawn or a `process.start`
  chain creates its instance through `createSeededInstance` instead. It
  does not seed catalog defaults there (see design.md Decision 5).
- A group's own child field's `default` is authorable only through the
  JSON view. The `SubFieldRow` component is the flat recursive editor
  a group's children use. It gains no Default-value control in this
  change (see design.md Non-Goals).
- The Fields rail row drops to one line: the resolved label, the friendly
  type, the issue mark. The key no longer prints on the rail. It stays
  visible in the Field tab once an author selects that field, where the
  engine's exact-match value already lives.
- `docs/decisions.md`: close the "No default-value editor for
  `FieldDef.default`" entry. Replace it with a record of the runtime-api
  trigger this change landed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: the Fields view editor's internal organization. This
  covers the Field tab's disclosure, the new Default-value zone, and the
  Values/Rules zone sectioning. It also covers the Fields rail row's
  content.
- `runtime-api`: `createProcessInstance` seeds initial `data` from the
  field catalog's `default` values.

## Impact

- `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx`: the Field
  tab's disclosure structure, the new default-value input (a
  literal-or-CEL toggle), the Values/Rules zone dividers.
- `packages/web/src/areas/studio/panels/shared/DefaultValueEditor.tsx`
  (new) and `defaultValueLogic.ts` (new): the Default-value zone's
  component and its pure per-type/CEL-parse logic.
- `packages/web/src/areas/studio/panels/shared/FieldValidationEditor.tsx`:
  its `<summary>` drops the "validation" legend text, since the Rules
  tab's own zone heading now carries it.
- `packages/web/src/areas/studio/screens/PanelsScreen.tsx`: the Fields
  rail row markup drops the key line, pulled into a new
  `PanelsRailFieldRow` component for direct testing.
- `packages/web/src/areas/studio/app.css`: zone-label and divider rules,
  `<details>` disclosure styling, the single-line rail row.
- `packages/web/src/i18n/catalogs/studio.ts`: new zone-heading and
  default-value strings.
- `src/runtime/api.ts`: `createProcessInstance` merges field-catalog
  defaults into `submitted` before validation and column mapping run.
- `src/schema/definition.ts` and `src/cel/check.ts`: unchanged. `default`
  already parses, type-checks and validates at publish time. This change
  adds only the runtime reader and the authoring UI.
- `src/cel/eval.ts`: unchanged. `src/runtime/api.ts`'s new defaulting
  helper calls the already-exported `evalFieldMap` directly;
  `evalMapTotal` and `coerceJson` keep their own existing callers
  unchanged.
- `docs/decisions.md`: closes the default-value-editor entry.
- `docs/authoring-guide.md`: adds a `FieldDef.default` subsection. It
  covers the Literal | Expression shape, and that it seeds
  `createProcessInstance`'s initial data only. It also covers
  catalog-order evaluation with cross-field visibility, and
  total-CEL semantics.
- `docs/browser-checks.md`: fixes the panels-list-and-detail check's
  stale key-listing line. It also adds a dated section. That section
  covers the Field tab's disclosures, the rail row's dropped key, and
  a literal/CEL default write-and-read-back.
- `docs/current-state.md`: extends the Runtime API Layer entry's
  `createProcessInstance` description. It adds default-seeding, the
  threaded validation exemption for an off-view or readonly-defaulted
  field, and the `evalFieldMap`-based evaluation path.
- `packages/web/test/studio-defaultValueLogic.test.ts` (new): the
  Default-value zone's per-type control mapping and CEL-parse logic.
  `packages/web/test/studio-panelsRailFieldRow.test.tsx` (new): the rail
  row prints no key.
  <!-- antislop: allow sentence-length -->
  <!-- The linter merges this sentence into the one before it, since that
  one ends on a code span; see antislop-sentence-split-breaks-on-code-span.md.
  Read alone, this sentence is 12 words. -->
  Disclosure open/closed state needs no suite of its own: it is native
  `<details>` DOM state, not component state (design.md decision 1).
  `test/runtime-api.test.ts` gains cases for a Literal
  default, an Expression default, precedence against `opts.data`, a
  raising Expression that leaves its field unset, and a declared default
  that still leaves a required field `required-missing` at
  `submitAndTransition`.
- A real browser check covers the Field tab's disclosures and the rail
  row. It also covers setting both a literal and a CEL default.
