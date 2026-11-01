# Design

## Context

See proposal.md, Why. The Map tab is `canvas/CanvasView.tsx`, one hand-rolled
SVG component of about 1,750 lines. Three things on it print words today:

- The two stamps. Each is a 16-unit circle with 9px mono text. The start
  stamp reads `canvas.initialStamp`. The end stamp reads
  `step.outcome.slice(0, 4)`, or "•" with no outcome. Both read
  `colors.neutral900`, a primitive that `docs/decisions.md` tracks.
- The way-out marks. An automatic guarded path draws its `priority` in mono
  accent above the line. A guardless automatic path draws "else". Below the line,
  a guarded path draws `edgeGuardLabel`. It takes one 16px-high line at 10px,
  cut with an ellipsis. Where the builder cannot read a guard,
  `guardEdgeLabel` returns its CEL source.
- The accessible names. `nodeName` and `canvas/pathName.ts` fill the
  `canvas.nodeLabel*` and `canvas.pathLabel*` templates. Those carry the
  step key, the trigger's enum value, "no guard" and "priority 10".

A double-click on a node opens an inline rename (`inlineRename.ts`, the
`renaming` state and two layout effects). The connect handle is a 7-unit
circle with a crosshair cursor and no tooltip.

`draft/guarded-path-notes.ts` feeds the form preview's note for a guarded
manual path from the same `edgeGuardLabel`. It flags a CEL fallback as `raw`,
and `FormPreview.tsx` sets that in a `<code>` element.

## Shape brief (`/impeccable shape`, Map tab)

The owner pre-approved the concept and asked for no interview. Each point
below marked "assumed" stands in for an answer the interview would have
asked for.

- **Job and audience.** The reader is a process author, in mode Operate.
  They open the Map to see the whole process at once. They look for where it
  starts and ends, and which way out goes where under what condition. They select there, and edit on
  the Steps tab (principle 7).
- **Outcome.** Every mark on the map reads as a word or a sentence the
  author would say. No four-letter cut, no lone "•", no bare number, no
  CEL. The two gestures the canvas owns, drag-to-connect and double-click,
  say what they do before the author tries them.
- **Direction.** The incumbent register stays: ruled nodes, slate lines, the
  stamp as the one mark of state. This is a refinement. Stamps move from
  circles to the register's own stamp: a straight rectangle, mono,
  uppercase, 2px rule, as `design-language.md` describes. The way-out mark
  becomes a short sentence centred on its line, in the body face.
- **Scope.** The Map tab's canvas only. The canvas bar, groups, selection,
  pan and zoom stay as they are. The form preview's note shares the
  sentence function, so it follows.
- **States and ranges.** A label runs from "Go" to a 40-letter German
  compound. An outcome runs from `ok` to `escalated_to_management`. A
  sentence runs from "Otherwise" to two joined clauses with option labels.
  At most five automatic ways out leave one step in the examples (assumed:
  a sixth reads "Number 6").
- **Interaction.** Hover on the connect handle shows a native tooltip.
  Double-click on a node or a way out opens the Steps tab. Single click
  still selects alone. Enter keeps its meaning.
- **Constraints.** The engine under `src/` stays as it is. The catalog is
  English only. Tracked uppercase stays at 11px or above. Nothing animates.
  The node keeps its 180 by 60 size.
- **Anti-goals.** The Map gets no side panel and no hover card. The canvas
  gets no edit control and no new colour. We assume this from the owner's
  taste, which rejects a side inspector and machine chips.

## Goals / Non-Goals

**Goals:**

- One pure module owns every word the canvas prints or announces, so the
  tests read words without a renderer.
- The canvas, the accessible names and the form preview share one condition
  phrase, with no CEL fallback anywhere.

**Non-Goals:**

- The canvas bar's words ("unconnected", the step-kind menu).
- A group box's mono step count.
- The removal focus drop, the caret menu's arrow keys and the Delete key
  (`docs/decisions.md`, canvas entries).
- A shorter default way-out label than "Source → Target".
- Better grammar for a condition that mixes a readable row with a raw one.
  It reads "Only if Amount is greater than 1,000 and a hand-written rule",
  the builder's own phrase.

## Decisions

### D1. One words module: `canvas/mapWords.ts`

It exports pure functions over the draft types and the catalog:

- `stampWords(step, initialStepId)` returns `{ start?: string; end?: string }`.
- `wayOutSentence(path, step, operands)` returns a string, or `undefined`
  where the path has nothing to say.
- `nodeName(step, label, outgoing, stamps)` and `pathName(path, source,
  target, sentence)` return the two accessible names.
- `orderWord(rank)` returns "First" to "Fifth", then "Number {n}".

`canvas/pathName.ts` goes; `mapWords.ts` takes its job.

Alternative: keep the words inline in `CanvasView.tsx`. Rejected: that file
already runs past 1,700 lines. The package `packages/web` has no DOM harness,
so a pure module is the one place a test reads a sentence directly.

### D2. The condition phrase never falls back to CEL

`panels/shared/conditionLogic.ts` replaces `guardEdgeLabel` and
`edgeGuardLabel` with one export, `guardPhrase(src, operands)`. It returns
the complete rows' clauses through `summarizeCondition(…, "phrase")`, with
no capital added. Source that does not parse, or has no complete row,
returns the catalog's `condition.handWrittenHolds`, "a hand-written rule
holds".

`draft/guarded-path-notes.ts` reads `guardPhrase` and drops its `raw` flag.
`FormPreview.tsx` drops the `<code>` branch, and its `cel` style if nothing
else reads it.

The `"source"` reading of `RawRowReading` loses its last caller. The
argument and the type go. `summarizeCondition` then always reads the phrase.

### D3. The way-out sentence

`wayOutSentence` picks one form per path:

| Path | Sentence |
|---|---|
| guarded, automatic, two or more automatic paths on the step, has a `priority` | "{Order}, only if {phrase}" |
| guarded, any other case | "Only if {phrase}" |
| guardless automatic, two or more automatic paths on the step | "Otherwise" |
| guardless manual, or the step's only automatic path | none |

The order ranks the step's automatic paths that carry a numeric `priority`,
lowest first, ties in array order. A guarded path at rank 1 reads "First".
The default carries the highest priority, so it never takes a rank word.

The phrase keeps its own case. A field label reads as the author wrote it,
"Only if Amount is …". A context operand reads lowercase, "Only if the
case's status is …".

Alternative: keep the number badge beside the sentence. Rejected: the
owner rated the bare number cryptic (c1), and the step page already says
"Tried in this order".

### D4. Stamps: `NodeStamp`, an HTML stamp in a `<foreignObject>`

A small component draws one stamp from `{ text, corner, width }`. The host
`<foreignObject>` is 40 units high and ends 8 units below the node's top
edge. A flex column puts the stamp at its bottom, so a second line grows
upward. The start corner aligns left at x = 8. The end corner aligns right,
ending 8 units in from the right edge.

A stamp's width cap is the node width minus 16. When a node carries both,
each takes half of that, minus a 4-unit gap.

The stamp style is the register stamp at canvas scale: `fonts.mono`, 11px,
weight 600, uppercase, `letterSpacing: 0.08em`, a 2px solid rule and
`overflowWrap: anywhere`. Text and rule read `colors.text`, on
`colors.surface`. Reading the role closes the `neutral900` primitive site
that `docs/decisions.md` lists. The host and the stamp take no pointer
events, and the stamp carries `aria-hidden`.

The `rotate(-8)` tilt goes. `design-language.md` tilts a stamp only where
it marks an error.

Alternative: SVG `<text>` with a measured `<rect>`. Rejected: SVG text does
not wrap, and the canvas already hosts every label in a `<foreignObject>`.

### D5. The way-out sentence: `EdgeLabel`, wrapped and centred

The sentence keeps the late pass after every node. Its host
`<foreignObject>` is `width` wide and 52 units high, three 16-unit lines
plus padding. It centres on the route's midpoint. A flex box centres the
text block inside it, so one line and three lines share the midpoint.

The block reads `fonts.body` at 12px, line height 16px, in
`colors.textMuted` on `colors.surface`. It clamps at three lines with
`overflowWrap: anywhere`. The width is `min(200, max(120, segment − 24))`.
The floor rises from 60 to 120, because a wrapped sentence at 60 units
reads one word per line.

The host takes no pointer events. The text block takes them, so the empty
host corners never swallow a press meant for a node.

`NodeLabel`'s clip measurement moves into a hook, `useClipped(ref, text)`.
Both labels read it, so the title shows only where the clamp cut the text.

### D6. The connect handle

A transparent circle of radius 12 sits over the 7-unit dot and carries the
pointer handlers, the cursor and a `<title>`. A transparent fill counts as
painted, so it takes the press. The dot drops its pointer events. The title
reads `canvas.connectHandle`, or `canvas.connectHandleEnd` on an end step.

### D7. Double-click opens the step

The node's `onDoubleClick` calls `onSelectStep(stepId)`, then
`onOpenStepPage(stepId)`, the pair Enter calls. The edge group and the
sentence call `onSelectStep(sourceId, pathId)`, then
`onOpenStepPage(sourceId, pathId)`.

`onOpenStepPage` gains an optional `pathId`. `EditScreen` bumps a counter,
`waysOutRequest`, whenever it receives one, and passes it to `StepPage`.
The page's effect that opens Ways out for a selected way out keys on it
too. The section then reopens when the selected path stays the same. That closes ACCORDION-1. Enter on a focused path passes the `pathId`
too.

A waypoint handle sits outside the edge group and stops its own
double-click, so removing a waypoint opens nothing.

### D8. The inline rename goes

`inlineRename.ts`, `studio-inlineRename.test.ts`, the `renaming` state,
`startRename`, `commitRename`, the rename `<input>`, `renameInput`, and the
layout effect that refocuses a renamed node all go. So does every `isRenaming`
branch on the node. The comment in `panels/stepsPanelLogic.ts` that names
`inlineRename.ts` drops that clause. The catalog key
`stepSections.renameLabel` goes when nothing else reads it.

The keyboard handler keeps its text-field guard. It costs nothing and keeps
the rule general.

### D9. Accessible names in the vocabulary

| Catalog key | Text |
|---|---|
| `canvas.nodeLabel` | "{label}, {kind}, {count} ways out" |
| `canvas.nodeLabelOneWayOut` | "{label}, {kind}, 1 way out" |
| `canvas.pathLabel` | "{label}, from {source} to {target}, {taken}, {sentence}" |
| `canvas.pathTakenManual` | "a person chooses" |
| `canvas.pathTakenAutomatic` | "happens by itself" |
| `canvas.pathTakenUnset` | "not set yet" |
| `canvas.pathNoCondition` | "no condition" |

The kind reads `stepKind.participant`, `stepKind.subprocess` or
`stepKind.terminal`. Then each stamp word joins after a comma, start before
end. The keys `canvas.nodeLabelOnePath`, `nodeLabelOutcome`,
`nodeLabelInitial`, `pathLabelPriority`, `pathLabelNoGuard`,
`pathLabelNoTrigger`, `elseMarker` and `initialStamp` go.

### D10. New catalog keys for the marks

`canvas.startStamp` "Start", `canvas.endStamp` "End", `canvas.endStampOutcome`
"End: {outcome}", `canvas.onlyIf` "Only if {phrase}", `canvas.orderedOnlyIf`
"{order}, only if {phrase}", `canvas.otherwise` "Otherwise",
`canvas.order.1` to `canvas.order.5` "First" to "Fifth", `canvas.order.other`
"Number {n}", `canvas.connectHandle`, `canvas.connectHandleEnd` and
`condition.handWrittenHolds`. Each sentence keeps one key.

### D11. The node's fallback and the catalog control

`stepLabel` falls back to `steps.unnamedStep`, never to `step.key`.
`fieldCatalog.showOnCanvas` reads "Show on the map". The key keeps its name,
since a code identifier stays out of the glossary's reach.

## Risks / Trade-offs

- [The first click of a double-click selects.] → Enter also selects, then
  opens, so the end state matches.
- [A shift-double-click toggles the step twice.] → Authors do not reach for
  that gesture.
- [The hit circle reaches 12 units into the node.] → The label keeps a
  26-unit clearance there. The node body keeps every other press.
- [A wide sentence can overlap a close node.] → It draws last, on its own
  fill, as the old label did. The browser check measures two seeded maps.
- [Without the rename, naming takes one more gesture.] → A double-click
  opens the step page. Its name line takes the name. The concept chose this
  (principle 7).
- [`<foreignObject>` stamps sit outside `getBBox()` measurement] → They do
  not: `getBBox()` counts a `<foreignObject>`'s own box, as it does for the
  node labels today. The browser check confirms Fit to view still frames
  a stamp.

## Migration Plan

No data changes. The draft layout and the definition stay as they are.
