## Why

The field matrix grid lets an author check a field's `required` and
`readonly` boxes together, on the same step. So does the form editor's
override strip. That combination guarantees a submission failure whenever
nothing else writes the field. The engine already flags this shape. `checkViewFlags`
reports it as a Checks-rail finding, and the field matrix marks the cell.
Both findings stay advisory only, so an author can publish the broken
combination without seeing the warning register. The `visible: false` gate
already disables `required` and `readonly` live, in both surfaces.
`required` and `readonly` never gate each other the same way.

## What Changes

- The field matrix grid (`FieldMatrixGrid.tsx`) disables a live cell's
  `readonly` checkbox once the author checks `required`, and disables
  `required` once the author checks `readonly`. This gate applies only when
  nothing else in the draft already writes that field. That excludes an
  action `output`, a subprocess `outputMapping`, a field's `columnMapping`,
  and a `contract.inputFields` entry. When something writes the field elsewhere,
  both stay independently checkable. A computed or prefilled field
  legitimately needs both.
- The form editor's override strip (`FormEditorScreen.tsx`'s `OverrideField`
  pair) gains the identical gate. The two entry points then agree.
- `gatedKeys` (`draft/view-flags.ts`) takes the draft's written-field set as
  a second argument. It folds this rule into the keys it already returns for
  `visible: false`. Every caller keeps reading one function for "what's
  disabled on this entry right now."
- The field matrix's bulk-toggle eligibility (`fieldMatrixLogic.ts`'s
  `cellEligible`, and so `bulkBadgeOn`/`applyBulkToggle`) reads the same
  written-aware `gatedKeys`. A column or row badge then cannot flip a cell's
  `required` or `readonly` past this gate either.
- `checkViewFlags` and the flagged-cell marker stay unchanged. They keep
  firing for an entry already in this state before the change. Two examples:
  an already-published body reopened as a draft, and a state the JSON
  surface wrote directly. The live gate stops a new conflict from forming
  through the checkbox controls. It does not retroactively clear an
  existing one.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: the field matrix's live-cell `required`/`readonly` controls
  gain a mutual gate when the field stays unwritten elsewhere in the draft.
  That gate mirrors the existing `visible: false` gate. The bulk-badge
  eligibility rule changes to match.
- `studio-form-editor`: the override strip's `required`/`readonly` controls
  gain the identical mutual gate.

## Impact

- `packages/web/src/areas/studio/draft/view-flags.ts`. `gatedKeys` changes
  signature. The change updates every call site in the same commit.
- `packages/web/src/areas/studio/panels/FieldMatrixGrid.tsx`. Live-cell
  checkbox `disabled` computation changes.
- `packages/web/src/areas/studio/panels/fieldMatrixLogic.ts`. `cellEligible`
  and its callers change.
- `packages/web/src/areas/studio/screens/FormEditorScreen.tsx`. The override
  strip's `disabled` computation changes. The screen needs the draft's
  `written` set, which it does not currently compute: it reads
  `mutate`/`contentLocale` off `useDraft()`, not `draft` itself.
- `openspec/specs/studio-app/spec.md`,
  `openspec/specs/studio-form-editor/spec.md`. Delta specs.
