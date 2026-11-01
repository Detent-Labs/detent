# Proposal

## Why

The Map tab speaks in codes. The start step wears a round stamp reading
"START". An end step's stamp cuts its outcome to four letters: "rejected"
reads "REJE". An end with no outcome reads "•".

An automatic way out
prints a bare number or the word "else" above its line. Its condition prints
on one line of 10px text and loses its tail to an ellipsis. A condition the
builder cannot read prints as CEL.

The canvas also hides its two gestures. Nothing says that the dot on a node's
right edge draws a way out. A double-click opens an inline rename that
nobody explains. Principle 7 of stage 64 says the canvas is the map. It shows
and selects, and editing happens in the guided step list.

A screen reader hears engine words on the canvas: the step's key, "outgoing
paths", "trigger", "manual", "no guard" and "priority 10". Principle 2 says
a key appears only after the author opens the Developer view.

The owner rated c1, "Cryptic canvas stamps", "bothers me", and M3, "Canvas
affordances", "indifferent". The concept's D5 to D8 session confirmed the
fix. The Map keeps labelled stamps and gains a tooltip on the connect handle.
A double-click opens the step, and edge labels become sentences that wrap.
This is change 5 of stage 64 (`docs/studio-ui-concept.md`, section 8). It
builds on change 4, which shipped on 2026-10-31.

## What Changes

- The start step's stamp reads "Start". An end step's stamp reads "End", or
  "End: rejected" with its whole outcome name. Both stamps are rectangles in
  the mono stamp face at 11px. They sit straight on the node's top edge, in
  opposite corners. A long outcome wraps to a second line and is never cut.
- A way out's line carries one sentence, in the author's words. A guarded
  way out reads "Only if Amount is greater than 1,000". A step can have two
  or more automatic ways out. Each guarded one then leads with its place in
  the order: "First, only if …". The guardless default reads "Otherwise". The
  number badge and the "else" marker go.
- The sentence wraps over up to six lines and sits on its line. It centres
  on the midpoint where the canvas is open. Elsewhere it slides and narrows
  to clear nodes, stamps and other sentences. Text past six lines ends in an
  ellipsis, and the full sentence rides as the hover title.
- A condition the builder cannot read prints "a hand-written rule holds" on
  the canvas, never its CEL text. The form preview's note for a guarded way
  out reads the same words.
- The connect handle carries a tooltip. It reads "Drag to a step to add a way
  out, or to empty space to add a new step." An end step's handle says "An end has
  no way out." The handle's pointer target grows to 24px, and its cursor
  stays a crosshair.
- A double-click on a node opens the Steps tab on that step, as Enter does.
  A double-click on a way out opens its source step on Ways out, as Enter on
  a path does.
- **BREAKING** for authors: the canvas's inline rename goes. The
  step page's name line stays the one place to name a step.
- A node's accessible name drops the key and speaks the vocabulary table:
  "Review, A step someone works, 2 ways out, Start". A way out's name reads
  "Approve, from Review to Done, a person chooses, Only if Amount is greater
  than 1,000".
- A step with no label prints "(unnamed step)" on its node, numbered when
  two or more lack a name. The node no longer falls back to the step's key.
- The field catalog's "Show on the canvas" control reads "Show on the map".
- `src/schema/definition.ts` stays as it is. No API changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-canvas`: the stamps, the way-out sentence, its wrap, the connect
  handle's tooltip, the double-click and the accessible names change. The
  inline rename requirement goes. The node's key fallback goes.
- `studio-form-editor`: the form preview notes a guarded way out. An
  unreadable condition there reads "a hand-written rule holds", never CEL.
- `studio-app`: the field catalog's control reads "Show on the map".
- `studio-condition-builder`: the canvas reads a guard in words with no CEL
  fallback. The requirement that kept raw CEL on the edge goes.
- `studio-step-page`: a repeated open request from the Map reopens Ways out
  for the selected way out.

## Impact

- `packages/web/src/areas/studio/canvas/CanvasView.tsx`: stamps, edge
  labels, connect handle, double-click, rename removal.
- New `packages/web/src/areas/studio/canvas/mapWords.ts`: the pure words for
  stamps, way-out sentences and accessible names. It replaces `pathName.ts`.
- New `packages/web/src/areas/studio/canvas/sentencePlacement.ts`: where each
  sentence stands.
- `packages/web/src/areas/studio/canvas/inlineRename.ts` and its test go.
- `packages/web/src/areas/studio/panels/shared/conditionLogic.ts`,
  `draft/guarded-path-notes.ts`, `panels/FormPreview.tsx`: the condition in
  words with no CEL fallback.
- `screens/EditScreen.tsx` and `panels/StepPage.tsx`: the open request that
  reopens Ways out. `panels/stepsPanelLogic.ts`: one comment.
- `packages/web/src/i18n/catalogs/studio.ts`: canvas keys added, renamed and
  removed. `fieldCatalog.showOnCanvas` reads "Show on the map".
- Tests under `packages/web/test/`, `studio-processSurface.test.ts` and
  `studio-formPreview.test.tsx` among them.
- Docs: `docs/authoring-guide.md`, `docs/browser-checks.md`,
  `docs/decisions-archive.md`, `DESIGN.md` and
  `.claude/rules/design-language.md`. One comment in `draft/guided-labels.ts`.
  Also `docs/decisions.md` (SELECTS-4, SENTENCE-3 and the Show on the canvas
  entry close), `.claude/rules/ui-glossary.md` where it names the canvas's
  words, and `ROADMAP.md` stage 64.
