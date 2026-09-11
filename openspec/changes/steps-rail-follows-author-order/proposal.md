## Why

The steps rail's two move controls answer most presses with no visible change.
The rail orders reachable non-end steps by a walk over the paths. A press swaps
two entries in `workflow.steps` instead. Over `examples/it-offboarding.json` no
press moves a row at all. Every step there is reachable, and the one end step
has no neighbour. The owner compared four rendered variants on 2026-09-12 and
chose the author's own order.

## What Changes

- The steps rail lists the draft's steps in `workflow.steps` order. The walk
  over the paths stops deciding where a row stands.
- A move control moves its row in the rail, for every step kind.
- The Forms tab's cards follow the rail, as they do today. That order is now
  the draft's own.
- The rail's number stops meaning distance from the start step. It names the
  step's place in the definition. The canvas carries the flow reading.
- `registerOrder` loses its last consumer and goes. `reachableStepIds` stays,
  because the canvas bar's reachability report reads it.
- No definition, no stored row and no route changes. These controls already
  write the order the serialized JSON prints.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-step-page`: the rail's order requirement states the walk over the
  paths, and one scenario tests it. Both become the draft's own order.
- `studio-canvas`: one requirement repeats the rail's order in its header, its
  body and a scenario. The header names reachability, so the delta removes that
  requirement and adds its replacement.
- `studio-forms-overview`: one sentence pins the cards to the rail's
  reachability order. It keeps pinning them to the rail, without that word.

## Impact

- `packages/web/src/areas/studio/panels/StepsRail.tsx`: the row list.
- `packages/web/src/areas/studio/screens/EditScreen.tsx`: `railOrder`. It feeds
  the current mark, the walk's two ends and the step page's fallback step.
- `packages/web/src/areas/studio/panels/formCardRows.ts`: the card order.
- `packages/web/src/areas/studio/draft/registerOrder.ts`: `registerOrder` goes
  and `reachableStepIds` stays.
- `packages/web/test/studio-registerOrder.test.ts`,
  `packages/web/test/studio-stepsRail.test.tsx`,
  `packages/web/test/studio-formCardRows.test.ts`.
- `docs/current-state.md` and `docs/browser-checks.md`: the passages that name
  the rail's order.
- `docs/decisions.md`: the RAIL-1 entry, which this change closes.
- The decision record is the four-variant mockup:
  `https://claude.ai/code/artifact/8228f354-7e85-4639-9ba4-34c8ddf28547`
