## Why

A user asked how to spot the initial step in the Process Editor canvas at a
glance. The only marker was a small incoming arrow, easy to miss next to the
terminal steps' explicit stamp. Adding a matching stamp surfaced a second,
unrelated gap during testing.

The terminal step's `outcome` field was a free-text input. It let an author
type a value `contract.outcomes` never declared. That failed only later,
with a raw Zod message (`terminal outcome 'STRING' is not in
contract.outcomes`). Both fixes are already implemented and verified in a
browser. This change brings `openspec/specs/studio-canvas/spec.md` back in
sync with them.

## What Changes

- The canvas renders a "start" stamp on the initial step's node: top-left
  corner, unrotated. It mirrors the existing terminal-outcome stamp
  (top-right corner, tilted). The existing incoming arrow stays unchanged,
  alongside it.
- The fit-to-view framing rule already names the two rendered elements that
  extend past a step's rectangle. It now also covers the new stamp.
- The Steps panel's `outcome` field renders as a `<select>` constrained to
  `contract.outcomes` whenever the process has a contract. That replaces the
  free-text input for the contracted case. Without a contract, the field
  stays free text; no rule validates it either way.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-canvas`: adds a requirement (with scenario) for the initial step's
  visual marker. Extends the fit-to-view framing requirement/scenario to
  include it. Adds a requirement (with scenario) constraining the identity
  section's `outcome` field to the process's declared `contract.outcomes`.

## Impact

- `packages/web/src/areas/studio/canvas/CanvasView.tsx`: renders the new
  stamp beside the existing terminal-stamp block.
- `packages/web/src/areas/studio/app.css`: `.canvas-initial-stamp` rules.
- `packages/web/src/areas/studio/panels/StepsPanel.tsx`: `outcome` field
  becomes a `<select>` when `draft.contract?.outcomes` is non-empty.
- `packages/web/src/i18n/catalogs/studio.ts`: two new catalog keys
  (`canvas.initialStamp`, `stepSections.outcomePlaceholder`).
- `openspec/specs/studio-canvas/spec.md`: the delta specs this change adds.

No schema, contract, or engine change. No new capability.
