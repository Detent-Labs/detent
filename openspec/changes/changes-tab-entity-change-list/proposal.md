## Why

The studio's Changes tab prints a publish's difference as raw JSON, and no
author can read it. One renamed field in `it-offboarding` prints the whole
51-field catalog twice, as a single `fields` entry. The cause is the
difference computation: it compares every list as one value. The field
catalog, the steps, the paths and each step's form are all lists. The
Versions screen prints the same dump.

## What Changes

- The Changes tab lists one row per changed entity. Rows group under seven
  headings, in this order: Process, Fields, Data sources, Steps, Paths, Forms,
  Contract.
- Each row names its entity by label and key, and carries one stamp: added,
  changed or removed. A folded row names up to four properties that changed.
  An open row shows each property's value before and after, in words.
- A label reads in the content locale the editor shows.
- A list entry pairs with its counterpart by its own anchor. Steps, fields,
  paths, timers, actions and data sources pair by `id`. A form entry pairs by
  `ref`, a form tab by `key`, and a field option by `value`.
- A list whose members only moved reads as one order property on its
  container. The property names its list, such as "Step order".
- An open row offers a command that opens the tab owning the entity. It also
  holds a Developer view with the exact JSON path and values.
- The Changes tab count becomes the number of changed entities.
- A press that opens another tab from a Checks row or a Changes row moves focus
  onto that tab. Today focus falls to the page body.
- The Versions screen shows the same list, both for two versions and for a
  draft against its base. It reads side A as before and side B as after, the
  order its migration-plan control already uses. A draft against its base
  reads the base as before. A waiting line stands in place while both bodies
  load.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: the Changes view requirement. Lists stop comparing whole, the
  tab lists entity rows, and its count counts rows.
- `process-version-inspection`: the Versions screen requirement shows the
  entity list and fixes the reading direction. The key-order requirement
  states that a reorder reads as an order property on its container.
- `studio-process-tabs`: a new requirement moves focus onto the tab a Checks
  row or a Changes row opens.
- `spa-accessibility`: the disclosure requirement names the change list. Its
  rows are native pairs, and its Expand all command carries its expanded state.

## Impact

- `packages/web/src/areas/studio/`: `draft/changeSet.ts` (new) builds the row
  list. `panels/ChangeList.tsx` (new) draws it. `panels/ChangesView.tsx` and
  `screens/VersionsScreen.tsx` mount it. `screens/EditScreen.tsx` hands focus
  to an opened tab. `draft/process-tabs.ts` gains `tabForChangeGroup`.
- `packages/web/src/i18n/catalogs/studio.ts` gains the row, property and value
  strings.
- `packages/web/src/shell/tokens.css` and `packages/form-ui/src/tokens.stylex.ts`
  gain the dormant role. `DESIGN.md` and `.claude/rules/design-language.md`
  name it.
- `packages/web/test/studio-changeSet.test.ts` and
  `packages/web/test/studio-changeList.test.tsx` are new.
  `packages/web/test/studio-processTabs.test.ts` gains a case.
- `screens/versionDiffLogic.ts::diffJson` stays, and still feeds each row's
  property values and its Developer view.
- `docs/browser-checks.md`, `docs/current-state.md`, `docs/decisions.md`,
  `.claude/rules/ui-glossary.md` and `openspec/config.yaml` move with the code.
  So does the Purpose of `openspec/specs/process-version-inspection/spec.md`.
- `openspec/specs/spa-accessibility/spec.md` stops counting two disclosures
  across the studio. It counts them on the step page, and names the change
  list's own.
- No engine code, no HTTP route and no part of the definition contract
  changes.
