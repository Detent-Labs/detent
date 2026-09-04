## Why

A process author opens the field catalog to decide what data the process
collects. Today the screen hides where a field acts behind a closed
disclosure. It splits one field across three tabs. It spends a whole column
on a checks rail. The author cannot see the field and its effect at once.

The direction is no-code authoring (`ROADMAP.md` stage 27). The no-code
author leads now, and the developer stays served beside them. The screen's
vocabulary and its layout both follow from that.

## What Changes

- The Fields view splits into two halves under one heading. The left half
  says what the field is: label, kind, required, values, default. The right
  half says where the field acts. It lists the steps that show the field,
  its visibility there, its condition and its column mapping.
- The three tabs (Field, Values, Rules) go away. This is a **BREAKING**
  change for a reader who treats the tab set as stable. The studio is
  pre-1.0, and no stored state names a tab.
- The "Used in" disclosure goes away. Its content becomes the right half.
- The panels screen drops its standing checks column. A field's own checks
  sit at the zone they belong to. The draft-wide checks and the publish gate
  ride in the `collapsed` `ChecksRail` docked at the bottom edge. That
  component exists and serves two sites already.
- The field-catalog rail keeps its nesting, and a field moves into and out of
  a group in place. The group is neither deleted nor rebuilt.
- The move gesture gets a keyboard equivalent, because `spa-accessibility`
  demands one for every drag.
- The empty catalog gets a start state. A fresh draft carrying no field
  today shows one line of text.
- A named field-kind table lands beside `ALLOWED_BY_TYPE` in
  `src/schema/definition.ts` and rides the exports map. The studio reads it
  and composes `type`, `format` and `control` from one entry. No JSON
  definition changes, and the definition contract keeps every rule it states.
- New catalog keys land in the studio catalog, so every new string is
  overridable.

## Capabilities

### New Capabilities

None. The screen this change rebuilds already has a capability.

### Modified Capabilities

- `studio-app`: the Fields view's composition, the field-kind picker, the
  move-between-groups operation, the empty-catalog state, and the panels
  screen's column count. The field matrix's live-cell requirement also loses
  its Rules-tab locator.
- `studio-checks-rail`: the panels screen docks the `collapsed` rail instead
  of standing the full rail in a third column.
- `studio-condition-builder`: the "Only ask this when" row moves from the
  Rules tab to the effect half. The requirement naming that tab changes.
- `spa-accessibility`: the move gesture needs a keyboard equivalent inside
  the same list, not a panel detour.
- `ui-string-overrides`: the new studio strings are overridable under the
  `studio` area, like every studio string today.

## Impact

- `src/schema/definition.ts`: a new exported field-kind table beside
  `ALLOWED_BY_TYPE`. No Zod schema changes, so `definitionHash` and every
  serialized definition stay as they are.
- `package.json`: no new exports entry. The table rides `./schema`.
- `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx` and
  `fieldCatalogLogic.ts`: the rebuild lands here.
- `packages/web/src/areas/studio/screens/PanelsScreen.tsx`: the rail's field
  sub-list gains the move operation, and the screen drops its third column.
- `packages/web/src/areas/studio/draft/issues.ts` and `validation.ts`:
  `EditorIssue` gains a `loc`. Today `validation.ts` reads `item.loc`, resolves
  the entity from it, and drops it. Zone placement needs it.
- `packages/web/src/areas/studio/draft/view-flags.ts` and
  `packages/web/test/studio-edit-panel-rail.test.ts`: both write an
  `EditorIssue` of their own, so the new key reaches them too.
- `packages/web/src/areas/studio/panels/shared/FieldValidationEditor.tsx`: two
  comments name the Rules tab and the issue model the `loc` replaces.
- A new `packages/web/src/areas/studio/panels/fieldCheckZone.ts` and its
  `bun:test`: the pure map from a `loc` suffix to a zone id.
- `packages/web/src/areas/studio/draft/field-usage.ts` and
  `packages/web/test/studio-fieldUsage.test.ts`: the module carries
  `fieldVisibleOverrides` and `applyVisibleOverride` and no `required` twin.
  "Ask for this" needs one.
- `packages/web/src/areas/studio/draft/field-type-labels.ts` and
  `packages/web/test/studio-fieldTypeLabels.test.ts`: the rail row and the
  picker must name one vocabulary, read through catalog keys.
- `packages/web/src/areas/studio/draft/mintField.ts`,
  `packages/web/test/studio-mintField.test.ts` and
  `packages/web/src/areas/studio/screens/FormEditorScreen.tsx`:
  `baseTypeForPaletteKind` holds a second kind table and indexes into the
  engine's instead. The palette keeps its five entries and its behaviour.
- `packages/web/src/i18n/catalogs/studio.ts`: new keys.
- `packages/web/src/areas/studio/app.css`: the three-region layout, its
  narrow-width stacking, and the docked rail's own box on this screen.
- `docs/browser-checks.md`: the move gesture and the narrow-width stack need
  a browser.
- Untouched: the engine's runtime, `packages/form-ui`, the form editor
  palette's own five entries and drag behaviour, and every definition under
  `examples/`.
