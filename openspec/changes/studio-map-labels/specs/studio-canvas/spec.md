## ADDED Requirements

### Requirement: A canvas stamp names its fact in words

The start stamp SHALL read "Start". An end stamp SHALL read "End", or "End:"
and the whole outcome name. A stamp SHALL never cut a word or print a lone
symbol.

A stamp SHALL be a straight rectangle across the node's top edge. It SHALL
read in the uppercase mono stamp face, at 11px or above. A long stamp SHALL wrap to a
second line rather than clip. The stamp SHALL leave the accessibility tree;
the node's accessible name carries its words.

#### Scenario: The start stamp reads its word

- **WHEN** the canvas renders the draft's initial step
- **THEN** that node's stamp reads "Start"

#### Scenario: An end stamp carries the whole outcome

- **WHEN** the canvas renders an end step bound to the outcome `rejected`
- **THEN** its stamp reads "End: rejected", in the stamp's uppercase face
- **AND** no stamp on the canvas reads "REJE" or "•"

#### Scenario: An end with no outcome reads End

- **WHEN** the canvas renders an end step bound to no outcome
- **THEN** its stamp reads "End"

#### Scenario: A long outcome wraps

- **WHEN** an end step binds an outcome name wider than its corner of the
  node
- **THEN** the stamp takes a second line, and every letter of the name shows

#### Scenario: A stamp stays out of the accessibility tree

- **WHEN** the canvas renders a stamp
- **THEN** the stamp carries `aria-hidden`
- **AND** the node's accessible name carries the stamp's words

### Requirement: A way out's sentence wraps on its line

A way out's sentence SHALL wrap over up to six lines. It SHALL sit on its
way out's route, as near the route's midpoint as the room allows. Its width
SHALL stay within a fixed floor and cap.

A sentence longer than six lines SHALL end in an ellipsis. It SHALL carry
the full sentence as its hover title, and only where the lines cut it.

A press on the sentence SHALL select its way out, as a press on the line
does.

#### Scenario: A long condition wraps rather than cuts

- **WHEN** a way out's sentence reads "Only if Amount is greater than 1,000
  and Cost centre is “Finance”"
- **THEN** the sentence shows whole over two or more lines
- **AND** it has no hover title

#### Scenario: A sentence past six lines keeps its full text

- **WHEN** a way out's sentence needs more than six lines at its width
- **THEN** the sixth line ends in an ellipsis
- **AND** the hover title carries the sentence untruncated

#### Scenario: The sentence centres on the route where it has room

- **WHEN** a way out's route crosses open canvas at its midpoint
- **THEN** the sentence's block centres on that midpoint

### Requirement: A way out's sentence clears the nodes, the stamps and the other sentences

A sentence SHALL NOT cover a node, a stamp or another sentence where it can
avoid them. A narrower width or a place further along its route avoids
them. The sentence SHALL first narrow and take more lines. Then it SHALL slide
along its route or across it. Its line SHALL stay inside its block. Where
nothing avoids them, the sentence SHALL take the place that covers least.

#### Scenario: A sentence clears the nodes in a tight column gap

- **WHEN** two steps stand side by side with the 60-unit gap Arrange leaves
- **AND** the way out between them carries a 39-character sentence
- **THEN** the sentence stands inside the gap, over more lines
- **AND** it covers neither step's label nor any stamp

#### Scenario: Two sentences in one gap stand apart

- **WHEN** two ways out run through the same column gap, one above the other
- **THEN** their sentences slide apart along their routes, and neither covers
  the other

### Requirement: The connect handle explains its gesture

The connect handle SHALL carry a hover tooltip that says what a drag from it
does. It reads: "Drag to a step to add a way out, or to empty space to add a
new step." An end step's handle SHALL read: "An end has no way out."

The handle's pointer target SHALL measure at least 24px across at a canvas
scale of 1. Its drawn dot stays the size it is. Its cursor SHALL read as a
crosshair, and as not-allowed on an end step.

#### Scenario: Hovering the handle names the gesture

- **WHEN** the author rests the pointer on a task step's connect handle
- **THEN** the tooltip names both drags: to a step, and to empty space
- **AND** the cursor is a crosshair

#### Scenario: An end step's handle says why it does nothing

- **WHEN** the author rests the pointer on an end step's connect handle
- **THEN** a tooltip reads "An end has no way out."
- **AND** the cursor reads not-allowed

#### Scenario: The handle is easy to hit

- **WHEN** the author presses 10px right of the handle's centre, at a canvas
  scale of 1
- **THEN** the press starts a connect drag

### Requirement: A double-click opens the step on the Steps tab

A double-click on a step node SHALL select that step. It SHALL open the Steps
tab on it, as Enter on a focused node does. A double-click on a way out's
line or sentence SHALL open its source step's Ways out. That way out SHALL be
the selected one, as after Enter on a focused path.

A single click SHALL still select alone and leave the author on the canvas.
A double-click on a waypoint handle SHALL still delete that waypoint, and
SHALL open nothing.

#### Scenario: A double-click on a node opens its step

- **WHEN** the author double-clicks the node of the step "Review"
- **THEN** the Steps tab opens with "Review" as the current step

#### Scenario: A double-click on a way out opens Ways out

- **WHEN** the author double-clicks the line of the way out "Approve" from
  "Review"
- **THEN** the Steps tab opens on "Review", with Ways out open and "Approve"
  selected

#### Scenario: Ways out reopens for the way out already selected

- **WHEN** the author selected the way out "Approve", then folded Ways out
  on the step page
- **AND** the author double-clicks "Approve" on the Map tab
- **THEN** the step page opens with Ways out open again

#### Scenario: A double-click on a waypoint opens nothing

- **WHEN** the author double-clicks a waypoint handle on the selected way out
- **THEN** the waypoint goes, and the Map tab stays open

### Requirement: The midpoint handle opens its way out on a double-click

The selected way out's midpoint handle can stand over its sentence. A
double-click on that handle SHALL open the way out, as a double-click on its
line does. It SHALL NOT add a waypoint.

#### Scenario: The midpoint handle passes a double-click on

- **WHEN** the author selected a way out whose sentence sits at its
  midpoint, under the midpoint handle
- **AND** the author double-clicks that handle
- **THEN** the step page opens on the way out's source step, with Ways out
  open

### Requirement: A step's key auto-derives from its label on the step page

The step page's key field SHALL fill from the step's label as the author
types. That holds while the key is empty or matches the label's prior
derivation. It
SHALL follow the process key's rule. A colliding key SHALL take the next free
suffix: `_2`, then `_3`. The first value typed into the key field SHALL stop
the fill for that step. The step page's name line is the one route that
writes a step's label.

#### Scenario: A new step's key follows its label as the developer types

- **WHEN** the developer, while the studio's content locale is the draft's
  base locale, creates a step from the canvas bar
- **AND** the developer types "Manager review" into its label, having never
  touched its key field
- **THEN** the step's key reads `manager_review`

#### Scenario: A new step's key stays empty while the developer types in a non-base content locale

- **WHEN** the developer has switched the studio's content locale away from
  the draft's base locale
- **AND** the developer creates a step from the canvas bar and types a label
  into it
- **AND** the developer never touches its key field
- **THEN** the step's key stays empty. A newly created step's label seeds
  under the current content locale. Derivation reads only the base-locale
  entry

#### Scenario: A colliding derived step key gets a numeric suffix

- **WHEN** the developer creates a second step and types the same label an
  existing step already carries
- **THEN** the new step's key reads the existing step's derived key with a
  `_2` suffix

#### Scenario: A hand-edited step key no longer follows its label

- **WHEN** the developer changes a step's auto-derived key, then changes that
  step's label further
- **THEN** that step's key stays what the developer typed

#### Scenario: Editing a non-base-locale translation leaves an already-derived step key untouched

- **WHEN** the developer types a base-locale step label, deriving a key, then
  switches the studio's content locale
- **AND** the developer types a translation into the step label's
  non-base-locale entry on the step page's name line
- **THEN** the step's key stays unchanged

## MODIFIED Requirements

### Requirement: Path lines visually encode trigger type, automatic-path priority, and terminal outcomes

An automatic path SHALL render as a solid line and a manual path as a dashed
line.

A path SHALL carry one sentence on its line, in the author's words. A guarded
path reads "Only if" and its condition. A step can have two or more automatic
paths. A guarded one there leads with its place in the order, as in "First,
only if". The guardless default there reads "Otherwise". A guardless manual path, and a lone guardless automatic
path, have no sentence.

The place SHALL count the step's automatic paths by `priority`, lowest first.
A guarded path with no `priority` SHALL read "Only if" alone. No path SHALL
draw a number badge or an "else" marker.

The condition SHALL read in the condition builder's clause words. A
condition with no readable row, and source that does not parse, SHALL read "a
hand-written rule holds". A raw row beside readable rows reads "a hand-written
rule", as the builder's sentence does. The sentence SHALL NOT carry CEL
source.

A terminal step SHALL carry an end stamp. A terminal step bound to a
contract `outcome` SHALL carry that outcome's whole name on the stamp.

#### Scenario: Automatic and manual paths are visually distinct

- **WHEN** a step has an automatic path and, on a different step, a manual
  path
- **THEN** the automatic path renders solid and the manual path renders
  dashed

#### Scenario: Automatic path priority is visible

- **WHEN** a step has two guarded automatic paths at priorities 10 and 20,
  and one guardless default
- **THEN** the first reads "First, only if" and its condition, and the second
  reads "Second, only if" and its condition
- **AND** the default reads "Otherwise"
- **AND** no number and no "else" draws on any of the three lines

#### Scenario: A terminal step shows its bound outcome

- **WHEN** a terminal step is bound to an `outcome` in a contracted process
- **THEN** the step's end stamp carries that outcome's whole name

#### Scenario: A manual path's guard reads as a sentence

- **WHEN** a manual path carries the guard `data.amount > 1000.0` over a field
  labelled "Amount"
- **THEN** its line reads "Only if Amount is greater than 1,000"

#### Scenario: An unreadable guard prints no CEL

- **WHEN** a path's guard reads `size(data.amount) > 3`, which no row of the
  builder reads
- **THEN** its line reads "Only if a hand-written rule holds"
- **AND** the guard's source text appears nowhere on the canvas

### Requirement: The initial step shows a distinct stamp

The canvas SHALL draw a stamp on the node of the draft's
`workflow.initialStep`, distinct from a terminal step's outcome stamp. This
lets an author identify the process's entry point from the canvas alone. An
<!-- antislop: allow negation-habit -->
<!-- Why: the sentence repeats the live spec's wording verbatim. -->
author needs no JSON inspection and no per-step identity check.

The stamp SHALL read "Start". It sits in the node's top-left corner, and an
end stamp sits in the top-right corner.

#### Scenario: The initial step shows its stamp

- **WHEN** a step is the draft's `workflow.initialStep`
- **THEN** the canvas draws that step's stamp, distinct from a terminal
  step's outcome stamp

#### Scenario: Changing the initial step moves the stamp

- **WHEN** the developer sets a different step as `workflow.initialStep`
- **THEN** the stamp moves to the newly chosen step and leaves the previous
  one

#### Scenario: A step that is both initial and terminal shows both stamps

- **WHEN** a step is both the draft's `workflow.initialStep` and terminal
- **THEN** the canvas draws both stamps, in opposite corners, with neither
  stamp obscured by the other

### Requirement: A step node prints the step's label, centred and resolved for the content locale

A step node SHALL print the step's `label`, resolved against the studio's
content locale with fallback to the draft's `baseLocale`. It SHALL print the
step text the step page's selects print. An unnamed step reads the
unnamed-step string, numbered when two or more steps lack one. A label two
steps share adds the rail number. The node SHALL NOT fall back to the step's
`key`.

That resolved text is the only text the node body draws. The node SHALL NOT
draw the step's key on a line of its own. The terminal and initial stamps are
not node body text, and this requirement does not touch them.

The text SHALL wrap inside the node's own width, over at most two lines. It
SHALL stay within the node's four edges at every length. It SHALL also stay
clear of the connect handle on the right edge.

A word wider than that width SHALL break rather than run past it. German
compounds into one long token. A rule that breaks only at spaces therefore
leaves the ordinary German label one line wide and uncut.

Text too long for two lines SHALL end in an ellipsis. The node SHALL carry the
untruncated text as its hover title, and only where the text is cut. A title on
every node, cut or not, stops saying that more text is hiding.

The node's own size SHALL NOT change with the label's length. The label block
SHALL sit centred between the node's top and bottom edges. That holds at one
line and at two, so every node reads from its own middle.

<!-- antislop: allow synonym-rotation -->
<!-- Why: "JSON surface" is the glossary's name for that view. -->
The key stays in the step page's Developer view and in the JSON surface.

Changing the content locale SHALL change what every node prints, for a step
carrying a translation in the chosen locale.

<!-- antislop: allow trailing-negation -->
<!-- The scenario tests the label against the key, so the contrast is its name. -->
#### Scenario: A node prints the label, not the key

- **WHEN** the canvas renders a step keyed `capture` and labelled
  `{ en: "Capture the request" }`, with the content locale `en`
- **THEN** the node body reads "Capture the request"
- **AND** the node draws no key line, so `capture` is nowhere in the node body

#### Scenario: A label wider than the node wraps to a second line

- **WHEN** the canvas renders a step labelled "Confirm Completion to Contoso"
- **THEN** the node body reads the whole label, over two lines
- **AND** no part of it crosses the node's own border
- **AND** neither line runs under the connect handle

#### Scenario: A label too long for two lines truncates and keeps its full text

- **WHEN** a step's label needs more than two lines at the node's width
- **THEN** the node body ends in an ellipsis
- **AND** the node's hover title carries the label untruncated

#### Scenario: A German compound breaks instead of running past the node

- **WHEN** a step carries the label `Arbeitsunfähigkeitsbescheinigungsprüfung`,
  one word wider than the node
- **THEN** the word breaks and the label takes two lines
- **AND** no part of it is cut mid-glyph without an ellipsis

#### Scenario: A label that fits has no hover title

- **WHEN** a step labelled "Done" renders beside one the clamp cut
- **THEN** the cut node carries its full label as a hover title
- **AND** the node reading "Done" carries none

#### Scenario: One line and two lines share a centre

- **WHEN** one node's label takes one line and its neighbour's takes two
- **THEN** each label block sits centred between its own node's top and
  bottom edges
- **AND** the two blocks read from one shared centre line

#### Scenario: A long label leaves the node's size alone

- **WHEN** one step carries the label "Go" and the next needs both lines
- **THEN** the two nodes measure the same width and the same height

#### Scenario: The content locale switch reaches the canvas

- **WHEN** a step's `label` is `{ en: "Review", de: "Prüfen" }` and the author
  switches the content locale to `de`
- **THEN** the node prints "Prüfen"

<!-- The scenario name repeats the live spec's; a MODIFIED block cannot rename a scenario. -->
#### Scenario: A step with no resolvable label falls back to its key

- **WHEN** a step carries key `capture` and a `label` with no entry for the
  content locale and none for the base locale
- **THEN** the node prints "(unnamed step)"
- **AND** `capture` is nowhere in the node body

#### Scenario: Two unnamed steps read apart

- **WHEN** the draft's third and fifth steps have no label
- **THEN** their nodes print "(unnamed step 3)" and "(unnamed step 5)", as the
  steps rail does

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
and open the Steps tab on it.

A pointer press SHALL select alone and leave the author on the canvas. A
shift-click builds a set there, and the delete control acts on one. A
double-click is the pointer's route to the Steps tab.

Escape SHALL move focus to the `<svg>`, which carries the `tabindex` that call
needs. Escape SHALL also move the roving stop itself. The `<svg>` takes
`tabindex="0"`, and every node, path and box drops to `-1`. Tab then leaves
the canvas rather than re-entering it. Re-entering the canvas SHALL land on
that root. An arrow key from a root focus SHALL move to the entry point.

A pointer press SHALL move the roving stop to what it presses. A node press
SHALL take a step focus. A path press SHALL take a path focus, entered through
its source. A disclosure press SHALL take that group's focus.

Without that move an arrow key walks from whatever the keyboard last touched.
Enter binds for a step focus and a path focus alone. A disclosure press
therefore leaves no stop a following Enter also answers.

A key press originating inside a text-entry field SHALL NOT reach the canvas
handler. The exclusion SHALL read the event's target. A disclosure button the
canvas draws is not such a field. An arrow key and Escape SHALL reach the
handler from one.

Focus SHALL alternate between a step and a path. Right from a step SHALL move
to that step's first outgoing path, and Right again to that path's target
step. Left from a step SHALL move to its first incoming path, and Left again
to that path's source step. Right from a path SHALL move to its target step,
whichever end the author arrived through. Left from a path SHALL move to its
source step, on the same rule.

Focus SHALL NOT wrap at a boundary. Right on an end step SHALL move nothing,
and Left on the initial step SHALL move nothing. Down on the last step in the
draft order and Up on the first SHALL move nothing. The same holds at either
end of a fan.

The step's `aria-label` SHALL name four things in order. They are the text its
node prints, its kind, its count of ways out and its stamps' words. It SHALL NOT name the step's
key. The kind SHALL read the phrase the step page's kind control prints. The
count SHALL cover the reachable paths alone, and SHALL read "way out" or
"ways out" in agreement with it.

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

- **WHEN** focus sits on an end step and the author presses Right
- **THEN** focus stays where it is, and no wrap to another step happens

#### Scenario: Enter selects the focused step

- **WHEN** focus sits on a step and the author presses Enter
- **THEN** that step becomes the selection, and the Steps tab opens on it
- **AND** a click on the node takes the selection alone, keeping the author on
  the canvas

#### Scenario: An arrow key leaves a focused group box

- **WHEN** focus sits on a group box's disclosure button and the author
  presses Down
- **THEN** the canvas handler receives that key, and focus moves on through
  the step order

#### Scenario: A pointer press moves the roving stop

- **WHEN** the author clicks a node other than the focused one, then presses
  Right
- **THEN** focus walks from the clicked node
- **AND** a click on a disclosure moves the stop there, so Enter then toggles
  the group alone

#### Scenario: Escape leaves the canvas, and an arrow key re-enters it

- **WHEN** the author presses Escape on a focused node, then Tab, then
  Shift+Tab, then Right
- **THEN** Escape puts the stop on the `<svg>`, and Tab leaves the canvas
- **AND** Shift+Tab lands on the `<svg>`, and Right moves to the entry point

#### Scenario: A screen reader names a terminal step in full

- **WHEN** focus reaches an end step labelled "Approved", keyed `approved`,
  carrying outcome `approved` and no outgoing path
- **THEN** its accessible name reads "Approved, An end, 0 ways out, End:
  approved"
- **AND** the key `approved` stands in it only as the outcome's name

#### Scenario: A step carrying one path announces the singular

- **WHEN** focus reaches a step carrying exactly one outgoing path
- **THEN** its accessible name reads "1 way out", never the plural
<!-- "function" here is the mathematical sense; "method" elsewhere names a TypeScript method. -->
<!-- antislop: allow synonym-rotation -->

### Requirement: A path is a focusable control carrying its own name

Each path SHALL be a focusable control with `role="button"`, a roving
`tabindex` and an `aria-label`. Activating a path SHALL resolve to that path's
source step. The step page then holds that source step, with Ways out open on
that way out.

The guard label's own `<div>` SHALL leave the accessibility tree. A pointer
already reaches the path anywhere along its route. The edge group's own
handler and its full-route hit area do that today. What the canvas lacks is a
tab stop, a role and a name. The path itself now carries all three.

The path's `aria-label` SHALL name its label, its source step, its target
step, its trigger and its sentence. The trigger reads "a person chooses" or
"happens by itself". The sentence slot SHALL take the sentence
the line draws, its place in the order included. A path with no sentence
SHALL say "no condition". The name SHALL NOT carry the trigger's enum value,
a `priority` number or CEL source.

While focus sits on a path, Up and Down SHALL walk the fan the author arrived
through. A path entered from its source SHALL walk that source's outgoing
set. A path entered from its target SHALL walk that target's incoming set.

#### Scenario: A keyboard author reaches a path's guard

- **WHEN** a keyboard author moves focus to a path and presses Enter
- **THEN** the step page opens on that path's source step, and the author can
  change the guard it carries

<!-- The scenario name repeats the live spec's; a MODIFIED block cannot rename a scenario. -->
#### Scenario: An automatic path announces its priority

- **WHEN** focus reaches the first of two automatic paths, carrying
  `priority: 10` and a guard
- **THEN** its accessible name carries the label, both step names, "happens
  by itself" and "First, only if" with the condition
- **AND** the number 10 stands nowhere in it

<!-- antislop: allow negation-habit -->
<!-- Why: the scenario name repeats the live spec's; a MODIFIED block cannot rename a scenario. -->
#### Scenario: A guardless default says it carries no guard

- **WHEN** focus reaches the guardless automatic path at a step's highest
  priority, beside a guarded one
- **THEN** its accessible name ends in "Otherwise"

#### Scenario: A guard announces as the phrase the canvas draws

- **WHEN** focus reaches a path guarded by a condition the edge label
  summarizes in words
- **THEN** its accessible name carries that summary, and no CEL source

#### Scenario: The guard label leaves the accessibility tree

- **WHEN** the canvas renders a path carrying a guard
- **THEN** the path itself is focusable and named, and the guard label's
  `<div>` carries `aria-hidden`

#### Scenario: A manual path names its trigger in words

- **WHEN** focus reaches a guardless manual path "Send" from "Capture" to
  "Review"
- **THEN** its accessible name reads "Send, from Capture to Review, a person
  chooses, no condition"

### Requirement: A path draws as the drop target under an edit-rail drag

While an edit-rail drag runs, the path under the pointer SHALL render in a
drop-target state. That state is the affordance the gesture has. The canvas
SHALL add no permanent control to an edge for it.

At most one path SHALL carry the state. It SHALL clear on release, and as soon
as the pointer leaves the path.

The state SHALL differ from a plain path in stroke weight as well as in color.
The signal then does not rest on color alone.

A drag carrying an `end` step SHALL draw the state on no path. Such a step
never lands inside one, so nothing may suggest that it does.

The state SHALL NOT move the way out's sentence. It SHALL NOT
add a second control at the route midpoint. A selected path already carries a
waypoint handle there.

#### Scenario: The path under the pointer marks itself

<!-- antislop: allow synonym-rotation -->
<!-- Why: the line repeats the live spec's wording verbatim; this change edits another sentence of the block. -->
- **WHEN** the developer holds a Step from the edit rail over a path
- **THEN** that path renders in the drop-target state
- **AND** every other path renders unchanged

#### Scenario: The state clears when the pointer moves off

- **WHEN** the pointer moves from the path to empty canvas
- **THEN** no path renders in the drop-target state

#### Scenario: An end step marks nothing

- **WHEN** the developer holds an End from the edit rail over a path
- **THEN** no path renders in the drop-target state

### Requirement: The structure surface lays out a canvas ribbon, a steps register and the configuration pane

The Canvas tab SHALL carry the canvas bar and the canvas, in that order. The
canvas SHALL fill the body the bar leaves. No other bar and no band SHALL
stand over it. No expand control SHALL stand, and no control SHALL change the
canvas height.

The steps register and the configuration pane SHALL NOT stand. The steps rail
and the step page hold that work, per `studio-step-page`.

Every canvas gesture the other requirements of this capability state SHALL
stay live. Those gestures cover the drag, the connect and the drop on a path.
They cover the pan, the zoom, the keyboard traversal and the focus ring. They
also cover auto layout, Arrange, the grid snap, groups, waypoints and the
double-click.

The canvas and the step page SHALL share one selected step. Pressing a node
SHALL make that step the one the step page holds. Pressing a rail row SHALL
mark that step's node on the canvas. Pressing a path edge SHALL resolve to
that path's source step. The step page then holds that source step, with its
Path to section in view.

The canvas bar SHALL keep the delete control for a selection of one step or
more. It SHALL keep the selection count for a selection of more than one step.
This capability's own selection requirement states both rules.

The canvas SHALL fill the height the tab body leaves under the bar, above a
floor of 36rem. Past that floor the page scrolls.

<!-- The scenario names below repeat the live spec's wording verbatim, so a delta can match them. -->
<!-- antislop: allow synonym-rotation -->
#### Scenario: The three regions appear

- **WHEN** an author opens the Canvas tab
- **THEN** the canvas bar stands under the tab row
- **AND** the canvas fills the body under it
- **AND** no ribbon, no steps register and no configuration pane stand beside
  it

#### Scenario: The ribbon starts collapsed

- **WHEN** an author opens the Canvas tab
- **THEN** the canvas stands at its full height under the bar, carrying no
  band

#### Scenario: The control expands and collapses the ribbon

- **WHEN** an author looks for a control that changes the canvas height
- **THEN** the Canvas tab carries none

#### Scenario: The bar holds its height across a selection

- **WHEN** an author selects three steps, then clears the selection, in a
  window wide enough for the row
- **THEN** the bar's height never changes
- **AND** the canvas never reflows

#### Scenario: A canvas selection opens the pane

- **WHEN** an author presses a step node on the Canvas tab
- **THEN** the step page holds that step
- **AND** the node reads as selected

#### Scenario: A register selection marks the node

- **WHEN** an author presses a row of the steps rail
- **THEN** that step's node reads as selected on the Canvas tab

<!-- The scenario name repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
#### Scenario: Several steps show the count

- **WHEN** an author selects more than one step on the canvas
- **THEN** the canvas bar carries the selection count and its delete control

#### Scenario: A reload returns the ribbon to collapsed

- **WHEN** an author reloads the Canvas tab
- **THEN** the canvas fills the body under the bar, as it did before the
  reload

#### Scenario: Saving a draft writes no ribbon state

- **WHEN** an author saves the draft
- **THEN** the saved `layout` blob has no key naming a ribbon

#### Scenario: A short window holds the floor

- **WHEN** an author opens the Canvas tab in a window shorter than the floor
- **THEN** the canvas keeps 36rem and the page scrolls

### Requirement: A path renders as an orthogonal route, under one canvas-wide style

A path SHALL render as an orthogonal route rather than a straight line. Every
segment SHALL lie on one axis.

Each anchor SHALL sit at the midpoint of one side of its own box. That side
is the one the box turns toward the next point on the route. For the source
anchor that point is the first waypoint. Without waypoints it is the target
box's centre. For the target anchor it is the last waypoint, or the source
box's centre.

A box is a step node at the canvas node size. It is also a collapsed group, at
the group box's own size. The anchor rule SHALL read that size rather than
assume a node's. Nothing else about the rule changes.

The larger of the two offsets SHALL pick the axis. A horizontal offset larger
than the vertical one SHALL put the anchor on a left or a right side.
Otherwise it SHALL sit on a top or a bottom side.

A path with no waypoints SHALL therefore draw exactly as it drew before
waypoints existed. Its two anchors read offsets that negate each other
exactly. They land on opposing sides, and both leave on one axis.

A zero offset on the chosen axis SHALL put the anchor on the right
side. Two steps stacked on one position reach that case, and every path SHALL
draw.

An anchor SHALL NOT take a free angle on the node's border. A segment leaving
at an angle has no square turn, and every segment here stays on one axis.

The route SHALL leave each anchor along the axis that anchor sits on.

A path whose source or target sits inside a collapsed group SHALL anchor on
that group's box. It SHALL NOT anchor on the hidden member. A path between two
members of one collapsed group SHALL NOT render at all.

A path MAY carry an ordered list of waypoints. The route SHALL run from the
source anchor to the first waypoint. It SHALL run from each waypoint to the
next, and from the last waypoint to the target anchor. Every waypoint SHALL
lie on the drawn route.

<!-- antislop: allow negation-habit -->
<!-- Why: the line repeats the live spec's wording verbatim; this change edits another sentence of the block. -->
A leg between two points SHALL draw as one straight segment, or as two when
the points share no axis. It SHALL carry no gutter. The gutter clears the node
an anchor sits on, and a waypoint has no box to clear.

The route SHALL NOT double back on itself at any point. Two consecutive
segments on one axis SHALL NOT travel in opposite directions.

The first leg SHALL travel first along its anchor's own axis. The last leg
SHALL arrive along the target anchor's axis. A leg between two waypoints SHALL
travel first along the larger offset between them.

The canvas-wide style SHALL govern every segment of a waypointed route. A path
SHALL NOT carry a style of its own. Switching the toolbar control SHALL
re-route the path between the same waypoints.

The segment count SHALL follow from the two anchors, on both axes. It governs
a path with no waypoints. A waypointed route takes its count from its legs
instead.

A target is ahead when its entry anchor sits beyond the source's exit anchor.
That reading runs along the leaving axis, in the leaving direction. An anchor
pair that is ahead and level on the other axis SHALL take one segment. That is
the common case: the auto-layout places a linear chain of steps on one row. An
anchor pair that is ahead and not level SHALL take three segments.

An anchor pair that is not ahead SHALL take five segments. The route has to
reach the target's entry edge from outside it.

Each turn SHALL sit a whole grid step clear of the node it leaves or enters.
That clearance runs along the axis the anchor leaves on. The turn's
other coordinate follows the anchor, which sits at the node's own middle.

Two styles SHALL ship, and no third. `step` draws square corners.
`smoothstep` draws the same route with rounded ones. There SHALL be no
straight style, and no style that reproduces the pre-change rendering.

The corner radius SHALL clamp to half the shorter of the two segments a corner
joins. A short segment therefore cannot carry an arc that overshoots its own
corner.

The route SHALL carry the pointer over its whole length. The area a developer
clicks SHALL follow the route. It SHALL NOT follow a straight line between the
anchors.

A way out's sentence SHALL centre on the route's own midpoint.

The connect handle SHALL stay at the source node's right-middle, whatever
anchor a path leaving that node takes. The handle is a control an author
presses. A handle that moved under the pointer would be harder to press.

The drag-to-connect preview SHALL stay a straight line from that handle. It
follows the pointer and reaches no target. It has neither a route to draw nor
a side to face.

A selected path SHALL draw one handle at each of its waypoints, and one at the
route's midpoint. An unselected path SHALL draw none. The canvas holds at most
one selected path, so at most one path shows handles.

A handle SHALL draw after the way out's sentence, which reads the same
midpoint. A handle stays grabbable that way. It may cover part of a
label, and an author reading a guard deselects the path to clear the handles.

A waypoint handle SHALL draw after the midpoint handle and take the pointer
where the two coincide. A symmetric bend puts the route midpoint on the
waypoint itself, and only the waypoint handle answers a double-click.

Dragging the midpoint handle SHALL add a waypoint at the release point.
Dragging a waypoint handle SHALL move that waypoint. Each SHALL land on the
canvas lattice, the way a dragged step already does.

A new waypoint SHALL take the position in the list that keeps the route's
order. The midpoint handle sits on one leg of the route, and the new waypoint
goes at that leg's own index.

A route segment's index SHALL NOT stand in for a waypoint's index. One leg
draws as one or two segments, so the route carries more segments than the list
carries points.

Double-clicking a waypoint handle SHALL delete that waypoint. A path whose
last waypoint goes SHALL draw the direct route again. That is the whole of
reset, and nothing stores what the route was before.

#### Scenario: A path along one row draws straight

- **WHEN** a step has a path to a step placed to its right on the same row
- **THEN** the path renders as one horizontal segment, and it turns no corner

#### Scenario: A path to a step ahead of it on another row turns two corners

- **WHEN** a step has a path to a step placed to its right and one row down
- **AND** the horizontal gap is the larger of the two
- **THEN** the path renders as three axis-aligned segments, leaving the source
  horizontally and entering the target horizontally

#### Scenario: A path to a step below it leaves the bottom side

- **WHEN** a step has a path to a step placed below it
- **AND** the vertical gap is the larger of the two
- **THEN** the path leaves the source's bottom-middle and enters the target's
  top-middle
- **AND** every segment lies on one axis

#### Scenario: A path to a step above it leaves the top side

- **WHEN** a step has a path to a step placed above it
- **AND** the vertical gap is the larger of the two
- **THEN** the path leaves the source's top-middle and enters the target's
  bottom-middle

#### Scenario: A path to a step behind it on the same row draws straight

- **WHEN** a step has a path to a step placed to its left on the same row
- **AND** the two nodes do not overlap on the horizontal
- **THEN** the path leaves the source's left-middle and enters the target's
  right-middle
- **AND** it renders as one horizontal segment, and it turns no corner

#### Scenario: A path to a step behind it reaches the entry edge from outside

- **WHEN** a step has a path to a step placed to its left and one row down
- **AND** the two nodes overlap on the horizontal
- **THEN** the path renders as five axis-aligned segments
- **AND** it enters the target from outside the target's entry edge

<!-- antislop: allow negation-habit -->
<!-- Why: the scenario name repeats the live spec's, so the delta can match it. -->
#### Scenario: A straight route carries no arc under either style

- **WHEN** a same-row path renders under `smoothstep`
- **THEN** it draws as one straight segment, with no arc at either end

#### Scenario: The smooth style rounds the same route

- **WHEN** the developer switches the style to `smoothstep`
- **THEN** every path keeps its corner points and draws each corner as an arc

#### Scenario: A short segment does not overshoot its corner

- **WHEN** two steps sit close enough that a route segment is shorter than
  twice the corner radius
- **THEN** the arc clamps to half that segment, and the route stays within its
  own corner points

<!-- The scenario name repeats the live spec's; a MODIFIED block cannot rename a scenario. -->
#### Scenario: A guard label follows the route

- **WHEN** a way out with a sentence renders under either style
- **THEN** its sentence centres on the midpoint of the route
- **AND** it does not sit at the midpoint of a straight line between the
  anchors

#### Scenario: Clicking the route selects the path

- **WHEN** the developer clicks a route where it turns a corner, away from the
  straight line between its anchors
- **THEN** the canvas draws that path as selected

#### Scenario: The connect handle stays put while the anchor moves

- **WHEN** a step's only path leaves its bottom side
- **THEN** that step's connect handle still sits at its right-middle
- **AND** a drag from that handle still previews as a straight line to the
  pointer

#### Scenario: Dragging a step moves its anchors

- **WHEN** the developer drags a target step from the right of its source to
  below it
- **THEN** the path's anchors move to the facing sides, with no reload

#### Scenario: A waypointed route passes through its waypoint

- **WHEN** a path carries one waypoint
- **THEN** the drawn route passes through that point
- **AND** every segment lies on one axis

#### Scenario: A waypointed route never doubles back

- **WHEN** a path carries a waypoint the route reaches head-on
- **THEN** no segment of the route travels back along the one before it
- **AND** no spike stands out of the route at that waypoint

#### Scenario: A waypoint above the two steps turns the route above them

- **WHEN** a path between two steps on one row carries a waypoint above both
- **THEN** the route leaves the source, rises to that waypoint, and comes back
  down into the target

#### Scenario: The source anchor faces the first waypoint

- **WHEN** a path to a step on its right carries a first waypoint above the
  source
- **THEN** the route leaves the source's top side rather than its right side

#### Scenario: The style still governs a waypointed route

- **WHEN** a path carrying waypoints renders under `smoothstep`
- **THEN** every corner of every leg draws as an arc
- **AND** the waypoints do not move

#### Scenario: Only a selected path shows handles

- **WHEN** the developer selects a path
- **THEN** that path draws a handle at each waypoint and one at its midpoint
- **AND** no other path draws a handle

#### Scenario: Dragging the midpoint handle adds a waypoint

- **WHEN** the developer drags a selected path's midpoint handle and releases
- **THEN** the path carries one more waypoint, at the released point rounded
  to the lattice
- **AND** the route passes through it

#### Scenario: Dragging a waypoint handle moves that waypoint

- **WHEN** the developer drags an existing waypoint handle and releases
- **THEN** that waypoint sits at the released point rounded to the lattice
- **AND** the list holds the same number of waypoints as before

#### Scenario: Double-clicking a waypoint handle deletes it

- **WHEN** the developer double-clicks a waypoint handle
- **THEN** the path carries one fewer waypoint

#### Scenario: Deleting the last waypoint restores the direct route

- **WHEN** the developer deletes a path's only waypoint
- **THEN** the path draws the route it drew before any waypoint existed

<!-- Why: the header must match the base spec character for character, or the
     delta adds a requirement rather than modifying one. -->

### Requirement: The canvas renders from compiled styles

`canvas/CanvasView.tsx` and `canvas/EditRail.tsx` SHALL render from compiled
component styles, reading `form-ui/tokens.stylex`. The rendered result
SHALL match the previous stylesheet declaration for declaration. This
covers every pointer-driven state (drag, selection, insert-target,
group-collapsed) and every keyboard-driven state (roving focus ring,
`:focus-visible` halo).

`canvas-node` and `panzoom-exclude` SHALL remain literal, unhashed class
strings on every element that carries them today. Keyboard-focus targeting
and Panzoom's own exclude-class contract both read one of these two strings
directly, outside the compiled-style system.

#### Scenario: The canvas keeps its look and its keyboard model

- **WHEN** a browser renders the canvas edit screen
- **AND** a developer walks its nodes and edges with the keyboard, in
  Chromium and in Firefox
- **THEN** the canvas's computed layout, spacing, color and border equal
  the values the deleted stylesheet declared
- **AND** the keyboard traversal, selection and focus-ring behavior stay
  exactly as they were before

#### Scenario: Panzoom still excludes every node and edge group from panning

<!-- antislop: allow synonym-rotation -->
<!-- Why: the line repeats the live spec's wording verbatim; this change edits another sentence of the block. -->
- **WHEN** a developer starts a pointer drag on one of the canvas's
  excluded elements
- **AND** the element is a step node, an edge group or a waypoint handle
- **THEN** the press reaches the canvas's own handlers and does not pan
  the canvas
- **AND** each of those elements still carries the literal
  `panzoom-exclude` class Panzoom's own exclude-class option reads

## REMOVED Requirements

### Requirement: A step node on the canvas offers an inline rename

**Reason**: The canvas is the map, not the editor (stage 64, principle 7). A
double-click now opens the step on the Steps tab, where the step page's name
line names it.

**Migration**: Double-click the node or press Enter on it. Then type the name
into the step page's name line.

### Requirement: The masthead's step key auto-derives from the step label

**Reason**: It named two label routes, the step page's name line and the
canvas's inline rename. The rename goes. The rule moves to "A step's key
auto-derives from its label on the step page", with the one route.

**Migration**: None. The step page derives a key as it did before.
