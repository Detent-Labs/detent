## Why

The step inspector reads as a debug panel. Its 22rem column cannot hold a
paths table, three action lists and a plugin editor, so those went behind
tabs. The tabs then hide every fact until an author clicks. The owner named
the result "unfinished", and the shape round on 2026-09-04 locked a
replacement composition.

## What Changes

- **BREAKING.** The structure surface's grid goes away. It held three
  columns. Those were the edit rail, the canvas, and the inspector or checks
  rail. The step bench replaces it. A collapsible canvas ribbon sits above. A
  ruled steps register stands on the left, and the selected step's
  configuration on the right.
- The inspector's behavior zone stops being a tab row. It becomes a register
  of always-visible sections in runtime order. Those are Entry, Assignment,
  Form, Paths, Timers and Exit. Subprocess joins when performed-by reads
  Subprocess. Each head shows its resolved value or count in the mono face,
  and expands in place.
- The identity zone becomes a masthead. It carries a role stamp, the label
  edited inline, and the key and id in mono. It also carries the description,
  performed-by, the initial-step control and the issue count. An overflow
  holds Raw JSON and Remove step.
- The diagnostics drawer goes. Issue counts move to the section heads. The
  collapsed checks rail moves to the ribbon bar.
- The dock goes. Its Changes and Paths tabs become panels-screen views. Its
  Field matrix tab already is one.
- The edit rail's palette moves into the expanded ribbon. The steps register
  carries the add affordance when the draft holds no step.
- The hardcoded assignment warning moves into the studio catalog. The four
  literal class names in `StepsPanel.tsx` go.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-canvas`: the edit screen layout requirement, the inspector
  requirement, the diagnostics drawer requirement, the palette requirement,
  and the five dock requirements. The identity zone's own requirements (key
  derivation, performed-by, outcome constraint) keep their behavior and move
  to the masthead.
- `studio-app`: the canvas-primary editing requirement and the panels screen
  requirement, which gains the Changes and Paths views. The dock's Field
  matrix requirement goes.
- `studio-checks-rail`: the collapsed-summary requirement, whose home becomes
  the ribbon bar.
- `spa-error-reporting`: the edit screen's failure-shape requirement names
  the dock as one of three chrome sites. It also lists the dock's failed diff
  load as one of four paragraphs. Both move.
- `studio-publish`: the checks rail's publish-verdict requirement names three
  placements. Two remain.

## Impact

Every path below sits under `packages/web/src/areas/studio/` unless stated.

Rewritten:

- `screens/EditScreen.tsx`: the structure surface's layout.
- `panels/StepsPanel.tsx`: the configuration pane. `BehaviorTab`,
  `defaultTabFor` and both tab effects go.
- `screens/PanelsScreen.tsx` and `routing.ts`: two new views.
- `panels/ChecksRail.tsx`: the collapsed presentation's host moves.
- `panels/FieldMatrixGrid.tsx`: the `compact` prop loses its one consumer.

New:

- `draft/registerOrder.ts`, `draft/roleStamp.ts`.
- `panels/sectionSummary.ts`, `panels/sectionsFor.ts`.
- `panels/ChangesView.tsx`, `panels/PathsView.tsx`, `panels/pathRows.ts`.
- `canvas/StepsRegister.tsx`.

Deleted:

- `dock/EditorDock.tsx`, `dock/pathRows.ts` and the `dock/` directory.
- `canvas/EditRail.tsx`.

Elsewhere:

- `packages/web/src/i18n/catalogs/studio.ts`: new keys, EN and DE.
- `packages/web/test/`: `studio-editorDock-fieldMatrixTab.test.tsx` goes,
  `studio-dock-path-rows.test.ts` moves, and four new logic tests land.
- `.claude/rules/ui-glossary.md`, `docs/current-state.md`,
  `docs/browser-checks.md`, `docs/decisions.md`: the terms *identity zone*,
  *behavior zone*, *diagnostics drawer*, *dock* and *dock tab* get new names
  or go away.
- No engine, schema, or HTTP work. Nothing touches the definition contract.
