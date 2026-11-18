## MODIFIED Requirements

### Requirement: The canvas introduces no authoring operation unavailable through the panels

<!-- Why: the copied paragraphs repeat the base spec's wording; remove and delete name two controls. -->
<!-- antislop: allow sentence-length passive-voice synonym-rotation -->

Every mutation the canvas can trigger SHALL have an existing panel-based
equivalent. Those mutations are positioning a step, connecting a path,
inserting a step into a path, and deleting a selection. The canvas SHALL NOT
be the only way to perform any authoring operation. Deletion keeps its panel
route. The step page's own remove control removes each step the canvas bar's
delete control removes.

The insert gesture holds to this rule by composition. It performs no mutation
the panels lack. The rail's own existing step-creation drag creates the step.
Then `PathsPanel` retargets the source step's existing path to the new step.
It also adds a new path on it, naming the old target. Both are
already-existing panel actions.

The canvas spends one gesture where the panels spend four operations, and
reaches the same draft.

Selection, traversal and connecting two steps answer the keyboard on the
canvas itself. The way-out menu is the connect drag's keyboard route there. The
panel route stays a keyboard equivalent beside it. Every other drag keeps the
panel route as its keyboard equivalent.

#### Scenario: A step and its paths remain deletable without the canvas

<!-- Why: the scenario repeats the base spec's own wording, character for character. -->
<!-- antislop: allow passive-voice synonym-rotation -->
- **WHEN** a step or path is deleted through its panel
- **THEN** the deletion succeeds identically to before this change, with no
  canvas-only deletion affordance introduced

#### Scenario: The panels reach an inserted step's end state

<!-- Why: this scenario repeats the base spec's own wording; the rail carries that name on the screen. -->
<!-- antislop: allow synonym-rotation -->
- **WHEN** the developer drags a Step from the edit rail onto empty canvas
- **AND** retargets the source step's path to it in `PathsPanel`
- **AND** adds a path on the new step naming the old target
- **THEN** the draft matches what one drop on that path produces
- **AND** it differs in the new step's position and the cleared waypoints

#### Scenario: A way out added from the keyboard has a panel route too

- **WHEN** a keyboard author adds a way out from "Review" to "Booking Error"
  through the way-out menu
- **THEN** the step page's Ways out section can add the same way out from the
  keyboard
- **AND** that way out takes the same trigger, name and key

<!-- Why: a MODIFIED block keeps the base heading and every base scenario word for word. -->
<!-- antislop: allow passive-voice -->
### Requirement: Canvas interaction logic is tested as pure functions, independent of rendering

Twenty computations SHALL live in pure modules with `bun:test` coverage. Five
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
the draft's steps, its groups and its initial step. It reads that last one for
a root focus alone, which resolves to the entry point. The traversal reaches a
path through its owning step. A path lives at `workflow.steps[i].paths`, and no separate
collection holds one.

It returns the next focus, and it is total over a deep-partial draft. `packages/web/src/areas/app/screens/inboxLogic.ts` sets that
convention.

The keyboard adds the last eight. The reveal returns the pan that brings one
box into view. The inset reading returns the room the view leaves around it.
The zoom step returns the transform that keeps one point in place.

The menu's item list returns the items in order. The type-ahead and the menu's
key step each return the next item. The source check returns a connect refusal
or none, and the refusal sentence returns that refusal's words. None of the
eight reads the DOM.

The tests need not cover the SVG rendering or the pointer-event wiring.

#### Scenario: Connection validity holds without rendering

<!-- antislop: allow negation-habit -->
- **WHEN** a test gives the connection-validity predicate a step's existing
  paths and a candidate path
- **THEN** it returns accept or reject-with-reason, and the test needs no DOM
  or canvas rendering

#### Scenario: The fit computation holds without rendering

<!-- antislop: allow negation-habit -->
- **WHEN** a test gives the fit-to-view computation a content bounding box and
  a viewport size
- **THEN** it returns a zoom level and a pan offset, and the test needs no DOM
  or canvas rendering

#### Scenario: The selection toggle and the overlap test hold without rendering

<!-- antislop: allow negation-habit -->
- **WHEN** a test gives the toggle a list of ids and one more id
- **AND** gives the overlap test a rectangle and a list of node positions
- **THEN** each returns its own list of ids, and the test needs no DOM or
  canvas rendering

#### Scenario: The edge route holds without rendering

<!-- antislop: allow negation-habit -->
- **WHEN** a test gives the routing computation a source anchor, a target
  anchor and a style
- **THEN** it returns the route's corner points, and the test needs no DOM or
  canvas rendering

#### Scenario: The anchor rule holds without rendering

<!-- antislop: allow negation-habit -->
- **WHEN** a test gives the anchor rule a node position and a facing point
- **THEN** it returns that node's anchor and the side it leaves on
- **AND** the test needs no DOM or canvas rendering

#### Scenario: The group rules hold without rendering

<!-- antislop: allow negation-habit -->
- **WHEN** a test gives the group rules a list of groups and a list of node
  positions
- **THEN** it returns each group's box, the hidden step ids, and the box a
  given step anchors on
- **AND** the test needs no DOM or canvas rendering

#### Scenario: The waypoint route holds without rendering

<!-- antislop: allow negation-habit -->
- **WHEN** a test gives the waypoint route two node positions and a list of
  points
- **THEN** it returns one polyline through every point in that list
- **AND** it returns the index at which each leg of that polyline begins
- **AND** the test needs no DOM or canvas rendering

#### Scenario: The traversal step holds without rendering

<!-- antislop: allow negation-habit -->
- **WHEN** a test gives the traversal step a focus, a key, a draft's steps, its
  groups and its initial step
- **THEN** it returns the next focus, naming the step, the path, the group or
  the `<svg>` root that takes it
- **AND** the test needs no DOM or canvas rendering

#### Scenario: The reveal holds without rendering

- **WHEN** a test gives the reveal a box, the view's size, its insets and the
  current transform
- **THEN** it returns the new pan at the same zoom level
- **AND** the test does not need a DOM or canvas rendering

#### Scenario: The zoom step holds without rendering

- **WHEN** a test gives the zoom step a transform, a target level, an anchor
  point and the view's size
- **THEN** it returns a clamped level and a pan that keeps the anchor in place
- **AND** the test does not need a DOM or canvas rendering

#### Scenario: The menu's item list holds without rendering

- **WHEN** a test gives the item list the draft's steps, the hidden step ids
  and the step texts
- **THEN** it returns the step items in the draft's order, then the separator
  and "A new step"
- **AND** the test does not need a DOM or canvas rendering


## ADDED Requirements

### Requirement: The canvas frame clips the graph without scrolling

The canvas frame SHALL clip the graph without being a scroll container. Its
scroll offsets SHALL stay at zero, whatever takes focus inside it. Each focus
move the canvas makes itself SHALL ask the browser not to scroll. Pan and zoom
SHALL stay the one way the view moves.

#### Scenario: A focus move off the visible canvas leaves the frame unscrolled

- **WHEN** the canvas stands at 200 percent zoom
- **AND** a keyboard author moves focus to a step outside the visible canvas
- **THEN** the frame's horizontal and vertical scroll offsets both read 0
- **AND** the step draws where the pan transform puts it

#### Scenario: Fit to view frames the graph after a focus move

- **WHEN** a keyboard author moved focus across the whole graph at 200 percent
  zoom
- **AND** the author then activates "Fit to view"
- **THEN** the framing matches the one "Fit to view" gives on a fresh open

### Requirement: A keyboard focus move reveals the focused element

A keyboard focus move SHALL bring the step, way out or group disclosure it
lands on fully into view. The canvas SHALL pan by the least amount
that does so. It SHALL keep its zoom level. The visible area leaves out the
toolbar and the gutter of "Fit to view".

An element larger than that area SHALL align to the area's top-left corner. An
element already in view SHALL move nothing. A pointer press SHALL reveal
nothing.

#### Scenario: A step past the right edge comes into view

- **WHEN** focus sits on a step, and the next step in the draft's order stands
  past the canvas's right edge
- **AND** the keyboard author presses Down
- **THEN** the graph pans left until that step's focus ring stands 16px inside
  the canvas edge
- **AND** the zoom level stays as it was

#### Scenario: A step under the toolbar comes clear of it

- **WHEN** a keyboard author moves focus to a step that sits under the toolbar
- **THEN** the graph pans down until the step stands 16px below the toolbar

#### Scenario: Tab into the canvas reveals the entry step

- **WHEN** the draft's initial step stands outside the visible canvas
- **AND** a keyboard author tabs into the canvas
- **THEN** focus lands on the initial step, and the graph pans it into view

#### Scenario: An element in view moves nothing

- **WHEN** a keyboard author moves focus to a way out already fully in view
- **THEN** the graph keeps its pan and its zoom

#### Scenario: An element larger than the view aligns to its top-left

- **WHEN** a keyboard author moves focus to a way out whose route is wider than
  the visible area
- **THEN** the route's leftmost point stands 16px inside the canvas's left edge

#### Scenario: A pointer press reveals nothing

- **WHEN** an author clicks a step that stands half outside the visible canvas
- **THEN** the graph keeps its pan, and the click selects the step

### Requirement: Zoom keys scale the canvas

With focus on the canvas's `<svg>` or an element inside it, `+` and `=` SHALL
zoom in by a factor of 1.25.
The `-` key SHALL zoom out by the same factor. The zoom level SHALL stay
between the canvas's least and greatest level. The `0` key SHALL run "Fit to
view". A key pressed with Ctrl, Meta or Alt SHALL reach the browser untouched.

A zoom key SHALL keep the focused element's centre in place on screen. On a
root focus, the view's centre SHALL stay in place instead.

#### Scenario: Plus zooms in about the focused step

- **WHEN** the canvas stands at 100 percent zoom and a step holds focus
- **AND** the keyboard author presses `+`
- **THEN** the canvas stands at 125 percent
- **AND** the focused step's centre stays at the same point on screen

#### Scenario: Minus zooms out about the view's centre from the root

- **WHEN** the canvas `<svg>` itself holds focus at 100 percent zoom
- **AND** the keyboard author presses `-`
- **THEN** the canvas stands at 80 percent
- **AND** the graph point under the view's centre stays there

#### Scenario: The greatest level holds

- **WHEN** the canvas stands at its greatest zoom level
- **AND** the keyboard author presses `=`
- **THEN** the zoom level stays where it is

#### Scenario: Zero frames the graph

- **WHEN** a keyboard author presses `0` inside the canvas
- **THEN** the canvas shows the framing "Fit to view" gives

#### Scenario: A modifier leaves the key to the browser

- **WHEN** a keyboard author presses Ctrl and `+` inside the canvas
- **THEN** the canvas keeps its own zoom level
- **AND** the browser zooms the page

### Requirement: The canvas announces through one polite live region

The canvas SHALL hold one live region. It is polite and visually hidden, and
it lays out inside the canvas frame. It SHALL stay mounted while the canvas
shows. Each zoom key SHALL announce the new level, as in "Map at 125 percent".
An added way out and a refused source SHALL announce too.

A zoom level and an added way out SHALL read from the studio catalog, in the
author's words. Neither SHALL say "edge", "node" or "port". A refusal SHALL
read the sentence the drop shows.

#### Scenario: A zoom key announces the level

- **WHEN** a keyboard author presses `+` at 100 percent zoom
- **THEN** the live region reads "Map at 125 percent"

#### Scenario: The region stands before its first announcement

- **WHEN** the Map tab first shows a draft
- **THEN** the canvas frame already holds the empty live region

### Requirement: Opening from the canvas lands focus on the step page

Enter on a focused step SHALL move focus to the step page's Name input, once
the Steps tab shows. Enter on a focused way out SHALL open Ways out on its
source step. Focus SHALL then move to that way out's own Name input, in its
row. A double-click SHALL land focus the same way. Focus SHALL NOT fall to the
page body.

#### Scenario: Enter on a step lands on its Name input

- **WHEN** focus sits on the step "Review" and the author presses Enter
- **THEN** the Steps tab shows "Review", and its Name input holds focus

#### Scenario: Enter on a way out lands on its row

- **WHEN** focus sits on the way out "Approve" from "Review"
- **AND** the author presses Enter
- **THEN** the Steps tab shows "Review" with Ways out open
- **AND** the Name input in the row of "Approve" holds focus

#### Scenario: A double-click lands the same way

- **WHEN** the author double-clicks the step "Review"
- **THEN** its Name input on the step page holds focus

### Requirement: C opens the way-out menu on a focused step

On a focused step, the `C` key SHALL open a menu anchored at that step,
headed "Way out to …". It SHALL list the draft's steps in the draft's order,
each by the text its node prints. The source step SHALL stand in the list. A
step hidden inside a collapsed group SHALL NOT.

A separator SHALL follow the steps, then the item "A new step". The first item
SHALL take focus. Shift SHALL change nothing. With Ctrl, Meta or Alt, the key
SHALL reach the browser untouched.

#### Scenario: The menu lists the steps, then a new step

- **WHEN** a draft holds "Review", "Booking Error" and "Done", in that order
- **AND** the keyboard author presses `C` on "Review"
- **THEN** a menu headed "Way out to …" opens beside "Review"
- **AND** it lists "Review", "Booking Error" and "Done", a separator, then "A
  new step"
- **AND** "Review" holds focus

#### Scenario: A lowercase c opens the menu

- **WHEN** focus sits on "Review"
- **AND** the keyboard author presses `c` with no modifier
- **THEN** the menu headed "Way out to …" opens beside "Review"

#### Scenario: A collapsed group hides its members from the menu

- **WHEN** "Done" sits inside a collapsed group
- **AND** the keyboard author presses `C` on "Review"
- **THEN** the menu does not list "Done"

#### Scenario: C answers a step alone

- **WHEN** focus sits on a way out, a group's disclosure or the `<svg>` root
- **AND** the keyboard author presses `C`
- **THEN** no menu opens

#### Scenario: A screen reader learns the key

- **WHEN** the canvas draws a step
- **THEN** the step carries `aria-keyshortcuts="C"`, and no visible key hint
  draws

### Requirement: The way-out menu answers the keyboard

Down and Up SHALL move focus through the menu's items, wrapping at either end.
Home and End SHALL reach the first and the last item. A typed letter SHALL
move focus to the next item whose text starts with it. Enter SHALL add the way
out the focused item names.

Escape SHALL close the menu and add nothing. Tab SHALL do the same. Either one
SHALL return focus to the source step. A press outside the menu SHALL close it
and add nothing.

#### Scenario: A typed letter jumps by name

- **WHEN** the menu lists "Review", "Booking Error" and "Done"
- **AND** the keyboard author types `b`
- **THEN** "Booking Error" holds focus

#### Scenario: Escape returns to the step

- **WHEN** the menu is open on "Review"
- **AND** the keyboard author presses Escape
- **THEN** the menu closes, and "Review" holds focus
- **AND** the draft has no new way out

#### Scenario: Down wraps at the end

- **WHEN** "A new step" holds focus
- **AND** the keyboard author presses Down
- **THEN** the first item holds focus

### Requirement: The way-out menu adds what a connect drop adds

Enter on a step's item SHALL add the way out a connect drop on that step adds.
Enter on "A new step" SHALL add the step and the way out a drop on empty canvas
adds. Each way out SHALL come from the drop's own `newPath` call, with its
trigger, name and key. Focus SHALL then move to the new way out, and the live
region SHALL announce it.

#### Scenario: Enter adds a way out to an existing step

- **WHEN** the menu is open on "Review", which has no way out yet
- **AND** the keyboard author presses Enter on "Booking Error"
- **THEN** a manual way out from "Review" to "Booking Error" exists, named
  "Review → Booking Error"
- **AND** that way out holds focus
- **AND** the live region reads "Added a way out from Review to Booking Error."

#### Scenario: Enter on a new step adds a step and a way out

- **WHEN** the menu is open on "Review", and the place one column right of it
  is free
- **AND** the keyboard author presses Enter on "A new step"
- **THEN** a new task step exists one column right of "Review"
- **AND** a way out from "Review" to the new step exists
- **AND** the live region names the text the new step's node prints

#### Scenario: A subprocess source takes an automatic way out

- **WHEN** the menu is open on a subprocess step with no way out
- **AND** the keyboard author presses Enter on any item
- **THEN** the new way out is automatic, as a connect drop's would be

#### Scenario: The source itself is a target

- **WHEN** the menu is open on "Review"
- **AND** the keyboard author presses Enter on "Review"
- **THEN** a way out from "Review" back to "Review" exists, as a drop on
  "Review" adds

### Requirement: The menu places a new step beside its source

A new step the way-out menu adds SHALL stand one column right of its source
when that spot is free. Otherwise it SHALL stand at the first free lattice
point to the right of that spot. No step SHALL overlap it, a step hidden in a
collapsed group included.

#### Scenario: A taken spot moves the new step right

- **WHEN** the step "Booking Error" stands one column right of "Review"
- **AND** the keyboard author presses Enter on "A new step" in the menu on
  "Review"
- **THEN** the new step stands at the first free lattice point right of that
  spot
- **AND** the new step overlaps no step

### Requirement: A refused source opens no menu

The `C` key SHALL open no menu on a step the connect drop refuses as a source.
A terminal step is one. A step whose existing paths reject the new way out's
trigger is another. The canvas SHALL show the refusal the drop shows, beside
the step. The live region SHALL announce the same text.

Focus SHALL stay on the step, and the draft SHALL stay unchanged. One shared
check SHALL decide the refusal for the drop and the key.

#### Scenario: An end refuses the key

- **WHEN** focus sits on an end
- **AND** the keyboard author presses `C`
- **THEN** no menu opens, "An end has no way out." shows beside the end, and
  the live region reads it

### Requirement: A refusal reads the author's words

A connect refusal, from the drop or the key, SHALL read a studio catalog
sentence in the author's words. It SHALL NOT print the engine's rule text. An
end SHALL read "An end has no way out.", the connect handle's own sentence. A
missing order SHALL read the canvas's own sentence, since the checks rail's
sentence does not fit a valid step. Every other trigger refusal SHALL read the
checks rail's sentence for the same rule. Any other rule SHALL read one general
catalog sentence.

#### Scenario: An inconsistent source refuses the key

- **WHEN** focus sits on "Check credit", a call to another process with one way
  out
- **AND** that way out happens by itself and carries the number 1
- **AND** the keyboard author presses `C`
- **THEN** no menu opens
- **AND** "“Check credit” already has a way out that happens by itself. Add the
  next one under Ways out, and give it a number." appears beside the step
- **AND** the engine's text "automatic paths need a priority" appears nowhere

#### Scenario: A drop's refusal reads the same sentence

- **WHEN** the author drags a connect handle from "Check credit" and drops it
  on another step
- **THEN** the canvas shows the sentence the `C` key shows
- **AND** the draft does not gain a way out

#### Scenario: A mixed source reads the checks rail's sentence

- **WHEN** focus sits on a call to another process whose one way out a person
  chooses
- **AND** the keyboard author presses `C`
- **THEN** no menu opens, and the checks rail's sentence for mixed ways out
  appears beside the step
