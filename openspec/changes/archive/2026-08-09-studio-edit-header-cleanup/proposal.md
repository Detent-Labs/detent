## Why

<!-- antislop: allow synonym-rotation -->
<!-- "Edit screen" names the route (packages/web/src/areas/studio/screens/EditScreen.tsx, "the /processes/:id/edit screen" per studio-app's spec); "this change" elsewhere in this document names the OpenSpec change itself. Different concepts, not a rotated synonym. -->
The edit screen's canvas already gives Process Studio a real authoring
surface. Everything above and around it does not match that. Five unstyled
browser `<fieldset>` groups stack before the canvas becomes visible: process
identity, draft actions, content locale, action registry. A duplicate
`<h1>`/header-bar pair reports overlapping status on top of that.

A design exploration (`design-import`, `Process Studio cleanup_1.zip`)
converged on a single-row header plus a left rail. That design folds the
always-visible palette and the three Structure-surface links into one
place. The exploration checked each mockup against the screen's real
behavior instead of inventing one from scratch.

## What Changes

- Collapse the process-identity chrome into one row. It carries the
  editable title, the key in the mono face, and a compact content-locale
  badge. It also carries an unsaved indicator, the existing Structure/JSON
  toggle, and one `⋮` overflow menu.
- Move Save, Discard draft, and Publish into that `⋮` menu. Group them with
  the base-locale control and `ContentLocaleSwitcher`'s add-locale input
  and button under "Process, saved with the draft".
- Move the action-registry selector into the same menu, under its own "This
  session only" group. State in a caption that the registry is never written
  to the draft. This matches `RegistryPanel`'s existing in-memory-only
  behavior; it does not change that behavior.
- Replace the always-visible Step/Subprocess/End palette column with a rail.
  The rail keeps those three entries. It adds a "Process" section listing
  Fields, Data sources, and Contract as readout rows: a count plus a
  chevron. Each row still opens the existing shared `EditPanelsModal` to the
  same view. The modal itself does not change.
- Make the column beside the canvas context-sensitive. It shows the checks
  rail when the author has selected nothing. It shows the step inspector
  when the author has selected a step. In the step-selected state the
  checks rail collapses to a one-line summary docked at the inspector's
  bottom edge.
- **BREAKING (UX only):** the base-locale and action-registry controls
  stop being always visible on the Structure surface. It changes no API
  and no schema. Both move behind the `⋮` menu, one click away.

## Capabilities

### New Capabilities

None. This change relocates and restyles existing surfaces. It introduces
no new author-facing behavior.

### Modified Capabilities

- `studio-canvas`: the four-column layout (palette, canvas, inspector,
  checks rail) becomes three columns. A merged rail holds the palette
  entries plus the Process section. The canvas stays its own column. One
  context-sensitive column shows either the checks rail or the inspector,
  never both. The process-identity header bar gains the content-locale
  badge, the Structure/JSON toggle, and the `⋮` overflow menu. It stops
  being a read-only status strip that sits apart from `DraftToolbar`, and
  becomes the one place draft actions live.
- `studio-checks-rail`: the rail stops being a permanently-expanded column.
  It collapses to a one-line issue-count summary when the author selects a
  step. It expands to the full grouped list only when the author selects
  nothing.
- `studio-app`: the three Structure-surface links (Fields, Data sources,
  Contract) move from a dedicated top nav row into the rail's Process
  section. They still open the same shared modal; only the entry point
  changes. The base-locale control moves from an always-visible
  process-header fieldset into the `⋮` menu. It stays reachable without
  leaving the Structure surface, since the menu opens on that surface, not
  a new route. Visibility changes from always-shown to click-to-reveal.

## Impact

- `packages/web/src/areas/studio/screens/EditScreen.tsx`: the top-level
  composition. Replaces the Back/Versions/Player buttons, the `<h1>`, the
  `ProcessHeader` fieldset, and the `studio-panel-links` nav with the single
  header row. Replaces `StepPalette` in `studio-canvas-layout` with the
  merged rail. Makes `ChecksRail` and `StepsPanel` mutually exclusive by
  selection state instead of both always mounted.
- `packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx`: gains the
  content-locale badge, the Structure/JSON toggle, and the `⋮` trigger.
  Absorbs what `DraftToolbar` currently renders as its own visible buttons.
- `packages/web/src/areas/studio/panels/DraftToolbar.tsx`: its
  Save/Discard/Publish controls move into the new overflow menu. Its
  save, discard, and publish logic does not change.
- `packages/web/src/areas/studio/panels/RegistryPanel.tsx`: relocates into
  the overflow menu. It does not change its `useDraft()` state or
  behavior.
- `packages/web/src/areas/studio/panels/shared/ContentLocaleSwitcher.tsx`:
  its locale-switch dropdown becomes the header row's compact badge. Its
  add-locale input and button move into the overflow menu's "Process,
  saved with the draft" group. Neither changes its `useDraft()` state
  or behavior.
- `packages/web/src/areas/studio/panels/ChecksRail.tsx`: gains a collapsed,
  one-line summary presentation for the step-selected state.
- `packages/web/src/areas/studio/canvas/StepPalette.tsx`: folds into the
  new rail component alongside the Process section. It keeps the same
  drag-source entries and mutation path.
- `packages/web/src/areas/studio/app.css`: new rail, header-row, and
  overflow-menu styles. All three stay on the existing design-language
  tokens: no radius, ruled rows, the mono face for machine values.
- `packages/web/src/i18n/catalogs/studio.ts`: new `en`-only keys for the
  overflow menu's group labels and the registry caption. This catalog
  exports `studioCatalog = { en }`; the studio area's UI chrome ships
  English-only today, so no `de` entry applies.
- No engine, schema, API, or persisted-data change. Every relocated control
  keeps its existing mutation path: `useDraft()`, `mutate()`,
  `setRegistry()`. This proposal changes where a control renders. It does
  not change what the control does.
- Two other studio-area changes are in flight. `fix-canvas-pan-dead-zone`
  touches `CanvasView.tsx`'s Panzoom binding inside the same
  `studio-canvas-layout` grid this change restructures. It should land
  first. `shell-header-actor-name` touches the shell's own `Chrome.tsx`
  header, a different component tree, with no file overlap.
