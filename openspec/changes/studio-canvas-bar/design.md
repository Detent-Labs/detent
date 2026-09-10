## Context

See proposal.md for the motivation. The current Canvas tab body is a flex row.
`CanvasPalette` holds the left 12rem; `CanvasView` takes the rest. `CanvasView`
also draws its own absolutely-positioned toolbar over the top left corner, with
Fit to view, Rounded corners and Arrange.

A multi-step selection renders a fourth thing, the `canvasSelection` aside at
`EditScreen.tsx:860`. It does not float. `styles.tabBody` is a column flex, so
the aside stacks below the canvas region and shortens it. The layout
requirement already forbids a control that changes the canvas height. The bar
therefore settles a tension that exists today.

Three facts shape the approach.

`EditScreen.onPaletteDrop(kind, clientX, clientY)` already takes screen
coordinates alone. It resolves the live SVG through `document.elementFromPoint`
and converts with `svgPointFromClient`. Nothing in it knows the palette exists,
so a new source can call it unchanged.

`.claude/rules/ui-glossary.md` reserves the word rail for a left column holding
a list. Three rails exist and none is horizontal. The glossary also retired
ribbon, ribbon bar and band. None of the three may return.

`styles.tabBody` is already a column flex. A bar rendered before the canvas
region therefore stacks above it with no layout change of its own.

## Shape brief

Mode: Operate. The author is mid-draw on a canvas and wants a step. Success is
one press, with no aim and no travel to a column.

- **Job.** A process author adds a step, deletes a selection, or groups one.
  Every one of those is a canvas action, so they share one row.
- **Direction.** A ledger rule under the tab row carries the bar. One hairline
  separates it from the canvas. Zero radius, no shadow, flush-left content,
  per `DESIGN.md`.
- **Order.** Add step and its caret sit first. The selection report sits next.
  The selection's own controls follow it. Nothing is right-aligned.
- **Anti-goal.** The bar stays out of the way of every other canvas control.
  Fit to view, Rounded corners and Arrange keep their place over the canvas.
- **States.** Nothing selected, one step selected, several selected, and a
  selection matching one group. All four render at one height.

## Goals / Non-Goals

**Goals:**

- One row under the tab row carries every add and selection control.
- The canvas gains the palette's 12rem and loses the floating selection panel.
- The drop-on-path insert survives the move, unchanged.

**Non-Goals:**

- Moving Fit to view, Rounded corners or Arrange. All three keep their place.
- A collapsed or expandable bar. The bar has one state.
- A keyboard shortcut for adding a step. Nothing has one today.
<!-- Why: "edit rail" is a fixed term the live spec already uses. -->
<!-- antislop: allow synonym-rotation -->
- Sweeping the phrase edit rail out of the six requirements that still use it.
  Those name a gesture this change keeps. The word is stale already, and the
  sweep belongs to its own change.

## Decisions

### D1: The canvas region gets the bar as a sibling

`EditScreen` renders `<CanvasBar>` directly above `<div id={CANVAS_BODY_ID}>`.
The bar reads draft state and the selection, which `EditScreen` already holds.
`CanvasView` keeps no knowledge of it.

The alternative was a bar inside `CanvasView`, beside its existing toolbar.
Rejected: `CanvasView` would then need the draft, the selection setters and the
group setters, which `EditScreen` owns. It also measures its own toolbar for
`fitToView`, and a second measured child compounds that.

### D2: A press adds the step at the visible canvas centre

`CanvasBar` reports a kind. `EditScreen` computes the centre of
`#studio-canvas-body`'s client rect. It converts with `svgPointFromClient`,
snaps with `snapToGrid`, then walks right until the point is clear of every
step. It then calls `appendStep`, `onMoveStep` and `onSelectStep`, exactly as
the drop branch does.

The collision test reads resolved positions. Reading the stored
`saveState.layout` blob alone would miss steps. A step the steps rail's foot
created and nobody dragged has no stored entry. `CanvasView` still draws it,
through `autoPlaceSteps`. The press therefore resolves positions the way
`CanvasView.positionOf` does. A new step then lands clear of every step an
author can see.

The alternative was calling `onPaletteDrop` with the centre point. Rejected:
that runs `elementFromPoint` at the centre. A press over an existing node would
then place the new step on top of it.

### D3: Every add control stays a drag source, and the menu stays open during a drag

The button and both menu entries keep `CanvasPalette`'s pointer-capture drag.
The menu entries capture on the item itself. The popover stays open for the
whole drag and hides on release, right before the drop fires.

The alternative was hiding the popover on pointer down. Rejected: a hidden
popover's item leaves the tree, which drops the pointer capture and ends the
drag. The second alternative was making the menu entries press-only. Rejected:
a subprocess step would then lose the drop-on-path insert.

### D4: The menu is a native popover

The trigger carries `popoverTarget` and `aria-haspopup="menu"`. The panel
carries `popover="auto"` and `role="menu"`. `Chrome.tsx` already uses that
pattern for the account menu, including the fixed positioning it computes in
`onBeforeToggle`. Light dismiss, Escape and focus return come from the
platform.

The alternative was `ProcessHeaderBar`'s disclosure pattern. Rejected: that
panel mixes form fields with commands and so has no `role="menu"`. This one
holds two commands and nothing else.

### D5: Add step renders outlined

`.claude/rules/design-language.md` allows one filled accent action per screen.

<!-- Why: "surface" is the project's word for what the studio presents. -->
<!-- antislop: allow synonym-rotation -->
The process surface already spends it on Publish. Add step therefore takes
`btn btn-secondary`, with the caret as a second `btn-secondary` beside it.

This departs from the mockup, which paints Add step in the accent. The Stamp
Rule wins over the mockup: an accent that appears twice on one screen stops
reading as a stamp.

### D6: The bar's height never changes

The bar is one flex row with a fixed `minHeight` and `alignItems: "center"`.
Every state renders inside that row. The group-name input is the tallest child
and sets the value.

A growing bar would shrink the canvas on selection and reflow the graph. The
layout requirement already forbids a control that changes the canvas height.

### D7: One breadth-first walk serves the register order and the bar

`draft/registerOrder.ts` walks the graph today, but returns one flat array. Its
terminal group holds every terminal step, whether or not a path reaches it. The
returned order therefore answers nothing about one step.

An exported `reachableStepIds` takes over the walk. It reads the steps and the
initial step, and answers with a set of ids. Then `registerOrder` calls it and
keeps its own three groups. The bar calls it for the one selected step.

The alternative was a second walk inside the bar. Rejected: two traversals of
one graph drift, and the register's own order is the rule the bar must match.

## Risks / Trade-offs

- A drag from inside an open popover is unusual. Mitigation: the release path
  is the one `CanvasPalette` already ships, and a browser check covers it.
- The popover covers canvas near the button, so a drop there is unreachable.
  Mitigation: the covered area is the top left corner, and the author can pan.
- The word palette leaves the glossary while six spec requirements still say
  edit rail. Mitigation: the new requirement states what edit rail names.
- The delta spec copies two live requirements, which imports their antislop
  findings against a base of zero. Mitigation: the copied directives come with
  them, and the gate runs before the push.

## Migration Plan

No data migrates. No stored draft carries a palette or bar key, and the
layout requirement's own scenario already asserts that. The change is a
front-end swap in one package.

Rollback is a revert of the branch.

## Open Questions

- Does the bar keep a home on a narrow window? The Steps tab drops its rail
  below a breakpoint. The bar has no such rule yet, and a browser check at
  narrow width answers it.
- Should the form editor's own field list keep the word palette? This change
  leaves it alone. A later glossary pass can name it.
