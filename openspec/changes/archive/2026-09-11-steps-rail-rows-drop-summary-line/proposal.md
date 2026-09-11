## Why

Each steps rail row prints a second line under the step's label. A task step
reads "A fixed list of people · 32 form fields". The owner finds that line
unnecessary. It doubles the height of each row, so fewer steps fit in the rail.
The step page already shows who works the step and which fields its form
carries.

## What Changes

- A steps rail row carries its number, its label and its two move controls. A
  step with an open issue adds its issue badge. The row has no summary line.
- The line goes for all three step kinds. That covers a task step's assignment
  and field count, a call's process, and an end's outcome.
- The five catalog keys that only this line reads leave the studio catalog.
- The steps rail stops taking the process list. The step page keeps that list
  for its own subprocess picker.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-step-page`: the requirement "The steps rail numbers every step in
  reachability order" leaves. A new one, "The steps rail lists each step by
  number and label", takes its place. Under it a rail row has no summary line.

## Impact

- `packages/web/src/areas/studio/panels/StepsRail.tsx` and
  `panels/stepRailRow.ts` lose the line and the function that builds it.
- `packages/web/src/areas/studio/screens/EditScreen.tsx` stops passing the
  process list to the rail.
- `packages/web/src/i18n/catalogs/studio.ts` loses five `stepsRail.` keys.
- `packages/web/test/studio-stepsRail.test.tsx` and
  `packages/web/test/studio-stepRailRow.test.ts` change with it.
- `docs/current-state.md` and one comment in `draft/guided-labels.ts` name the
  line today.
- The docblock in `draft/registerOrder.ts` cites the retired steps register
  requirement. It changes to cite the added requirement.
- `docs/browser-checks.md` gains one entry for the Steps tab.
- No engine, API or definition contract change.
