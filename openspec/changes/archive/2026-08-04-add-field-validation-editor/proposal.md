## Why

`FieldCatalogPanel.tsx` shows a field's `key`, `label`, `description`, `type`,
`dataSource`, `options` and nested `fields`. It shows `validation` nowhere.
An author may want a minimum amount, a maximum length, a format or a CEL rule.
Today they must open the JSON view and hand-write the object.

Stage 27b, the condition builder over CEL, excluded this site on purpose. The
builder needs a form to mount in, and no form exists. That gap belongs to its
own change, since it asks its own questions.

## What Changes

- `FieldCatalogPanel` gains a validation editor per field, over the six keys
  `fieldValidation` already declares: `min`, `max`, `minLength`, `maxLength`,
  `pattern` and `rule`.
- The editor offers the keys that suit the field's declared type. A `number`
  field shows `min` and `max`. A string-valued field shows `minLength`,
  `maxLength` and `pattern`. A `multiselect` shows the two length keys but not
  `pattern`, since its value is a list. Every type shows `rule`.
- A `file` field and a custom (plugin) type show every key. Neither constrains
  what JavaScript shape its submitted value takes. The engine may apply any of
  them. `boolean` and `group` show `rule` alone, the only key their fixed
  shape can ever trigger. The key set mirrors `checkConstraints` in
  `src/runtime/api.ts:503`, which reads the submitted value's JavaScript type
  rather than the declared one.
- A key a hand-authored body already carries stays visible and editable, even
  when the field's type does not suit it. The editor marks it. It never drops
  it. Stage 27c's mapping form set that rule for a row no catalog declares.
- `rule` uses today's `ExpressionInput`, the raw CEL text input. Stage 27b can
  later replace that one line with its `ConditionInput`. Neither change waits
  for the other.
- `pattern` shows its live-validation issues inline, beside the input. It
  reuses the same check every panel already reads
  (`compile.ts::checkPatterns`), not a second implementation. It never blocks
  the save. `compile.ts::checkPatterns` keeps both checks at publish
  unchanged. It compiles as a JavaScript `RegExp`. It stays under the
  declared length bound.
- Clearing every key removes `validation` from the field. It does not leave an
  empty object behind.

Nothing else changes. No schema change, no new route, no engine change.

## Capabilities

### New Capabilities

- `studio-field-validation-form`: the per-field validation editor in the studio
  area's field catalog panel. It covers the type-driven key set, the inline
  `pattern` checks, and a key that does not suit the field's type.

### Modified Capabilities

None. `studio-app` describes the field catalog panel as one of the carried-over
structural panels. It states no requirement about which of a field's keys that
panel edits.

## Impact

- `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx`: the new editor,
  mounted per field row and per nested group field.
- `packages/web/src/areas/studio/panels/shared/`: one new component for the
  editor. Beside it a `…Logic.ts` module holds the type-to-key mapping and the
  `pattern` checks, following `studio-draftJsonLogic` and its two siblings.
- `packages/web/src/areas/studio/catalog.ts`: the new UI strings.
- `packages/web/test/`: one new test file for the logic module, plus a
  regression test for the fix below.
- `packages/web/src/areas/studio/draft/issues.ts`: a pre-existing field-location
  resolution bug this change's browser verification found. It sent every
  `pattern` structural issue to the process-level fallback instead of the
  field. Fixed alongside this change, since Requirement 4 depends on it (see
  `tasks.md` 4.8).
- `docs/current-state.md`: the field catalog panel's description gains the new
  editor.
<!-- antislop: allow synonym-rotation -->
- `ROADMAP.md`: stage 27b's entry states `field.validation.rule` has no
  authoring surface yet. This change gives it one, so that clause moves.

Untouched: `src/schema/definition.ts`, `src/schema/compile.ts`, every route,
the draft store's shape, and `packages/form-ui`.

One thing is out of scope, and recorded here so the next reader stops looking
for it. That is the text a participant reads when a validation fails. The
`fieldValidation` object carries no message field. One fixed catalog per locale
lives in `packages/form-ui/src/issue-messages.ts`. There `pattern` reads "in
the wrong format", and a failed `rule` reads "This value isn't valid." Making
that text authorable is a schema change and needs its own decision.

Also out of scope: `FieldDef.default`, the second key `FieldCatalogPanel` does
not show.
