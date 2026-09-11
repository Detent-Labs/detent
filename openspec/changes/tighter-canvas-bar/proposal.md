## Why

An author clicks one step on the canvas and wants it out of the draft. The
canvas bar offers nothing for that. Its Remove control shows only once the
author selects a second step. A single step leaves only through the step page.

The bar also stands 88px tall in every state. That height exists for one
field: a group's name, whose label sits above the input. The field shows only
while a selection matches a group. The rest of the time the bar carries 37px
of empty space above Add step and 25px below it.

The caret menu beside Add step lists three kinds. Add step already adds the
first one, a step someone works, so the menu repeats it.

The owner named all three on 2026-09-11, with screenshots of the Canvas tab.

## What Changes

- The bar shows its Remove control for one selected step too. The label reads
  "Remove step" for one step and "Remove steps" for several. The count and the
  group controls still wait for a second step.
- The caret menu lists two kinds: a call to another process, and an end. Add
  step stays the one control for a step someone works.
- The bar drops its fixed 5.5rem and stands one control row tall, 54px. The
  group name's label moves beside its input. The owner chose this on
  2026-09-11 over a 72px bar that keeps the label above.
- Two design files gain one exception for a field inside a toolbar row: its
  label stands beside the control. Those files are `DESIGN.md` and
  `.claude/rules/design-language.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-canvas`: the Canvas tab's layout, the canvas bar's add controls, its
  selection controls and its panel-parity rule change.
- `studio-guided-vocabulary`: the add control's scenario names the menu's two
  entries and the button beside them.

## Impact

- `packages/web/src/areas/studio/canvas/CanvasBar.tsx`: the menu's kinds, the
  Remove control's condition and label, and the bar and field styles.
- `packages/web/src/i18n/catalogs/studio.ts`: one key for the single-step
  label, and the step-kind note comment.
- `packages/web/test/studio-canvasBar.test.tsx`: the menu's entries, the
  Remove label per selection size and the control order.
- `docs/browser-checks.md`: the canvas bar walk, the multi-step Remove check
  and the destructive walk's canvas bar entry.
- `docs/current-state.md`: the canvas bar entry and the selection summary.
- `DESIGN.md` and `.claude/rules/design-language.md`: the toolbar field
  exception.
- No engine, definition contract, route or catalog change beyond the studio
  key.
