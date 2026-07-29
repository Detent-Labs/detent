# Make the browser packages operable without a mouse

## Why

**Primary navigation in three of the four apps is mouse-only.**

- `packages/app/src/screens/TasksScreen.tsx:112` —
  `<li className="app-task-row" onClick={...}>` is the **only** way to open a
  task. `packages/app` exists to let a participant do their tasks; a
  keyboard-only or screen-reader user cannot open any of them. That is WCAG
  2.1.1 Keyboard, Level A, and a total block on the app's sole purpose.
- `packages/admin/src/screens/InstancesScreen.tsx:96` and
  `TimersScreen.tsx:79` — `<tr className="admin-row-clickable" onClick={...}>`
  is the only way to drill into an instance or a timer.
- `packages/studio/src/panels/StepsPanel.tsx:110` (and its editor twin at
  `:99`) — `<div className="step-card-header" onClick={...}>` is the only way
  to expand an existing step. A step added in the current session *is*
  reachable, because `addStep` sets it expanded, which is why the fix is the
  header element itself.

None of these carries `tabIndex`, `role`, `onKeyDown`, or a nested
link/button. A repo-wide grep for `tabIndex|onKeyDown` across all five
packages returns two hits — the same Enter-to-add input duplicated in the
editor's and studio's `ContractPanel.tsx:99`. In Studio, the alternative route
into a step, `CanvasView.tsx`, is entirely `onPointerDown`/`onPointerUp`-driven
with no focusable element, so it is not a keyboard fallback.
`CLAUDE.md`'s Conventions section explicitly requires semantic HTML5 over
`div`/`span` soup and routes all UI work through the design skills.

**`form-ui` conveys required and invalid visually only, and renders a raw
enum as the error message.** The `control` built in
`packages/form-ui/src/FieldForm.tsx:84-126` never receives `required`,
`aria-required`, `aria-invalid` or `aria-describedby` on any of its seven
branches — a repo-wide grep for those four attributes across all five packages
returns zero hits. Requiredness is conveyed only by
`<span className="form-ui-required-marker" title="required">*</span>`.
Validation issues render as `<li key={i}>{issue.kind}</li>`, so a user reads
`missing-required` or `option-not-in-list` verbatim — while the `form-ui` spec
already describes the prop as carrying *messages*, and
`packages/app/src/errors.ts::describeError` already exists as the localized
message layer for every other error in the same app. A secondary defect at the
same site: the `<ul>` sits **inside** the wrapping `<label>` (line 129), which
permits phrasing content only — invalid HTML that also folds the error text
into the control's accessible name. Because `form-ui` is deliberately the one
renderer shared by `packages/app` and the editor Player, every
participant-facing form inherits all of this.

**The Studio canvas re-runs its whole layout on every pointer move.**
`onNodePointerMove` calls `setNodeDrag({...})` per event
(`CanvasView.tsx:125-128`), and the component body has no `useMemo`/`React.memo`
anywhere: `autoPlaceSteps(...)` at `:64` and the `nodePositions`
`filter().map()` at `:71` are bare expressions re-evaluated on every render,
and the two `steps.map(...)` blocks at `:216`/`:276` re-create every edge and
node `<g>` when one node's `transform` changed. Bounded in practice and
unmeasured — `autoPlaceSteps` early-returns once every step has a layout entry,
and its BFS is O(tens) — but it is O(steps + paths) SVG elements per pointer
event on the surface where a dropped frame is most visible, and neither
expression reads `nodeDrag`, so both are pure waste during a drag.

## What Changes

- Row and card navigation becomes a real control: the identifying cell of each
  row wraps a `<button type="button">` (or an `<a href>` where a URL exists)
  and the row-level `onClick` goes away. The row stays hoverable via CSS while
  the target becomes focusable, announced and Enter/Space-operable.
- Both `StepsPanel` accordion headers become the standard disclosure pattern:
  `<button type="button" aria-expanded={isOpen} aria-controls={bodyId}>`.
- `form-ui` threads `required`/`aria-required`, `aria-invalid` and
  `aria-describedby` onto its control, moves the issue list out of the
  `<label>` to a sibling with the referenced `id`, and maps `issue.kind`
  through a localized catalog the way `packages/app/src/errors.ts` already
  does for transport errors.
- `CanvasView` memoizes `autoPlaced` and `nodePositions` on
  `[steps, initialStepId, layout]`, and extracts the node `<g>` into a
  `React.memo` child if profiling after that still shows a problem.

## Capabilities

### New Capabilities

- `spa-accessibility`: one keyboard-operability rule for all browser packages
  — anything that navigates or discloses is a real control, reachable by tab,
  operable by Enter/Space, and announced with its state.

### Modified Capabilities

- `form-ui`: required and invalid state are conveyed programmatically, not
  only visually; the issue list is valid markup outside the label; issues
  render as localized messages rather than raw discriminators.
- `studio-canvas`: the layout computation and node/edge subtrees are
  memoized so a pointer move does not re-run them.

## Impact

- `packages/app/src/screens/TasksScreen.tsx`,
  `packages/admin/src/screens/{InstancesScreen,TimersScreen}.tsx`,
  `packages/studio/src/panels/StepsPanel.tsx`,
  `packages/editor/src/panels/StepsPanel.tsx` (if still present).
- `packages/form-ui/src/FieldForm.tsx` plus its stylesheet — the shared
  renderer, so both `packages/app` and the editor Player change together, by
  design.
- A localized issue-message catalog: `form-ui` takes `locale` as a prop
  already, so the catalog lives with it rather than in each consumer.
- `packages/studio/src/canvas/CanvasView.tsx` — two `useMemo`s, and possibly
  one extracted memoized child.
- CSS changes in three packages: a row's hover/focus styling moves from the
  row element to the contained control, and a focus-visible style must exist
  where none did.
- No engine, HTTP or contract change; no new dependency.
- UI work: per `CLAUDE.md`, implementation goes through
  `/frontend-design:frontend-design` and the installed Vercel skills
  (`web-design-guidelines` in particular) before any of these is reshaped.
