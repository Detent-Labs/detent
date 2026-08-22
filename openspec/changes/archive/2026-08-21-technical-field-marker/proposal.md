## Why

`writtenFieldCounts` (`packages/web/src/areas/studio/draft/view-flags.ts`)
already tells the studio whether a field has a structural writer. Nothing
tells it whether a field should ever be directly editable at all.

Live testing on `detent.org` found `result` on `loan_application`
placeable as `required: true` on an earlier step's form. Only the `check`
step's `subprocess.outputMapping` writes `result`. The `required`/
`readonly` gate (`gate-required-readonly-conflict`) correctly stays off,
because something does write the field.

The entry still means nothing: no participant can ever supply it. A
first-class technical marker lets the studio and the engine both refuse
that shape. It stops an author from discovering the gap in production.
(ROADMAP stage 44.)

## What Changes

- Add `FieldDef.technical?: boolean` to the definition contract. No
  existing body declares it. `technical: false` resolves and compiles
  like absence. It hashes distinctly, the way a declared
  `required: false` already does. `definitionHash` stays unmoved for
  every stored body.
- The engine resolves a technical field as `readonly: true, required: false`
  on every step. This holds whatever the step's view entry says.
  `resolveFields` already forces both flags for a group field. The two new
  lines sit beside those.
- Publish rejects two shapes. This is **BREAKING** only for a body that
  declares `technical: true` and also violates one of them. No existing
  body can: none declares the key today.
  - a view entry naming a technical field that carries `required` or
    `readonly` at all, literal or CEL;
  - `technical: true` on a `type: "group"` field.
- Field catalog: a Technical checkbox on the Field tab. It reaches a
  top-level field and a group's child alike. A group field disables it.
  Checking it also clears every `required`/`readonly` key the draft's
  view entries carry for that field. The box then strands no stale
  key that a builder cannot reach. It confirms first, naming the count
  of keys it will delete.
- Form editor per-step strip stops offering Required/Read-only for a
  technical field.
- Field matrix marks technical rows. It gates their `required`/`readonly`
  cells through `gatedKeys`. It offers those two bulk badges no longer.
  `rowLiveTargets`/`columnLiveTargets` stay unfiltered: the `visible` badge
  shares them.
- Checks rail reports a technical field that no structural writer touches.
  This finding is non-blocking, the inverse of the publish-blocking rule
  above.
- `docs/authoring-guide.md` and `.claude/rules/process-contract.md` gain
  the new key.

Deferred, not part of this change: inferring "technical" from usage.
`EditorIssue` has no dismissal mechanism yet. Inference would also create
a second authority for one fact.

Also deferred: step-order/reachability-aware validation, a separate and
costlier analysis the same roadmap entry raised.

## Capabilities

### New Capabilities

(none. This change extends existing capabilities only.)

### Modified Capabilities

- `definition-contract`: `FieldDef` gains `technical?: boolean`. Publish
  rejects a technical field's view entry carrying `required`/`readonly`,
  and rejects `technical: true` on a group field.
- `runtime-api`: `resolveFields` forces `readonly: true, required: false`
  for a technical field. A submission naming one returns the existing
  `readonly-field` issue.
- `studio-form-editor`: the per-step strip omits Required/Read-only
  controls for a technical field.
- `studio-app`: the field catalog gains the Technical checkbox. Checking
  it clears the field's stale `required`/`readonly` view keys, behind a
  confirmation naming that count. The field matrix marks technical rows
  and offers them no bulk required/readonly badge.
- `studio-checks-rail`: a new non-blocking finding for a technical field no
  structural source writes.

## Impact

- `src/schema/definition.ts` (`FieldDef` type + `fieldDef` Zod schema).
- `src/schema/compile.ts` (new `checkTechnicalFields`, beside
  `checkViewFieldPatterns`).
- `src/runtime/api.ts` (`resolveFields`), and the column-mapping
  write-back (`applyColumnMapping`).
- `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx`.
- `packages/web/src/areas/studio/draft/field-usage.ts`, for the
  `applyTechnicalMarker` mutate recipe. It follows `applyVisibleOverride`
  there.
- `packages/web/src/areas/studio/panels/FieldMatrixGrid.tsx` and
  `fieldMatrixLogic.ts`.
- `packages/web/src/areas/studio/panels/FieldMatrixPanel.tsx`, whose
  legend is a fixed `LEGEND_KEYS` list. The technical row-header marker
  needs a line there.
- a new exported sibling of `checkViewFlags` in
  `packages/web/src/areas/studio/draft/view-flags.ts` for the inverse
  checks-rail finding, plus
  `packages/web/src/areas/studio/draft/validation.ts` to push that
  sibling's issues into the rail.
- `packages/web/src/areas/studio/draft/issues.ts`,
  `packages/web/src/areas/studio/draft/panel-rail.ts` and
  `packages/web/src/areas/studio/screens/PanelsScreen.tsx`. Their
  comments state a structural-check count. They also claim that every
  `view`-source issue anchors on a step.
- `packages/web/src/areas/studio/screens/FormEditorScreen.tsx`, the
  per-step strip.
- `packages/web/src/i18n/catalogs/studio.ts`, for the Technical
  control's label, the matrix row-header marker's, and the clearing
  pass's confirmation message.
- `test/compile-validation.test.ts` for the two publish rejections,
  `test/runtime-api.test.ts` for the forced resolution, and
  `test/definitions.test.ts` for the hash.
- `packages/web/test/studio-fieldMatrix.test.ts` and
  `packages/web/test/studio-viewFlags.test.ts`. Their `gatedKeys`,
  `bulkBadgeOn` and `applyBulkToggle` callers move with the changed
  signature. The latter also gains the inverse finding's own tests.
- `packages/web/test/studio-fieldUsage.test.ts`, for
  `applyTechnicalMarker` and its clearing pass.
- `packages/web/test/studio-draftValidationLogic.test.ts`, for the new
  compile issues' anchoring through `runValidation`.
- a new `packages/web/test/studio-formEditor-strip.test.tsx`, for the
  strip's omitted controls. No form-editor strip suite exists today.
- `docs/authoring-guide.md`, `.claude/rules/process-contract.md`,
  `.claude/rules/authoring-invariants.md` (the compile-pass invariant
  list names every check by function), `docs/current-state.md`,
  `docs/browser-checks.md`, `docs/decisions.md`, `ROADMAP.md` stage 44.
- No change to `packages/form-ui`. A technical field resolves as an
  ordinary read-only field to the participant-facing renderer.
