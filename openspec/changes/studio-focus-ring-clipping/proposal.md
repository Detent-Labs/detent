# Proposal

## Why

Four studio scroll boxes cut off the edge of the keyboard focus ring. The
2026-09-11 and 2026-09-13 design audits recorded the defect four times, once
per box: RAIL-3, FIELDS-4, CHANGES-2 and ROW-1 in `docs/decisions.md`. On
2026-09-23 the owner ruled that these four findings get one shared fix. That
fix lands before the per-screen audit bundles, so those bundles drop the four
IDs.

## What Changes

- A new shared token names how far the focus ring reaches past its control.
  That reach is the ring's 2px width plus its 2px offset. The global
  `:focus-visible` rule reads its width and offset from the same tokens.
- The steps rail and the process tab body pad by that reach. The Fields
  tab's entity rail and editor pane do too. The process tab row pads the
  same way. The ring then shows in
  full at every edge of each box.
- The other studio scroll boxes get the same padding wherever a browser sweep
  finds a clipped ring.
- The ring itself keeps its look: 2px accent at 2px offset. No inset ring
  replaces it.
- `DESIGN.md` and `.claude/rules/design-language.md` state the new rule.
  `docs/decisions.md` records the four findings as resolved. Its audit section
  headings adopt the owner's per-screen bundling ruling.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `spa-accessibility`: a new requirement says a scroll box leaves room for
  the focus ring of every control inside it.

## Impact

- `packages/web/src/shell/tokens.css`, `packages/web/src/shell/global.css`.
- `packages/form-ui/src/tokens.stylex.ts` gets one new token group.
- `packages/web/src/areas/studio/panels/StepsRail.tsx`, `EntityTabs.tsx`,
  `ProcessTabRow.tsx` and `screens/EditScreen.tsx`. The sweep may add other
  studio scroll boxes.
- `DESIGN.md`, `.claude/rules/design-language.md`, `docs/decisions.md` and
  `docs/browser-checks.md`.
- Content in each padded box moves 4px inward. No engine code, API or
  definition contract change.
