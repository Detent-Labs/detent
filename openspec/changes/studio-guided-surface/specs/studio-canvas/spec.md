## MODIFIED Requirements

### Requirement: The canvas is keyboard-operable, and traversal follows the paths

The canvas SHALL be one stop in the page's tab order. Entering it SHALL place
focus on the entry point the rule below defines. A roving `tabindex` SHALL
move focus inside it, so no node takes a stop of its own.

Each step node SHALL carry `role="button"`, an `aria-label` and that roving
`tabindex`. A node SHALL drop all three while its inline rename is open. That
rename field is focusable, and ARIA forbids a focusable element inside a
`role="button"`. The `<svg>` SHALL carry `role="application"`, an `aria-label`
naming the graph, and a `tabindex` of its own. The role is load-bearing: a
screen reader's browse mode otherwise consumes an arrow key before the
element's handler sees it.

Arrow keys SHALL move focus. Right SHALL follow an outgoing path. Left SHALL
follow an incoming path. Up and Down SHALL move through the draft's step
order, the order `workflow.steps` holds. Enter SHALL select the focused step
and open the Steps tab on it.

A pointer press SHALL select alone and leave the author on the canvas. A
shift-click builds a set there, and the delete control acts on one.

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

A key press originating inside the inline rename field SHALL NOT reach the
canvas handler. The exclusion SHALL read the event's target. A target inside a
text-entry field stops the handler. A disclosure button the canvas draws is
not such a field. An arrow key and Escape SHALL reach the handler from one.

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

The step's `aria-label` SHALL name, in order, its resolved label, its key, its
kind, its stamps and its outgoing-path count. That count SHALL cover the
reachable paths alone. The kind SHALL read the three plain phrases the palette
uses. The phrase carrying that count SHALL agree with it in number. A step
carrying one path SHALL NOT announce a plural.

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
- **THEN** its accessible name carries the label, the key, the kind phrase,
  the outcome and a zero path count

#### Scenario: A step carrying one path announces the singular

- **WHEN** focus reaches a step carrying exactly one outgoing path
- **THEN** its accessible name reads one outgoing path, never the plural

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
step, its trigger and its guard. An automatic path SHALL add its `priority`. A
path carrying no guard SHALL say so.

The guard slot SHALL take the readable condition the canvas draws on the edge,
never the CEL source. That readable form already exists on the canvas, under
`aria-hidden`. Where nothing resolves it, the slot SHALL take the source
itself.

While focus sits on a path, Up and Down SHALL walk the fan the author arrived
through. A path entered from its source SHALL walk that source's outgoing
set. A path entered from its target SHALL walk that target's incoming set.

#### Scenario: A keyboard author reaches a path's guard

- **WHEN** a keyboard author moves focus to a path and presses Enter
- **THEN** the step page opens on that path's source step, and the author can
  change the guard it carries

#### Scenario: An automatic path announces its priority

- **WHEN** focus reaches an automatic path carrying `priority: 10` and a guard
- **THEN** its accessible name carries the label, both step names, the
  trigger word and the guard
- **AND** the priority reads last, after the guard

#### Scenario: A guardless default says it carries no guard

- **WHEN** focus reaches the guardless automatic path at a step's highest
  priority
- **THEN** its accessible name states that it carries no guard

#### Scenario: A guard announces as the phrase the canvas draws

- **WHEN** focus reaches a path guarded by a condition the edge label
  summarizes in words
- **THEN** its accessible name carries that summary, not the CEL source

#### Scenario: The guard label leaves the accessibility tree

- **WHEN** the canvas renders a path carrying a guard
- **THEN** the path itself is focusable and named, and the guard label's
  `<div>` carries `aria-hidden`

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The structure surface lays out a canvas ribbon, a steps register and the configuration pane

The Canvas tab SHALL carry the canvas alone. The canvas SHALL fill the tab's
whole body. No ribbon bar and no band SHALL stand over it. No expand control
and no band height SHALL stand either.

The steps register and the configuration pane SHALL NOT stand. The steps rail
and the step page hold that work, per `studio-step-page`.

Every canvas gesture the other requirements of this capability state SHALL
stay live. Those gestures cover the drag, the connect and the drop on a path.
They cover the pan, the zoom, the keyboard traversal and the focus ring. They
also cover auto layout, Arrange, the grid snap, groups, waypoints and the
inline rename.

The canvas and the step page SHALL share one selected step. Pressing a node
SHALL make that step the one the step page holds. Pressing a rail row SHALL
mark that step's node on the canvas. Pressing a path edge SHALL resolve to
that path's source step. The step page then holds that source step, with its
Path to section in view.

The canvas SHALL keep the selection count and the delete control for a
selection of more than one step. This capability's own selection requirement
states that rule.

The canvas SHALL fill the height the tab body leaves, above a floor of 36rem.
Past that floor the page scrolls.

<!-- The scenario names below repeat the live spec's wording verbatim, so a delta can match them. -->
<!-- antislop: allow synonym-rotation -->
#### Scenario: The three regions appear

- **WHEN** an author opens the Canvas tab
- **THEN** the canvas fills the tab's body
- **AND** no ribbon, no steps register and no configuration pane stand beside
  it

#### Scenario: The ribbon starts collapsed

- **WHEN** an author opens the Canvas tab
- **THEN** the canvas stands at its full height, carrying no bar and no band

#### Scenario: The control expands and collapses the ribbon

- **WHEN** an author looks for a control that changes the canvas height
- **THEN** the Canvas tab carries none

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
- **THEN** the canvas carries the selection count and its delete control

#### Scenario: A reload returns the ribbon to collapsed

- **WHEN** an author reloads the Canvas tab
- **THEN** the canvas fills the body, as it did before the reload

#### Scenario: Saving a draft writes no ribbon state

- **WHEN** an author saves the draft
- **THEN** the saved `layout` blob carries no key naming a ribbon

#### Scenario: A short window holds the floor

- **WHEN** an author opens the Canvas tab in a window shorter than the floor
- **THEN** the canvas keeps 36rem and the page scrolls

### Requirement: The steps register lists every step in reachability order

The steps register SHALL NOT stand. The Canvas tab carries the canvas alone,
and no register of rows beside it.

The steps rail carries every step of the draft, in reachability order. That
rail and its rows belong to `studio-step-page`.

The process links SHALL NOT stand either. Those were Fields, Data sources,
Contract, Field matrix, Changes and Paths. The tab row carries each one now,
per `studio-process-tabs`.

#### Scenario: Every step takes a row

- **WHEN** a draft holds seven steps and an author opens the Canvas tab
- **THEN** the canvas draws seven nodes
- **AND** no register of rows stands beside them

#### Scenario: Rows follow reachability

- **WHEN** an author reads the draft's steps in reachability order
- **THEN** the steps rail carries that order, per `studio-step-page`
- **AND** the Canvas tab carries no such list

#### Scenario: An issue count prints on its row

- **WHEN** one step carries two open issues and another carries none
- **THEN** the first step's rail row carries a count of two
- **AND** the Canvas tab carries no row and no row count

#### Scenario: A row is a real control

- **WHEN** a keyboard author tabs through the Canvas tab
- **THEN** no register row takes focus, because no register stands
- **AND** the canvas keeps the one tab stop its keyboard requirement states

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The configuration pane's masthead names the step

<!-- Why: a remove control acts on one step; the canvas's delete control acts on a whole selection. -->
<!-- antislop: allow synonym-rotation -->
The masthead SHALL NOT stand. The step page carries the step's name line, its
first-step mark and its remove control. Those belong to `studio-step-page`.

The step's key field SHALL stand on the step page, beside the name line. The
key-derivation requirement below governs it.

The step's `id` SHALL stand in the step page's Developer view. That disclosure
carries the step's JSON as well, read-only.

The missing-translation warning SHALL stand beside the name line and beside
the description line. Those stay two of the six `LocalizedTextInput` sites
`studio-app` requires a warning at. Each warning is a sibling of its field,
never nested inside a label.

The step's open issue count SHALL stand on its rail row. That count totals the
step's own issues and those of its paths, timers and actions.

The outcome field SHALL stand in the step page's "How the case ends" section.
An end step declares its outcome on departure.

<!-- The scenario names below repeat the live spec's wording verbatim, so a delta can match them. -->
<!-- antislop: allow synonym-rotation -->
#### Scenario: The masthead shows the step's identity

- **WHEN** an author opens a step on the step page
- **THEN** the page carries the step's kind, its label, its key and its
  description
- **AND** the Canvas tab carries no masthead

#### Scenario: The label edits inline

- **WHEN** an author types a new label into the step page's name line
- **THEN** the draft's step label changes
- **AND** the key derives per the key-derivation requirement below

#### Scenario: The masthead keeps its translation warnings

- **WHEN** the content locale is `de` and the step's label carries no `de`
  value
- **THEN** the missing-translation warning stands beside the name line

#### Scenario: The masthead sets the initial step

- **WHEN** an author marks a step as the draft's first step
- **THEN** the draft's `workflow.initialStep` names that step
- **AND** the step page carries the first-step mark

#### Scenario: The overflow shows raw JSON

- **WHEN** an author opens the step page's Developer view
- **THEN** that disclosure carries the step's JSON, read-only

#### Scenario: The overflow offers step removal

- **WHEN** an author presses the step page's remove control
- **THEN** the step leaves the draft
- **AND** the step page holds the first remaining step in the rail's order

#### Scenario: The issue count covers a path's issue

- **WHEN** a step carries no issue of its own, and one of its paths carries a
  failing guard
- **THEN** that step's rail row counts one

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The configuration pane's sections follow the performed-by control

The step page's sections SHALL follow the performed-by control. A section
stands only where the step's kind declares it. `studio-step-page` states which
section each kind carries.

The performed-by control SHALL stand on the step page. Changing it SHALL
re-shape the page's sections at once. No section collapses there, so no open
section survives the change.

The no-assignment warning SHALL NOT stand on an end step. That mirrors the
existing rule: `terminal === true || assignment !== undefined`.

#### Scenario: A terminal step omits Paths and Timers

- **WHEN** an author opens an end step on the step page
- **THEN** the page carries no section for an outgoing path and none for a
  time limit
- **AND** one line states that an end step carries neither

#### Scenario: A terminal step suppresses the no-assignment warning

- **WHEN** an author opens an end step carrying no `assignment`
- **THEN** no no-assignment warning stands for that step

#### Scenario: A subprocess step swaps Assignment and Form for Subprocess

- **WHEN** an author opens a step of type `subprocess` on the step page
- **THEN** the page carries the section naming which process the step calls
- **AND** the page carries no Assignment section and no form section

#### Scenario: Leaving Subprocess drops its section

- **WHEN** an author changes performed-by from a call to another process, to
  a step someone works
- **THEN** the page drops the section naming which process the step calls
- **AND** the Assignment section and the form section stand at once

### Requirement: A palette offers Step, Subprocess, and End as an always-available way to add a step

The Canvas tab SHALL carry a palette at all times. The palette lists three
entries. They read as a step someone works, a call to another process, and an
end, per `studio-guided-vocabulary`. No entry prints "terminal".

Each entry SHALL be a drag source. Dragging one onto the canvas SHALL add a
step of that kind at the drop point. That SHALL use the same draft-mutation
method the steps rail's own add controls call.

The palette SHALL stay usable whatever the canvas selection holds. No expand
control gates it, because the canvas fills the tab's body.

A draft holding no step SHALL still reach the palette. The steps rail's foot
carries the same three controls, per `studio-step-page`.

#### Scenario: Dragging a palette entry adds a step

- **WHEN** an author drags the palette's step entry onto the canvas
- **THEN** a new step of type `task` stands at the drop point

#### Scenario: The palette works with nothing selected

- **WHEN** an author selects nothing on the canvas
- **THEN** every palette entry stays usable

#### Scenario: An empty draft adds its first step from the register

- **WHEN** a draft holds no step and an author opens the Canvas tab
- **THEN** the palette stands, and dragging its step entry adds a step of type
  `task`
- **AND** the steps rail's foot carries the same three add controls

#### Scenario: The palette names its entries in plain words

- **WHEN** an author reads the palette
- **THEN** the three entries name a step someone works, a call to another
  process, and an end

### Requirement: A process-identity header bar shows draft and publish status

The process surface SHALL carry a header bar above the tab row. The bar SHALL
print the process name and the key in the mono face. It SHALL carry the
draft's revision badge and dirty state. It SHALL carry the version and hash
after a publish. `EditorArea` computes all of these as controlled props. It
already lifts `saveState` the same way.

The header bar SHALL carry a last-saved time. That time is client-only state.
`EditorArea` sets it on every successful save.

The header bar SHALL carry the content-locale badge the `studio-app`
capability's content-locale-switcher requirement governs. It SHALL carry no
Structure control and no JSON control. That pair no longer stands. The JSON
surface opens from the tab row's overflow menu, per `studio-process-tabs`.

<!-- Why: "Discard draft" below is the literal button label `DraftToolbar` renders, not a synonym choice against "remove" elsewhere in this file. -->
<!-- antislop: allow synonym-rotation -->
The header bar SHALL carry a `⋮` overflow menu. The menu SHALL hold no Save,
no Discard draft and no Publish action. The studio's area nav carries those
three. `DraftToolbar` SHALL keep computing when each action is available and
what each one does. The area nav calls that logic and holds none of its own.

The menu SHALL hold its remaining controls under one heading: "Process, saved
with the draft". That heading SHALL hold the editable process key, the
base-locale control and the add-locale control. The `studio-app` capability's
base-locale requirement governs the second of those three. The add-locale
control keeps the behavior it carries today, and no capability declares it
yet. The
menu SHALL NOT offer an action-registry selector or any other session-only
control. Nothing in the studio ever loads a live `Registry` a
registry-resolution check could run against.

That heading SHALL also hold a "Manage assignment groups for this process"
link. The link SHALL open the admin area's Groups screen: the `admin-app`
capability's `/groups` route.

<!-- Why: "parameter" below names a URL query parameter, not a synonym choice against the performed-by control's own entries. -->
<!-- antislop: allow synonym-rotation -->
It SHALL carry the open process's id as a query parameter. That parameter
pre-filters the Groups screen to global groups plus groups already scoped to
this process.

The link SHALL appear once a process is open, for any signed-in actor. It
SHALL appear whether or not that actor holds `system:admin`. It SHALL appear
whatever tab the row holds open.

Following it without `system:admin` SHALL lead to one of two outcomes. The
same admin-area-entry gate every other admin route already crosses decides
which (`shell/areas.ts::mayEnter`). An actor can hold `system:datalists`, or
another role `mayEnter` accepts for the admin area, without holding
`system:admin`. That actor SHALL reach the admin area's own `MissingRole`
empty state. That is the state any `system:admin`-gated route gives a caller
without the role.

An actor who holds no admin-area-entry role at all SHALL never reach the admin
area's own code. The shell blocks entry before `AdminArea` mounts, and gives
its generic `area.forbidden` message instead.

The link SHALL carry no group data of its own. It SHALL trigger no request to
a `/admin/groups*` route: it is navigation only, so Studio duplicates no group
CRUD.

The header bar's summary fields SHALL stay a read-only pass-through of state
`EditorArea` owns. Those fields are the process name, the revision badge, the
dirty state, and the published version and hash. None of them carries logic of
its own.

#### Scenario: The header bar shows an unsaved draft's state

- **WHEN** the draft carries unsaved changes
- **THEN** the header bar prints the process name, the draft's revision badge,
  and a dirty indicator

#### Scenario: The header bar shows a just-published version

- **WHEN** a publish succeeds
- **THEN** the header bar prints the published version and its hash prefix

#### Scenario: The overflow menu invokes DraftToolbar's own save

- **WHEN** an author looks for Save in the `⋮` menu
- **THEN** the menu holds none
- **AND** the studio's area nav carries the Save control, which calls
  `DraftToolbar`'s existing save

#### Scenario: The overflow menu separates persisted settings from session-only settings

- **WHEN** an author opens the `⋮` menu
- **THEN** the process key, the base-locale control and the add-locale control
  stand under "Process, saved with the draft"
- **AND** no action-registry selector and no other session-only control stands
  anywhere in the menu

#### Scenario: The menu links to Groups filtered to the open process

- **WHEN** an author opens the `⋮` menu and picks "Manage assignment groups
  for this process"
- **THEN** the admin area's Groups screen opens, holding global groups plus
  groups already scoped to the open process

#### Scenario: Following the link with admin-area entry but not the admin role

- **WHEN** an actor who holds `system:datalists` but lacks `system:admin`
  follows the link
- **THEN** the admin area gives its own `MissingRole` empty state instead of
  the Groups screen

#### Scenario: Following the link with no admin-area-entry role at all

- **WHEN** an actor who holds neither `system:admin` nor `system:datalists`
  follows the link
- **THEN** the shell blocks entry to the admin area before it mounts
- **AND** it gives the generic `area.forbidden` message instead of the Groups
  screen

#### Scenario: The link renders regardless of the open surface

- **WHEN** an author holds the Paths tab open, not the Canvas tab
- **THEN** the "Manage assignment groups for this process" link still stands
  in the `⋮` menu

### Requirement: A step node on the canvas offers an inline rename

The canvas SHALL let an author rename a step's label directly on its node.
Renaming SHALL NOT need the step page's name line. Committing the rename SHALL
write `step.label` through the same Draft mutation that name line calls.

The field SHALL open seeded with the step's label resolved for the content
locale, and with nothing else. It SHALL NOT seed from the step's `key`, and it
SHALL NOT seed from the unnamed-step string. A step carrying no entry for the
chosen locale therefore opens an empty field. The author then writes a
translation, rather than committing a copy of the key as a label.

#### Scenario: Double-clicking a node's label opens an inline text field

- **WHEN** an author double-clicks a step node's label on the canvas
- **THEN** a text field opens on the node, seeded with the step's current
  label

#### Scenario: Committing the inline rename updates the step's label

- **WHEN** an author writes a node's inline text field and commits it
- **THEN** the step's `label` changes through the same Draft mutation the step
  page's name line calls

#### Scenario: A step with no translation opens an empty field

- **WHEN** the content locale is `de`, a step's `label` carries only its
  base-locale entry, and the author opens the inline rename
- **THEN** the field opens empty, carrying neither the base-locale text nor
  the step's key

#### Scenario: Enter inside the rename field opens no inspector

- **WHEN** the inline rename stands open and the author presses Enter
- **THEN** the rename commits, and the canvas handler neither selects the step
  nor opens the step page on it

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The masthead's step key auto-derives from the step label

The step page's key field SHALL auto-fill from the step's label as an author
types. This holds for a step whose key is empty. It also holds for a step
whose key still matches the derivation from the label's prior value.
Derivation SHALL follow the same rule the header bar's process key uses.

This auto-fill and lock behavior SHALL apply through both label-writing
routes. Those routes are the step page's own name line, and the canvas node's
inline rename. The two routes count as one for this purpose. A rename through
either route SHALL keep the step's key in agreement with the other. A key
locked by a hand-written value through either route SHALL stay locked through
the other.

The step page SHALL append `_2` when the derived key collides with another
step's key in the draft's workflow. If that also collides, the page SHALL
append `_3`. It SHALL keep incrementing the suffix until the candidate is
unique among the draft's steps.

The first value typed directly into the key field SHALL disable this auto-fill
for that step. That holds for the rest of the draft's lifetime in the browser.

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

#### Scenario: A step renamed via the canvas node's inline rename derives its key the same way

- **WHEN** the developer double-clicks a new step's canvas node
- **AND** the developer types "Manager review" via the inline rename, having
  never touched its key field
- **THEN** the step's key reads `manager_review`. Typing the same label into
  the step page's name line reads the same

#### Scenario: Editing a non-base-locale translation leaves an already-derived step key untouched

- **WHEN** the developer types a base-locale step label, deriving a key, then
  switches the studio's content locale
- **AND** the developer types a translation into the step label's
  non-base-locale entry
- **AND** the developer does this via either the step page's name line or the
  canvas node's inline rename
- **THEN** the step's key stays unchanged

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The masthead's type and terminal controls render as a "performed by" segmented control

The step page SHALL render the step's existing `type` and `terminal` fields as
a segmented control of three entries, labeled "performed by". The three
entries take the plain phrases `studio-guided-vocabulary` states. They read as a step
someone works, a call to another process, and an end.

The control SHALL set the same two fields it sets today. It adds no new field.
The word `terminal` SHALL NOT stand on it.

<!-- The scenario name repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
#### Scenario: Choosing a "performed by" option sets the step's type

- **WHEN** an author picks the call-to-another-process entry in a step's
  "performed by" control
- **THEN** the step's `type` becomes `subprocess`, the same field the control
  already sets

#### Scenario: The control names an end in plain words

- **WHEN** an author reads a step's "performed by" control
- **THEN** its third entry reads as an end
- **AND** no entry prints "terminal"

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The masthead constrains a terminal step's outcome to the process's declared outcomes

The outcome field stands in the step page's "How the case ends" section. When
the draft's contract declares one or more `outcomes`, that field SHALL offer
only those values, not free text.

Without a contract, or with a contract that declares no outcomes, the field
carries no validated meaning. It SHALL stay a free-text field.

#### Scenario: The developer picks an outcome from the declared list

- **WHEN** the developer opens an end step on a draft whose contract declares
  one or more outcomes
- **THEN** the outcome field offers only those declared outcomes as choices

#### Scenario: An outcome field stays free text without a declared outcome list

- **WHEN** the developer opens an end step on a draft with no contract, or a
  contract that declares no outcomes
- **THEN** the outcome field accepts any text

### Requirement: A set of several steps offers a count and a delete control

The canvas SHALL carry the set's count while the set holds more than one step.
It SHALL carry a control that deletes every step in the set.

The step page holds one step, and a set of several names no one step for it.
The canvas summary therefore carries the set's own controls.

<!-- Why: a remove control acts on one step; the delete control here acts on a whole selection. -->
<!-- antislop: allow synonym-rotation -->
The delete control SHALL take each step in the set out of the draft's
`workflow.steps`. It SHALL leave a path that points at a deleted step as it
is. The step page's own remove control leaves such a path today, and the
checks rail reports it.

The draft SHALL take the first remaining step as its `workflow.initialStep`
when the deleted set held it. That is the rule one step's own removal applies
today.

The summary SHALL also carry a control that groups the set. Grouping SHALL
create a group holding exactly the selected steps, with a name the author can
change. It SHALL leave the selection as it is.

The control SHALL refuse a set that any group already holds. A step SHALL
belong to at most one group, so nothing has to decide which box draws it.

When the selection exactly matches one group's members, the summary SHALL
carry that group's own controls instead. Those are its name, a collapse
control and an ungroup control.

The `studio-checks-rail` capability carries the checks rail's own home. The
canvas summary docks none of it.

The set SHALL be empty after the delete.

#### Scenario: Two selected steps show a count

- **WHEN** an author selects two steps
- **THEN** the canvas summary reports a count of two
- **AND** the step page holds no section for the set

#### Scenario: The delete control deletes every step in the set

- **WHEN** an author has selected three of five steps
- **AND** activates the delete control
- **THEN** the draft holds the other two steps alone
- **AND** the canvas summary leaves

#### Scenario: Deleting the initial step moves the marker

- **WHEN** the set holds the draft's initial step and an author deletes it
- **THEN** the draft's `workflow.initialStep` names the first remaining step

### Requirement: The inspector's Paths and Timers tabs render from compiled styles

`panels/PathsPanel.tsx`, the body of the step page's Path to section, SHALL
render from compiled component styles. The rendered result SHALL match the
previous stylesheet declaration for declaration.

`panels/TimersPanel.tsx`, the body of the Time limit section, renders no class
this migration covers. It already satisfies this requirement, unchanged.

#### Scenario: The Paths tab keeps its look

- **WHEN** a browser opens the step page's Path to section
- **THEN** its computed layout, spacing, color and border equal the values
  the deleted stylesheet declared

### Requirement: The bench renders from compiled styles

The steps rail, the step page and the Canvas tab's own chrome SHALL render
from compiled component styles, reading `form-ui/tokens.stylex`. No literal
class name stands in any of the three beyond the `.btn` family and the three
exceptions `web-styling` pins.

Every string a person reads in the three SHALL come from the studio catalog.
That includes the no-assignment warning, the section names, and the end
step's one-line explanation.

#### Scenario: The bench carries no stray literal class

- **WHEN** a browser renders the steps rail, the step page and the Canvas tab
- **THEN** no element inside the three carries a literal class beyond the
  `.btn` family, `canvas-node`, `panzoom-exclude` and `studio-dialog`

#### Scenario: The no-assignment warning reads from the catalog

- **WHEN** an author opens a step someone works that carries no assignment
- **THEN** the warning's text resolves through the studio catalog's `t`

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The edit screen's own layout renders from compiled styles

`screens/` collapses its edit screen and its panels screen into one process
surface component. That component's own layout SHALL compile from typed
StyleX style objects. The layout covers the header bar, the tab row and the
tab body. The rendered result SHALL match the previous stylesheet declaration
for declaration.

#### Scenario: The edit screen keeps its look

- **WHEN** a browser opens the process surface
- **THEN** its computed layout equals the value the deleted stylesheet
  declared

#### Scenario: The group-rename label still renders correctly, unmigrated

<!-- This scenario's title predates the change that ended the state it names; the title stays so a later delta reads this as one scenario evolving. -->
- **WHEN** the canvas draws a group's rename label
- **THEN** it carries no literal `canvas-group-name` class
- **AND** its computed style, including its `cursor: grab` affordance, equals
  the value the deleted stylesheet declared

## REMOVED Requirements

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The configuration pane shows the step as a register of sections in runtime order

**Reason**: The step page stands its sections open in two columns, so no
runtime-order register of collapsible sections stands.

**Migration**: The `studio-step-page` capability carries the sections. Its
"The step page stands its sections open in two columns" requirement states
which section each step kind carries.
