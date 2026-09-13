## Why

On the Studio Fields tab, Remove field takes a field out of the catalog on one
press. It leaves every reference to that field behind (FIELDS-1 in
`docs/decisions.md`). On the IT Offboarding draft, removing "Access Excel
updated or prepared" raised 8 blocking checks. The four stranded view entries
also made the draft structurally invalid, so the checks rail held back every
CEL check. Removing the group "Processing (Fabrikam)" strands 47 view entries on 10
steps.

The studio has no undo, yet the most destructive action on the tab asks
nothing. Focus falls to the document body after the press, and nothing
announces the removal.

## What Changes

- Remove field asks first, in the studio's own modal dialog, when the removal
  reaches past the field catalog. The dialog names the field and counts each
  kind of reach. A field with no reach leaves at once, as today.
- One draft change takes the field out together with each reference to its id
  outside a plugin config. That covers step view entries, action outputs,
  subprocess output mappings, contract field lists and column mapping targets.
  A removed group also takes its member entries and notes off every step view.
- CEL expressions and plugin configs that name the field stay as they are. The
  dialog counts them, so the author knows the follow-up work before confirming.
- After the removal, keyboard focus lands on the rail entry the tab selects
  next. The tab's live region announces the removal by the field's label.
- The confirmation dialog's focus hook moves out of `ProcessHeaderBar.tsx` into
  a module the studio shares. The header bar's two confirmation dialogs keep
  their behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: removing a field on the Fields tab confirms its reach and takes
  its id references along, apart from plugin configs. It also places focus and
  announces the removal.

## Impact

- New studio code under `packages/web/src/areas/studio/`:
  `draft/field-removal.ts`, `panels/shared/confirmDialog.tsx` and
  `panels/RemoveFieldDialog.tsx`.
- New tests under `packages/web/test/`: `studio-fieldRemoval.test.ts` and
  `studio-removeFieldDialog.test.tsx`.
- Changed studio code: `panels/EntityTabs.tsx`, `panels/FieldCatalogPanel.tsx`,
  `panels/fieldCatalogLogic.ts`, `panels/ProcessHeaderBar.tsx` and
  `screens/EditScreen.tsx`.
- Changed catalog: `packages/web/src/i18n/catalogs/studio.ts`.
- Changed tests: `studio-no-confirm.test.ts`, `studio-fieldCatalogPanel.test.tsx`
  and `studio-fieldCatalogLogic.test.ts`.
- Docs: `docs/browser-checks.md`, `docs/current-state.md` and
  `docs/decisions.md`. The live `openspec/specs/studio-app/spec.md` gains one
  antislop directive.
- No engine code, HTTP route or definition contract rule changes. Every draft
  the studio writes still parses against `src/schema/definition.ts` as today.
