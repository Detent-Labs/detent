## Context

See `proposal.md` for motivation. Roadmap stage 34 split into two deliveries on
2026-08-13. The first, `canvas-multi-select`, shipped the selection set this
one builds on. This is the second, and item 7's four canvas stages all landed
between the two.

What the canvas holds today:

- `selectedStepIds: string[]` in `CanvasView`, with a marquee, a shift-click
  toggle and a group drag that moves every member of the set.
- A third column that shows the set's count and a delete control whenever the
  set holds more than one step.
- `layout` carrying `{ [stepId]: Point }`, `canvasEdgeStyle` and `waypoints`.
- `anchorSideToward(node, point)` in `geometry.ts`, which reads `NODE_WIDTH`
  and `NODE_HEIGHT` from module scope.
- `routeThroughWaypoints(source, target, waypoints)`, which takes two node
  positions.

## Goals / Non-Goals

**Goals:**

- An author names a set of steps and reads that name on the canvas.
- A group folds away, and the graph around it still reads.
- The whole of it stays presentation, invisible to the engine.

**Non-Goals:**

- A nested group. A group holds steps, not other groups. Nothing in the ask
  needs one, and a tree makes every rule below recursive.
- A group as a drop target. Dragging a step into a box does not join it. The
  selection is the one way in, and it is the one the ask names.
- A runtime meaning. A group never reaches `ProcessBody`, so it never reaches
  `definitionHash` either. The engine cannot see one.
- Auto-layout inside a group. A member keeps the position it had.

## Decisions

### The design pass: the box is a rule, and the fold is a surface

A group box is a container, not a control. The design language gives it one
treatment: a 1px hairline in the border role, radius 0, and no fill. The grid
dots stay visible through it, and it never reads as a card.

Its name sits above the box's top-left corner, in the body face at the muted
role. That is how a register labels a section, and it keeps the name out of
the area the members occupy.

A COLLAPSED group is a surface rather than a rule, because it stands in for
the steps it hides. It takes the node's own `--color-surface` fill at the node
size, so nothing behind it stays visible. It carries the group's name and its
member count. The count uses the mono face: it is a number a reader compares, not
prose.

That gives the two states different jobs and one vocabulary. Neither takes a
radius, a shadow, or a colour role the canvas does not already use.

### A step belongs to at most one group

Two groups holding one step would each draw a box around it. A collapse of
one would then hide a member the other still draws. The rule removes the
question rather than answering it.

The group control refuses a selection that any existing group already holds.
That is the whole enforcement, and it needs no repair pass over stored state.

### The group has no position of its own

Its box is the bounding box of its members, plus a margin. Dragging the box
moves the members, and the box follows them.

A stored position would be a second home for a group's location. The two
would drift the moment a member moved on its own.

A COLLAPSED group is the exception, and it needs one point. It takes the
top-left of the box it had when it collapsed. That corner comes from its
members' own positions at that moment. Expanding drops it again.

### Collapse hides members, and the box becomes the anchor

A collapsed group draws at the canvas node size, so it reads as one step in
the row of steps. Its members do not draw, and neither does any path between
two of them.

A path from outside anchors on the box. That is what makes the fold readable:
an author still sees what enters the group and what leaves it.

`anchorSideToward` therefore takes a size, defaulting to the node's.
`canvas-floating-anchors` predicted that generalization in its own risks. The
rule takes two rectangles, and a group's box substitutes for a node's.

`routeThroughWaypoints` takes a size per end for the same reason, and it
defaults the same way. It is the one function `CanvasView` calls per path, and
it reaches `anchorSideToward` on the caller's behalf. A size on the anchor
rule alone would never arrive.

### The selection stays one concept

Clicking a group's box selects exactly its members. The canvas gains no
`selectedGroupId`, and every existing rule that reads `selectedStepIds` keeps
working untouched.

The third column already swaps to a summary when the set holds more than one
step. When that set exactly matches a group's members, the summary shows the
group's own controls instead. No new column state exists.

The alternative was a selection kind of its own. It buys a group an author
selects without its members. Nothing here needs that, and it costs an edit to
every rule that reads the set.

### The rules live in `groups.ts`, beside `selection.ts`

Three computations, all pure. They give a group's box, the hidden step ids,
and the box a step anchors on.

`selection.ts` set that precedent, and the capability requires it.

### `layout.groups` is a list, not a map

A map keyed by group id would read the same. A list keeps the draw order
explicit instead. Two overlapping boxes then stack in a stated order, rather
than in whatever order a key enumeration returns.

An entry the reader cannot parse drops. That is the rule the other two
reserved keys already follow. A group naming a step the draft dropped keeps
its remaining members. A step delete is an ordinary edit, and it must not
strand a box.

A group left with fewer than two members stops drawing. One step in a box is
a box that says nothing.

The name is a plain string, not a `LocalizedText`. Every author-facing string
inside `ProcessBody` carries locales, and this one sits in `layout`, which is
not body. A node position carries no locale either.

## Risks / Trade-offs

- **A collapsed group hides a step an author looks for.** → The box carries
  the member count. Expanding is one control. The checks rail still reports an
  issue on a hidden step, because it reads the draft, not the canvas.
- **Two groups' boxes overlap on screen.** → They may. The list order decides
  which draws on top. Both draw behind every node, so a member never
  disappears.
- **A path into a collapsed group loses its identity.** → Several paths land
  on one box, and their labels stack. Folding costs that, and expanding
  undoes it.
- **A later stage wants nested groups.** → The storage takes it. An entry
  could name a child group id, and every rule below would go recursive. That
  is why this one does not start there. One trigger would move it. An author
  asks to fold a group of groups, on a process where one level of folding
  stops helping.

## Migration Plan

None. A draft with no `layout.groups` draws exactly as it draws today. The key
is additive inside a blob the draft already round-trips opaquely.

Rollback is the revert of one commit. A draft saved with groups then reads as a
draft with an unknown `layout` key, which the store round-trips without
inspecting.

## Open Questions

None.
