## Context

See `proposal.md` for motivation. The design of record for roadmap stages 30
to 33 is the `design.md` of
`openspec/changes/archive/2026-08-13-canvas-edge-routing-styles`. Its "Stage
32" section settles this one: the subprocess step gains an inset second rule,
radius 0, and no new colour role. No further design pass is due.

What the canvas draws today, in `canvas/CanvasView.tsx`:

- one `<rect>` per step, `rx={2}`, class `canvas-node-rect`, 180 by 60
- a label at `x=10, y=24` and a key at `x=10, y=44`
- an initial stamp at `translate(22, -12)` and a terminal stamp at
  `translate(NODE_WIDTH - 22, -12)`, both above the rectangle
- a connect handle at `cx=NODE_WIDTH, cy=NODE_HEIGHT / 2`, on the right edge

`step.type` is already in scope in that loop. `src/schema/definition.ts:198`
declares it as `"task" | "subprocess"`, so the read needs no widening and no
new prop.

## Goals / Non-Goals

**Goals:**

- Tell a subprocess step from a task step on the canvas alone.
- Keep the marker inside the node, so no node grows and no route moves.

**Non-Goals:**

- A shape per path kind. `canvas-edge-automatic` and `canvas-edge-manual`
  already carry that, and the roadmap entry says so.
- A stamp for the subprocess step. Two stamps already sit above the node, and
  a third would crowd the row above every node.
- An accessible name for a canvas node. No node carries one today. The step
  type stays readable in the inspector, which is where the canvas sends every
  other step property.
- A marker for the child process the step calls. The node has room for one
  more rule, not for another line of text.
- The outer rectangle's own `rx={2}`. The design language sets every radius to
  0, and `--radius-md` is 0 in `tokens.css`. That 2 is a deviation this change
  inherits. Correcting it moves every node and the selection treatment, so it
  belongs in a change of its own.

## Decisions

### The design pass confirmed the doubled rule, and added one constraint

`.claude/rules/design-language.md` and the stage 32 design of record both pin
this. The pass therefore checked the direction rather than replacing it.

The doubled rule reads twice in this subject's own vernacular. BPMN draws a
call activity with a doubled border. A ledger boxes a sub-ledger inside its own
rule. A step that calls another process is both of those things.

The constraint the pass added is restraint. The marker takes no icon, no
second colour and no label. The accent is a stamp in this language. A
subprocess step earns no stamp: it is a step kind, not a case state.

### The marker is a second `<rect>`, inset by 4

A `<rect>` at `x=4, y=4`, `width={NODE_WIDTH - 8}`, `height={NODE_HEIGHT - 8}`,
`rx={0}`. Four is on the design language's 4-point space scale. It also clears
the node's own content. The label and the key start at `x=10`, and the key's
baseline sits at `y=44` against the inset rule's lower edge at `y=56`.

The alternative was a fill or a tint behind the node. The design language
rejects it: a component reads a semantic role, and no role names a subprocess.
A second rule adds no colour at all.

A wider outer stroke was the other alternative, and it loses too. Stroke width
already carries selection, at 1.5 against a selected 2.

### `fill: none` is not optional

An SVG `<rect>` with no `fill` paints black. Stage 30 hit this same bug in
review. `.canvas-edge-hitarea` enclosed area under a five-segment route. It
would have painted a blob over the canvas. A filled rule here would hide the
label and the key under it.

### Stroke weight is the 1px hairline

The design language has two rule weights and nothing between them. The 2px
structural rule separates sections. The 1px hairline separates rows. The inner
rule is subordinate to the outer one, so it takes the hairline.

It reads `--color-border`, the same role `.canvas-node-rect` reads. Light and
dark both follow from the role.

### No pure function decides the marker

`step.type === "subprocess"` is a field read, not interaction logic. The
`studio-canvas` requirement that interaction logic lives in tested pure
functions covers the toggle, the corner sort and the overlap test. A field read
in a render has nothing to extract and nothing a test could hold.

The geometry is four constants against `NODE_WIDTH` and `NODE_HEIGHT`. A named
export for it would be indirection over arithmetic that the JSX states more
plainly.

### The marker draws under the text and over the outer rule

It follows the outer `<rect>` in document order, before the label. SVG paints
in document order, so a later element wins. The label and the key therefore
stay on top.

Paint order is what makes the marker safe beside the connect handle. That
handle sits at `cx={NODE_WIDTH}` with `r=7`, so it spans x 173 to 187. The
rule's right edge sits at x 176. The two overlap by 3. The handle draws after
the rule, so the handle covers it.

The inline rename `<foreignObject>` spans x 6 to 174, against the rule's
verticals at 4 and 176. That leaves 2 either side. A later change that widens
the rename field crosses the rule, so it moves the inset with it.

## Risks / Trade-offs

- **A terminal subprocess step carries both marks.** → The stamp sits above
  the node at `y=-12`. The marker sits inside the node. They cannot overlap.
  The browser check confirms it against a real draft.
- **The rule reads as a table cell when zoomed out.** → It gains no fill and
  no tint. A zoom that loses a 1px hairline loses the node's 1.5px rule too.
  An author at that zoom pans rather than reads.
- **A later stage draws inside the node too.** → Stage 33 puts control points
  on the route, and stage 31 moves the anchors. Neither reaches inside a node.
- **Stage 34 draws a rule around a set of nodes.** → Grouping owns the outside
  of a node. This marker owns the inside. A group boundary that also reads the
  border role would look alike. Stage 34 picks its own treatment against this
  one, since this one ships first.

## Migration Plan

None. The change writes nothing. It reads a field every draft already carries.
The canvas computes the marker rather than reading it from storage. A draft
saved before this change therefore draws the marker the moment it loads.

Rollback is the revert of one commit. Nothing persists.

## Open Questions

None.
