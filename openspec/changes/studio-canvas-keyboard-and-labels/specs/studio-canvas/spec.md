## ADDED Requirements

### Requirement: The canvas is keyboard-operable, and traversal follows the paths

The canvas SHALL be one stop in the page's tab order. Entering it SHALL place
focus on the entry point the rule below defines. A roving `tabindex` SHALL
move focus inside it, so no node takes a stop of its own.

Each step node SHALL carry `role="button"`, an `aria-label` and that roving
`tabindex`. The `<svg>` SHALL carry `role="application"`, an `aria-label`
naming the graph, and a `tabindex` of its own. The role is load-bearing: a
screen reader's browse mode otherwise consumes an arrow key before the
element's handler sees it.

Arrow keys SHALL move focus. Right SHALL follow an outgoing path. Left SHALL
follow an incoming path. Up and Down SHALL move through the draft's step
order, the order `workflow.steps` holds. Enter SHALL select the focused step
and open its inspector, exactly as a click does. Escape SHALL move focus to
the `<svg>`, which carries the `tabindex` that call needs.

Escape SHALL also move the roving stop itself. The `<svg>` takes
`tabindex="0"`, and every node, path and box drops to `-1`. Tab then leaves
the canvas rather than re-entering it. Re-entering the canvas SHALL restore
the roving `0` to the remembered focus.

A key press originating inside the inline rename field SHALL NOT reach the
canvas handler.

Focus SHALL alternate between a step and a path. Right from a step SHALL move
to that step's first outgoing path, and Right again to that path's target
step. Left from a step SHALL move to its first incoming path, and Left again
to that path's source step. Right from a path SHALL move to its target step,
whichever end the author arrived through. Left from a path SHALL move to its
source step, on the same rule.

Focus SHALL NOT wrap at a boundary. Right on a terminal step SHALL move
nothing, and Left on the initial step SHALL move nothing. Down on the last
step in the draft order and Up on the first SHALL move nothing. The same holds
at either end of a fan.

The step's `aria-label` SHALL name, in order, its resolved label, its key, its
kind, its stamps and its outgoing-path count. The kind SHALL read step,
subprocess or end, the three words the palette uses.

#### Scenario: Tab reaches the canvas and lands on the initial step

- **WHEN** a keyboard author tabs into the canvas
- **THEN** focus lands on the draft's initial step, and the canvas takes one
  stop rather than one per node

#### Scenario: Right walks an outgoing path to its target

- **WHEN** focus sits on a step carrying one outgoing path, and the author
  presses Right twice
- **THEN** focus moves to that path, then to the path's target step

#### Scenario: Left walks an incoming path back to its source

- **WHEN** focus sits on a step carrying one incoming path, and the author
  presses Left twice
- **THEN** focus moves to that path, then to the path's source step

#### Scenario: A step with several outgoing paths reaches each of them

- **WHEN** focus sits on a step carrying three outgoing paths, the author
  presses Right, and then presses Down twice
- **THEN** focus visits the three paths in fan order
- **AND** Right from any of them reaches that path's target

#### Scenario: Up and Down reach a step no path touches

- **WHEN** a draft holds a step with no incoming and no outgoing path
- **THEN** Up and Down still reach it, because they walk the draft's step
  order rather than the graph

#### Scenario: The boundary moves nothing

- **WHEN** focus sits on a terminal step and the author presses Right
- **THEN** focus stays where it is, and no wrap to another step happens

#### Scenario: Enter selects the focused step

- **WHEN** focus sits on a step and the author presses Enter
- **THEN** that step becomes the selection, and the inspector opens on it,
  exactly as a click on the node does

#### Scenario: A screen reader names a terminal step in full

- **WHEN** focus reaches a terminal step labelled "Approved", keyed
  `approved`, carrying outcome `approved` and no outgoing path
- **THEN** its accessible name carries the label, the key, the kind word,
  the outcome and a zero path count

### Requirement: The traversal is a total function over a deep-partial draft

The traversal reads a `Draft`. `DraftOf` makes that type optional at every
level. Every field the traversal touches MAY therefore be absent while an
author edits. The definition contract's fan invariants hold for a published
`ProcessBody`, validated at publish time. This rule SHALL NOT rest on them,
and SHALL define an outcome for every input below.

A focus SHALL name one of four things: a step, a path, a group, or the `<svg>`
root. The collapsed-group rule returns the third. The entry-point rule returns
the third or the fourth.

A step carrying no `id` SHALL be unreachable. It SHALL hold no place in the
Up/Down order. A path carrying no `id`, and a path carrying no `to`, SHALL
each be unreachable in the same way. The canvas already draws none of the
three as an identified element.

A path whose owning step carries no `id` SHALL be unreachable too. The canvas
draws no path at all for such a step, whatever that path itself carries.

A path SHALL resolve both ends. A path whose `to` names no step in
`workflow.steps` SHALL be unreachable. So SHALL a path whose source and target
sit in one collapsed group. The canvas draws neither.

A group SHALL draw a box only where two of its members resolve to steps the
draft holds. Below that it draws none, hides none of its members, and offers
no entry point. Its members stay drawn and reachable, so the traversal SHALL
NOT read a group's collapsed flag alone.

Fan order SHALL take the step's own `paths` array as its base, filtered to the
reachable paths. One condition SHALL admit `priority` as a refinement. Every
path in the fan carries `trigger: "automatic"`. And every one carries a
`priority` that no sibling in the fan repeats. The fan SHALL then order by
`priority`, ascending.

A fan that fails that condition SHALL keep array order. Three shapes fail it:

- a fan mixing manual and automatic paths
- a fan where one `priority` is absent
- a fan where two paths share one `priority`

A path carrying no `trigger` SHALL keep its array place. Its presence SHALL
put its whole fan into array order. No ordering comparison SHALL read an
absent `priority`.

The entry point SHALL resolve in four steps. It is `workflow.initialStep`
where that names a reachable step. Otherwise the first reachable step in
`workflow.steps` order. Otherwise the first group box the canvas draws.
Otherwise the `<svg>` itself, which SHALL then carry `tabindex="0"` so the
canvas keeps its stop. Where `initialStep` names a step hidden inside a
collapsed group, the entry point SHALL be that group's box.

Where the current focus stops being reachable, the focus SHALL fall back to
that entry point. Collapsing the group around the focused step is one such
case. Deleting the focused step or its path from a panel is another. Some
element inside the canvas SHALL always carry the tab stop.

#### Scenario: A fan missing one priority keeps array order

- **WHEN** a step carries three automatic paths and one of them declares no
  `priority`
- **THEN** the fan walks in the order the step's own `paths` array holds,
  and no comparison reads the absent value

#### Scenario: A fan repeating one priority keeps array order

- **WHEN** two automatic paths on one step declare the same `priority`
- **THEN** the fan walks in the step's own array order

#### Scenario: A mixed fan keeps array order

- **WHEN** a step carries one manual path and one automatic path
- **AND** the contract forbids that fan in a published body, while a draft
  can still hold it
- **THEN** the fan walks in the step's own array order, and the traversal
  raises nothing

#### Scenario: An id-less step and an id-less path are unreachable

- **WHEN** a draft holds a step with no `id`, and another step holds a path
  with no `id`
- **THEN** neither takes focus, and neither holds a place in any order

#### Scenario: A path on an id-less step is unreachable

- **WHEN** a step carrying no `id` holds a path with an `id`, a resolvable
  `to`, and both ends outside any collapsed group
- **THEN** that path takes no focus, because the canvas draws no path for a
  step with no `id`

#### Scenario: A draft with no initial step still enters

- **WHEN** a draft declares no `workflow.initialStep`
- **THEN** the entry point is the first reachable step in `workflow.steps`
  order

#### Scenario: A draft with no reachable step keeps its tab stop

- **WHEN** a draft holds no reachable step and no group
- **THEN** the entry point is the `<svg>`, which carries `tabindex="0"`, so
  the canvas stays in the page's tab order

#### Scenario: Collapsing the group around the focused step keeps the stop

- **WHEN** the focused step disappears, because the author collapsed the group
  holding it or deleted it from a panel
- **THEN** the focus falls back to the entry point, and one element inside the
  canvas still carries `tabindex="0"`

### Requirement: A path is a focusable control carrying its own name

Each path SHALL be a focusable control with `role="button"`, a roving
`tabindex` and an `aria-label`. Activating it SHALL select that path and open
its inspector, exactly as a click on its edge group does.

The guard label's own `<div>` SHALL leave the accessibility tree. A pointer
already reaches the path anywhere along its route. The edge group's own
handler and its full-route hit area do that today. What the surface lacks is a
tab stop, a role and a name. The path itself now carries all three.

The path's `aria-label` SHALL name its label, its source step, its target
step, its trigger and its guard. An automatic path SHALL add its `priority`. A
path carrying no guard SHALL say so.

While focus sits on a path, Up and Down SHALL walk the fan the author arrived
through. A path entered from its source SHALL walk that source's outgoing
set. A path entered from its target SHALL walk that target's incoming set.

#### Scenario: A keyboard author reaches a path's guard

- **WHEN** a keyboard author moves focus to a path and presses Enter
- **THEN** the inspector opens on that path, and the guard it carries is
  reachable for editing

#### Scenario: An automatic path announces its priority

- **WHEN** focus reaches an automatic path carrying `priority: 10` and a guard
- **THEN** its accessible name carries the label, both step names, the
  trigger word, the priority and its guard

#### Scenario: A guardless default says it carries no guard

- **WHEN** focus reaches the guardless automatic path at a step's highest
  priority
- **THEN** its accessible name states that it carries no guard

#### Scenario: The guard label leaves the accessibility tree

- **WHEN** the canvas renders a path carrying a guard
- **THEN** the path itself is focusable and named, and the guard label's
  `<div>` carries `aria-hidden`

### Requirement: A focused canvas element draws a 2px accent ring

The design language fixes the focus indicator at a 2px accent outline, at 2px
offset, on every focusable thing. An SVG element takes no CSS `outline` that
follows its shape, so the canvas SHALL draw the ring as an element.

A step node SHALL carry a ring `<rect>`. It sits three pixels outside the node
on each side. It takes no fill and a 2px accent stroke, painted centered so
the gap reads 2px. A path SHALL carry a ring `<path>` sharing the focused
path's own `d`, with the same fill and stroke.

Each SHALL take `vector-effect="non-scaling-stroke"`, so the canvas zoom does
not scale the 2px the token states.

CSS SHALL hide each ring by default, and SHALL make it visible under
`:focus-visible` on the element that owns it. The rule SHALL read the state
from that pseudo-class rather than from a class the component sets.

The node and the path SHALL each also set `outline: none`. A bare
`:focus-visible` rule in the shell's tokens gives every focused element a 2px
accent outline. A browser paints that outline on an SVG element as a bounding
box. Exactly one ring SHALL draw on a focused element.

Two focus targets draw no ring element and keep that global outline instead.
The `<svg>` root is one, and a group box's disclosure button is the other. The
button is HTML, so the outline follows its shape already.

#### Scenario: The ring appears on keyboard focus alone

- **WHEN** a keyboard author moves focus to a step node
- **THEN** the node draws a 2px accent ring at 2px offset
- **AND** a pointer click on the same node draws none

#### Scenario: Only the drawn ring appears

- **WHEN** a keyboard author moves focus to a step node
- **THEN** the node draws one ring, not the drawn one beside the shell's
  global `:focus-visible` outline

#### Scenario: The ring keeps its width under zoom

- **WHEN** a focused node is on a canvas zoomed to 200 percent
- **THEN** the ring's stroke still measures 2px on screen

### Requirement: A canvas node draws no corner radius

Every rect a step node draws SHALL carry `rx="0"`. The design language admits
no exception to the zero-radius rule. An SVG presentation attribute sits
outside the token system's reach. The attribute SHALL therefore state the zero
rather than omit it.

#### Scenario: The node rect is square

- **WHEN** the canvas renders a step node
- **THEN** its rect carries `rx="0"`, matching the subprocess rect inside the
  same node

### Requirement: A group box is a disclosure, and traversal skips a hidden member

A group box SHALL carry a real disclosure control. That control is a
`<button type="button">` inside a `<foreignObject>` at the box's own corner,
sized to the button rather than to the box. Enter SHALL toggle the group's
collapsed state, through a groups writer the canvas takes as a prop. The
button SHALL sit in the canvas's roving `tabindex`. The box SHALL sit in the
Up/Down step order immediately before its first member.

The button SHALL carry `aria-expanded` reporting the group's collapsed state.
Its accessible name SHALL identify the group by the group's own name.

The canvas SHALL wrap each drawn group's member nodes in a `<g>` carrying a
stable DOM `id`. The button's `aria-controls` SHALL name that `<g>`. That
wrapper SHALL exist in both states. A collapsed group's wrapper holds
nothing, so the attribute never names an absent element.

The button SHALL stop its own pointer events reaching the box's drag handlers.
A press on it SHALL open the group rather than move it.

The selection toolbar's own collapse control SHALL carry the same
`aria-expanded` and `aria-controls`. It writes the same collapsed flag, so the
two controls SHALL NOT report that state two different ways.

A step hidden inside a collapsed group SHALL NOT be focusable. Traversal SHALL
skip it. Where a path's far end hides, Right or Left SHALL land on the
collapsed box. That box is the element the path already anchors on.

#### Scenario: A collapsed group opens from the keyboard

- **WHEN** focus reaches a collapsed group box and the author presses Enter
- **THEN** the group expands, and its `aria-expanded` reports the new state

#### Scenario: Traversal lands on the box rather than a hidden step

- **WHEN** focus sits on a step whose outgoing path targets a step hidden
  inside a collapsed group
- **AND** the author presses Right twice
- **THEN** focus lands on the collapsed group box, not on the hidden step

#### Scenario: A hidden step takes no tab stop

- **WHEN** the author collapses a group
- **THEN** none of its member steps renders a focusable element

#### Scenario: The disclosure is a real button naming what it controls

- **WHEN** the canvas draws a group box
- **THEN** a `<button type="button">` sits in a corner `<foreignObject>` on
  that box, carrying `aria-expanded` and a name identifying the group
- **AND** its `aria-controls` names the `<g>` holding the group's member nodes

#### Scenario: A pointer press on the disclosure moves no group

- **WHEN** the author presses the pointer on a group box's disclosure button
- **THEN** the press reaches the button, and the group starts no drag

#### Scenario: The toolbar's collapse control reports the same state

- **WHEN** a screen reader reaches the selection toolbar's collapse control
- **THEN** it announces the group's expanded state through `aria-expanded`,
  the same attribute the canvas button carries

### Requirement: A step node prints the step's label, resolved for the content locale

A step node SHALL print the step's `label`, resolved against the studio's
content locale with fallback to the draft's `baseLocale`. It SHALL fall back
to the step's `key` only when that resolution yields nothing. It SHALL fall
back to the unnamed-step string only when the step also carries no key.

The node SHALL print the key on its own line below the label. Where the label
line already prints the key, the node SHALL omit the key line. One value SHALL
NOT appear on both lines, in any case.

Changing the content locale SHALL change what every node prints, for a step
carrying a translation in the chosen locale.

#### Scenario: A node prints the label, not the key

- **WHEN** the canvas renders a step keyed `capture` and labelled
  `{ en: "Capture the request" }`, with the content locale `en`
- **THEN** the node's first line reads "Capture the request", and its second
  line reads "capture"

#### Scenario: The content locale switch reaches the canvas

- **WHEN** a step's `label` is `{ en: "Review", de: "Prüfen" }` and the author
  switches the content locale to `de`
- **THEN** the node prints "Prüfen"

#### Scenario: A step with no resolvable label falls back to its key

- **WHEN** a step carries key `capture` and a `label` with no entry for the
  content locale and none for the base locale
- **THEN** the node prints the key on its label line
- **AND** the node draws no key line at all, so `capture` appears once

## MODIFIED Requirements

### Requirement: A step node on the canvas offers an inline rename

The canvas SHALL let the developer rename a step's label directly on
its node. Renaming SHALL NOT need editing the step through the
inspector's identity zone. Committing the rename SHALL write
`step.label` through the same Draft mutation the identity zone's label
input already calls.

The field SHALL open seeded with the step's label resolved for the content
locale, and with nothing else. It SHALL NOT seed from the step's `key`, and it
SHALL NOT seed from the unnamed-step string. A step carrying no entry for the
chosen locale therefore opens an empty field. The developer then writes a
translation, rather than committing a copy of the key as a label.

#### Scenario: Double-clicking a node's label opens an inline text field

- **WHEN** the developer double-clicks a step node's label on the canvas
- **THEN** a text field opens on the node, seeded with the step's current
  label

#### Scenario: Committing the inline rename updates the step's label

- **WHEN** the developer edits a node's inline text field and commits it
- **THEN** the step's `label` updates through the same Draft mutation the
  identity zone's label input calls

#### Scenario: A step with no translation opens an empty field

- **WHEN** the content locale is `de`, a step's `label` carries only its
  base-locale entry, and the developer opens the inline rename
- **THEN** the field opens empty, carrying neither the base-locale text nor
  the step's key

#### Scenario: Enter inside the rename field opens no inspector

- **WHEN** the inline rename is open and the developer presses Enter
- **THEN** the rename commits, and the canvas handler neither selects the step
  nor opens the inspector

<!-- antislop: allow passive-voice -->
<!-- The MODIFIED header must match the live spec byte for byte. -->
### Requirement: Canvas interaction logic is tested as pure functions, independent of rendering

Twelve computations SHALL live in pure modules with `bun:test` coverage. Five
came first: hit-testing, drag-delta computation, the auto-place traversal, the
connection-validity predicate and the fit-to-view computation.

Two arrived with the selection set. One toggles a step in that set. The other
is the marquee's overlap test against node rectangles. The eighth is the edge
route between two anchors.

The ninth is the anchor rule. It takes a node position and the point that node
faces. It returns that node's anchor and the side it leaves on.

The tenth is the route through a waypoint list. It takes two node positions
and the list. It returns one polyline and the index at which each leg of that
polyline begins.

The eleventh is the group rule set. It gives a group's box, the hidden step
ids, and the box a path anchors on.

The twelfth is the keyboard traversal step. It takes the current focus, a key,
the draft's steps and its groups. The traversal reaches a path through its
owning step. A path lives at `workflow.steps[i].paths`, and no separate
collection holds one. It returns the next focus, and it is total over a deep-partial
draft. `packages/web/src/areas/app/screens/inboxLogic.ts` sets that
convention. The tests need not cover the SVG rendering or the pointer-event
wiring.

#### Scenario: Connection validity holds without rendering

- **WHEN** a test gives the connection-validity predicate a step's existing
  paths and a candidate path
- **THEN** it returns accept or reject-with-reason, and the test needs no DOM
  or canvas rendering

#### Scenario: The fit computation holds without rendering

- **WHEN** a test gives the fit-to-view computation a content bounding box and
  a viewport size
- **THEN** it returns a zoom level and a pan offset, and the test needs no DOM
  or canvas rendering

#### Scenario: The selection toggle and the overlap test hold without rendering

- **WHEN** a test gives the toggle a list of ids and one more id
- **AND** gives the overlap test a rectangle and a list of node positions
- **THEN** each returns its own list of ids, and the test needs no DOM or
  canvas rendering

#### Scenario: The edge route holds without rendering

- **WHEN** a test gives the routing computation a source anchor, a target
  anchor and a style
- **THEN** it returns the route's corner points, and the test needs no DOM or
  canvas rendering

#### Scenario: The anchor rule holds without rendering

- **WHEN** a test gives the anchor rule a node position and a facing point
- **THEN** it returns that node's anchor and the side it leaves on
- **AND** the test needs no DOM or canvas rendering

#### Scenario: The group rules hold without rendering

- **WHEN** a test gives the group rules a list of groups and a list of node
  positions
- **THEN** it returns each group's box, the hidden step ids, and the box a
  given step anchors on
- **AND** the test needs no DOM or canvas rendering

#### Scenario: The waypoint route holds without rendering

- **WHEN** a test gives the waypoint route two node positions and a list of
  points
- **THEN** it returns one polyline through every point in that list
- **AND** it returns the index at which each leg of that polyline begins
- **AND** the test needs no DOM or canvas rendering

#### Scenario: The traversal step holds without rendering

- **WHEN** a test gives the traversal step a focus, a key, a draft's steps and
  its groups
- **THEN** it returns the next focus, naming the step, the path, the group or
  the `<svg>` root that takes it
- **AND** the test needs no DOM or canvas rendering
