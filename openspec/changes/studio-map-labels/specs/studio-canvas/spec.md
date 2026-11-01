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

A way out's sentence SHALL wrap over up to three lines. It SHALL centre on
the midpoint of the way out's route. Its width SHALL follow the room on the
segment that midpoint falls on, within a fixed floor and cap.

A sentence longer than three lines SHALL end in an ellipsis. It SHALL carry
the full sentence as its hover title, and only where the lines cut it.

A press on the sentence SHALL select its way out, as a press on the line
does.

#### Scenario: A long condition wraps rather than cuts

- **WHEN** a way out's sentence reads "Only if Amount is greater than 1,000
  and Cost centre is “Finance”"
- **THEN** the sentence shows whole over two or three lines
- **AND** it has no hover title

#### Scenario: A sentence past three lines keeps its full text

- **WHEN** a way out's sentence needs more than three lines at its width
- **THEN** the third line ends in an ellipsis
- **AND** the hover title carries the sentence untruncated

#### Scenario: The sentence centres on the route

- **WHEN** the canvas draws a sentence of one line and one of three lines
- **THEN** each block's centre sits on its own route's midpoint

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
  base locale, creates a step from the palette
- **AND** the developer types "Manager review" into its label, having never
  touched its key field
- **THEN** the step's key reads `manager_review`

#### Scenario: A new step's key stays empty while the developer types in a non-base content locale

- **WHEN** the developer has switched the studio's content locale away from
  the draft's base locale
- **AND** the developer creates a step from the palette and types a label
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

The condition SHALL read in the condition builder's clause words. A row the
builder cannot read, and source that does not parse, SHALL read "a
hand-written rule holds". The sentence SHALL NOT carry CEL source.

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

- **WHEN** a path's guard holds source the builder cannot read
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
content locale with fallback to the draft's `baseLocale`. It SHALL fall back
to the unnamed-step string when that resolution yields nothing. It SHALL NOT
fall back to the step's `key`.

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

#### Scenario: A step with no resolvable label falls back to its key

- **WHEN** a step carries key `capture` and a `label` with no entry for the
  content locale and none for the base locale
- **THEN** the node prints "(unnamed step)"
- **AND** `capture` is nowhere in the node body

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

The step's `aria-label` SHALL name, in order, its resolved label, its kind,
its count of ways out and its stamps' words. It SHALL NOT name the step's
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
source step. The step page then holds that source step, with its Path to
section in view.

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

#### Scenario: An automatic path announces its priority

- **WHEN** focus reaches the first of two automatic paths, carrying
  `priority: 10` and a guard
- **THEN** its accessible name carries the label, both step names, "happens
  by itself" and "First, only if" with the condition
- **AND** the number 10 stands nowhere in it

<!-- antislop: allow negation-habit -->
<!-- Why: the scenario name repeats the live spec's, so the delta can match it. -->
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
