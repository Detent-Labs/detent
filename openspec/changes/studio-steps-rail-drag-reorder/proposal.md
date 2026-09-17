## Why

The steps rail (`StepsRail.tsx`) reorders a step with a pair of up/down
chevron buttons per row. The user asked for mouse drag-and-drop instead: "Die
Schritte sollen mit der Maus verschoben werden können. Die Pfeile zum
verschieben brauchen wir nicht." The chevrons go away; picking up a row and
dropping it at a new position becomes the only pointer route.

## What Changes

- **BREAKING**: Remove the rail's `ChevronUp`/`ChevronDown` move buttons and
  their column. Remove the `stepsRail.moveEarlier`/`stepsRail.moveLater`
  catalog strings. Those strings name only those buttons.
- Add mouse drag-and-drop on the rail's rows. An author picks up a row and
  drags it to any position in the list.
- Replace `EditScreen.tsx`'s `onReorderStep(stepId, neighbourId)` adjacent-swap
  handler. A move-to-index operation takes its place, driven by both the drag
  and its keyboard equivalent.
- Keep the move keyboard-operable in the rail itself. The `spa-accessibility`
  capability already carries a general requirement for this. A list offering
  a drag move must answer that same move from the keyboard, in the list
  itself. The moving row keeps focus across the move, and a live region
  announces the result. This change supplies that pattern for the steps
  rail. `spa-accessibility`'s own requirement text does not change.
- Add a drop-position indicator and a dragged-row style, reusing
  `design-language.md`'s existing hairline/selection-mark vocabulary (2px
  open mark, 3px current mark) rather than inventing new visual language.
  Captured via an `/impeccable shape` pass in `design.md`.
- Change the `studio-step-page` capability's rail-row requirement to describe
  the new mechanism. Rows currently name "a control to move the step earlier
  and one to move it later".

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-step-page`: the requirement naming the rail row's earlier/later
  move controls changes. It now describes drag-and-drop reorder to an
  arbitrary position, with a keyboard-operable equivalent, replacing the two
  always-adjacent chevron controls.

## Impact

- `packages/web/src/areas/studio/panels/StepsRail.tsx`: remove the chevron
  buttons, the `move` style, and `Props.onReorder`'s swap signature. Add drag
  handlers, a keyboard move interaction, a drop-indicator affordance, and a
  live region for move announcements.
- `packages/web/src/areas/studio/screens/EditScreen.tsx`: replace
  `onReorderStep`'s adjacent-swap body with a move-to-index handler, and
  change the `StepsRail` mount's prop to match.
- `packages/web/src/i18n/catalogs/studio.ts`: remove
  `stepsRail.moveEarlier`/`stepsRail.moveLater`. Add whatever strings the drag
  interaction and its live-region announcement need.
- `.claude/rules/design-language.md` and `tmp/Detent Design Language.dc.html`:
  change the steps rail passage for the new column set and interaction
  states.
- `packages/web/src/areas/studio/draft/list-ops.ts`: add a pure `moveTo`
  helper, the one array-math function a `bun:test` can exercise with no
  browser.
- `packages/web/test/studio-stepsRail.test.tsx`: fix the existing render
  helper and the "reorder controls" assertions, both written against the
  removed chevrons.
- `docs/browser-checks.md`: add the entry for this change's drag and
  keyboard interaction.
- No dependency change expected: no drag-and-drop library ships in
  `packages/web` today, and native HTML5 drag events (or a pointer-events
  implementation) cover this without adding one.
