## Why

`packages/studio`'s edit screen (`studio-shell-and-drafts`) carried over
`packages/editor`'s panel-only surface as-is: steps and paths are created and
wired by filling in forms, with no visual layout at all. `packages/editor`
already has a read-only, Mermaid-auto-laid-out graph view, but nothing lets an
author position steps or draw a path by dragging. Studio is meant to supersede
the editor entirely (`ROADMAP.md` #11); the canvas is the piece that makes
that possible — without it, studio is a strict regression from the editor's
(read-only) graph view, not a replacement for it.

## What Changes

- Add an interactive canvas as the primary surface of `/processes/:id/edit`,
  replacing the stacked-panels-only layout with canvas + panels-as-inspector.
- Step nodes: create, drag-to-position, select. Position writes to the
  draft's `layout` column (`{ [stepId]: { x, y } }`, already specified by
  `process-drafts`) via the existing `PUT /drafts/:processId` — no new route,
  no body/hash impact.
- Path edges: create by dragging from a source step to a target step
  ("drag-to-connect"). A drop that would violate the all-manual-or-all-automatic
  rule on the source step's existing paths is rejected inline (no path
  created, reason shown at the cursor) rather than silently allowed and
  caught later by validation.
- Visual encoding of domain facts already in the schema: solid vs. dashed
  line for automatic vs. manual paths, a priority badge on automatic paths,
  a distinct terminal-step marker. Direction: `docs/superpowers/specs/
  2026-07-28-studio-canvas-visual-design.md`.
- Selecting a node or edge opens the existing panel (`StepsPanel`,
  `PathsPanel`, etc.) as a fixed-width inspector beside the canvas instead of
  in the stacked column; the panels' own logic and validation are unchanged.
- No canvas-only creation/deletion of anything the panels can't already do —
  the canvas is an additional way to position and connect, not a new authoring
  capability. Deleting a step or path stays in its panel.

## Capabilities

### New Capabilities
- `studio-canvas`: interactive graph editing on `/processes/:id/edit` — node
  positioning with layout persistence, drag-to-connect path creation with
  inline validity feedback, and the visual encoding of path
  trigger/priority/terminal-outcome facts.

### Modified Capabilities
- `studio-app`: the "Editing is the carried-over panel surface" requirement
  changes — editing is now canvas-primary with panels re-hosted as an
  inspector, not a stacked column. The draft load/save contract
  (`GET`/`PUT /drafts/:processId`, OCC on `revision`, 409-on-conflict) is
  unchanged.

## Impact

- `packages/studio`: new `canvas/` module (node/edge rendering, drag
  interactions, layout↔draft wiring); `EditScreen.tsx` restructured to
  host canvas + inspector instead of a stacked panel column; `app.css` gains
  canvas-specific rules built from existing tokens (no new colors).
- No HTTP route changes — `process-drafts` and `studio-app`'s existing draft
  routes already carry everything the canvas needs (`layout` storage, OCC,
  validation on save).
- One small, non-behavioral engine change: `src/schema/definition.ts`'s
  inline all-manual-or-all-automatic / unique-priority check is extracted
  into a standalone exported function, so the canvas's inline drop-rejection
  and the existing publish-time refinement share one implementation instead
  of two. Already reachable from `packages/studio` through the existing
  `workflow-engine/schema` export — no exports-map change.
- `packages/editor` untouched (same boundary `studio-shell-and-drafts` set:
  this change does not modify `packages/editor`, `packages/app`, or
  `packages/form-ui`).
