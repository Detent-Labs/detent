## Why

The edit panels modal hides the checks rail. An author inside it edits field
keys and data source keys. Those two build most of the issues that rail
reports. The rail entry shows a count per view, and that number stands in for
a list sitting behind the backdrop.

Two smaller facts agree. `openPanel` is `useState` in `EditScreen.tsx`. No
link reaches a view. Back does not close it. A reload lands on the canvas.
`FormEditorScreen` met the same problem, and stage 27e routed it.

The dialog measures `min(72rem, 92vw)` by `88vh`. At that size it pays for a
backdrop covering what nobody can see.

Stage 36 left the direction open until somebody took it. The design session ran
on 2026-08-14. It took the routed screen, over a rail-only rework and a canvas
drawer.

## What Changes

- The three process-wide views become a routed sub-state of `edit`, the way
  `formStepId` already is. `Route`'s `edit` entry gains an optional `panel`
  field. The path reads `/processes/:id/edit/panels/:view`.
- The native `<dialog>` goes. The views render as a screen in three columns:
  the index rail, the open view, and the checks rail.
- The Fields, Data sources and Contract links in the canvas rail navigate
  rather than call `showModal()`.
- The checks rail gains a placement. It shows its full grouped list on the
  panels screen. That is the state it shows when an author selects nothing on
  the canvas.
- The glossary term changes with the thing. "Edit panels modal" becomes
  "panels screen".

The canvas goes while an author is on the screen. That is the trade
`FormEditorScreen` already makes, and it buys the checks rail its column.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: the three links navigate to a routed screen rather than open a
  dialog. The shared-modal requirement becomes the panels screen's.
- `studio-checks-rail`: the rail lists on the panels screen, a placement
  beside the three the capability already names.
- `studio-form-editor`: one scenario names `EditPanelsModal` as where an
  author mints a field. That component goes.

## Impact

- `packages/web/src/areas/studio/routing.ts`: the `edit` route gains `panel`,
  and `matchRoute`/`routePath` carry it.
- `packages/web/src/areas/studio/panels/EditPanelsModal.tsx`: becomes the
  screen. The `<dialog>`, its `showModal()`/`close()` effect and its footer go.
- `packages/web/src/areas/studio/screens/EditScreen.tsx`: `openPanel` state
  goes, and the links navigate.
- `packages/web/src/areas/studio/canvas/EditRail.tsx`: it imports
  `PANEL_VIEWS` from the module this work moves, and three of its comments
  name that module.
- `packages/web/src/areas/studio/draft/panel-rail.ts`: the entity counts both
  rails build move here, beside `flattenRailFields`.
- `packages/web/src/areas/studio/app.css`: the modal rules become screen rules.
- `packages/web/src/areas/studio/catalog.ts`: the footer's close-keeps-changes
  key goes, and the screen's own chrome arrives, in EN and DE.
- Tests: `packages/web/test/` for routing, and the browser walk for the rest.
- `.claude/rules/ui-glossary.md`, `docs/current-state.md`,
  `docs/browser-checks.md`, `ROADMAP.md` and `tmp/open-work-priority.md`.
- The three panels keep their internals. `FieldCatalogPanel` is 230 lines,
  `DataSourcesPanel` 103, `ContractPanel` 111, and none of them changes here.
