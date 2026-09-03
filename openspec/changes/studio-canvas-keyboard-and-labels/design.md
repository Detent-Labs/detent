## Context

The canvas is the studio's primary authoring surface. It draws a step as an
SVG `<g>` and a path as an SVG polyline. Pointer events drive every one of
them. `CanvasView.tsx` is 1056 lines and holds one `aria-label` and one
`onKeyDown`. Both sit on the inline rename input.

Nine pure modules already sit beside it in `canvas/`: `arrange`, `connection`,
`dropGesture`, `fit`, `geometry`, `groups`, `inlineRename`, `layout` and
`selection`. They hold eleven computations between them. `geometry` carries
the anchor rule and the waypoint rule beside its own. The `studio-canvas` spec
counts computations rather than files. It requires each one to hold without
rendering, and this change adds the twelfth.

The field matrix already does the keyboard work, in `FieldMatrixGrid.tsx`. It
gives the grid a roving `tabindex` and arrow keys on both axes. Enter
activates a cell, and Escape hands the stop back. The `spa-accessibility` spec
records that pattern. This change follows it rather than inventing a second
one.

`packages/web` carries no DOM harness. There is no jsdom, no happy-dom and no
testing-library. Every component test calls `renderToStaticMarkup`. A role, a
`tabindex` and an `aria-label` are visible in that markup. A focus move is
not.

The precedent for such a test is
`packages/web/test/studio-fieldMatrixGrid-bulkBadges.test.tsx`. It wraps the
component in `DraftProvider` and reads the output of `renderToStaticMarkup`.
That provider seeds its content locale from `initial.baseLocale`
(`draft/store.tsx:86`), so a German fixture sets that field.

Two files this change edits already carry uncommitted work from
`studio-publish-gate-and-report`: `areas/studio/app.css` and
`i18n/catalogs/studio.ts`. Sections 2 and 8 land on top of those edits, not on
`main`.

## The shape brief

This section carries the `/impeccable shape` result the project's conventions
need. The owner fixed the traversal model before the run. The brief records
that decision and settles what the model leaves open. No discovery round ran.
Each assumption below states itself where it stands.

**Job and audience.** A process author opens `/processes/:id/edit` to build a
definition. The visitor mode is Operate. The author's success is a step
selected and its inspector open.

**Outcome and proof.** The canvas must answer the keyboard the way it answers
the pointer. The proof is a step selected, an inspector open, and a path's
guard reached, with no pointer touched.

**Selected direction.** Traversal follows the paths. The paradigm is a state
machine of steps joined by explicit paths. Walking a path teaches that
structure while moving through it. A spatial model and a flat list model both
lost. Neither says anything true about the process.

**Scope and boundaries.** The canvas, its nodes, its paths and its group
boxes. The palette, the toolbar, the dock and the inspector already carry real
buttons, and this change leaves them alone. Drag-to-move and drag-to-connect
stay pointer gestures. Panel parity already covers them.

**Interaction and layout.** The canvas is one stop in the page's tab order.
Inside it a roving `tabindex` moves. Left and Right walk the graph. Up and
Down walk a list. Enter selects. Escape hands the stop back to the canvas.

**Constraints.** Zero radius, one accent, and a 2px focus ring at 2px offset.
The chrome words ship in English, which is what the studio catalog carries. An
SVG element takes no CSS outline the way a DOM button does, so the canvas
draws the ring instead.

## Goals / Non-Goals

**Goals:**

- A keyboard author selects any step and opens its inspector.
- A keyboard author reaches a path, and through it the guard it carries.
- A screen reader names a step, its kind, its outcome and its fan.
- The canvas prints the label an author wrote, in the locale they chose.

**Non-Goals:**

- Moving a step by keyboard. Position is layout, not body, and the panels
  carry no move affordance either. A later change may add it.
- Creating a path by keyboard. The Paths panel already does that, and
  `spa-accessibility` already requires the panel route to be operable.
- A second traversal for the dock's Paths tab. That tab is a table of rows.
- Any change to the definition contract. Nothing here touches `src/`.
- German chrome strings for the studio. That catalog ships English alone, by
  an earlier decision this change does not reopen.
- The field matrix's own duplicated key line. It carries the same defect and
  belongs to `studio-app`. A follow-up change owns it.

## Decisions

### Two localization mechanisms meet here, and they are not the same

An earlier draft of this proposal said the new names ship in English and
German. That was wrong. It is worth naming, so the next reader does not
repeat it.

The studio's chrome words come from a catalog. The export at
`packages/web/src/i18n/catalogs/studio.ts:472` is `{ en }`, with no `de` map.
`packages/web/src/areas/studio/catalog.ts:7` declares `t(key: CatalogKey)`,
which takes no locale. `.claude/rules/design-language.md:146` states that
rule.

So the catalog keys this change adds ship in English alone. No parity
assertion covers them either. `TWO_LOCALE_AREAS` omits studio, at
`packages/web/test/i18n-catalog-parity.test.ts:16`.

A step's `label` is a different thing. An author wrote it, and it is
`LocalizedText` in the definition. `resolveDraftLocalizedText` resolves it
against the studio's content locale. The fallback is the draft's `baseLocale`.
That value does localize.

So a node rendering at content locale `de` prints the German label an author
wrote. The chrome words around it stay English. Both facts hold at once.

### Traversal follows the paths, and Up/Down follows the step order

The owner fixed the four bindings. Tab enters the canvas at the initial step.
Right follows an outgoing path to its target. Left follows an incoming path
back to its source. Enter selects the focused step and opens the inspector.

Up and Down were open. They take the draft's step order, the order
`workflow.steps` holds. That closes a hole the path model leaves. Left and
Right cannot reach a step with no path at all. A newly added step is exactly
that step. Up and Down reach every step in the draft, orphan or not.

An author can see that order. The field matrix draws one column per step, in
`workflow.steps` order. It reads `draft.workflow?.steps` at
`FieldMatrixGrid.tsx:136`, and the order is stable across a session.

The rule reads the same on both axes. Left and Right mean "along the graph".
Up and Down mean "the next sibling in the current list". The field matrix
already teaches an author that arrow keys move within a surface.

### A path is a focusable control, and that settles the fan

A step may carry several outgoing paths. Right cannot pick one of them and
stay honest about the rest.

So focus alternates. Right from a step moves to that step's first outgoing
path. Right again moves to that path's target step. Left from a step moves to
its first incoming path, and Left again to that path's source.

While focus sits on a path, Up and Down walk the fan that path belongs to.
The fan is the set of paths sharing the end the author arrived from. A path
entered from its source walks the source's outgoing set. A path entered from
its target walks the target's incoming set. One field on the focus state
records which end that was.

The alternative was a mode on the step. Up and Down would arm one outgoing
path, and Right would commit it. That needs a second visible state on the
node and teaches nothing. This change drops that shape.

The path needs focus anyway. The reason is a keyboard one, not a pointer one.
A pointer already reaches a path anywhere along its route. The whole
`<g className="canvas-edge-group">` carries an `onPointerUp` that calls
`onSelectStep(step.id, path.id)` (`CanvasView.tsx:833-842`). A full-route
`.canvas-edge-hitarea` sits under it (`CanvasView.tsx:853`).

What no route offers is a tab stop, a role and a name. The guard label's
`<div>` carries none of the three. It duplicates a pointer route that already
works.

### The `Focus` type names four kinds, not two

An earlier draft typed a focus as a step id or a path id. Three rules then had
no return type to name. The collapsed-group substitution returns a group box.
The entry point returns a group box or the `<svg>` root.

The type widens rather than the rules narrowing. Narrowing would delete the
four-step entry-point fallback, which exists so the canvas never leaves the
page's tab order. It would also delete the collapsed-box landing, which exists
so the keyboard never lands on a step nobody can see. Both are owner
decisions, and neither is worth trading for a smaller union.

So a `Focus` names a step, a path, a group or the surface root. A path focus
also carries the end the author arrived through.

### The traversal is total over a deep-partial draft

The traversal module reads a `Draft`. That type is
`DraftOf<AuthoredProcessBody>`
(`packages/web/src/areas/studio/draft/types.ts:12-21`). `DraftOf` makes every
property optional, through arrays and nested objects alike. So `step.id`,
`path.id`, `path.to`, `path.trigger`, `path.priority` and
`workflow.initialStep` all go absent while an author edits.

The definition contract's fan invariants describe a published `ProcessBody`.
`checkPathTriggerConsistency` (`src/schema/definition.ts:715-739`) rejects a
bad fan at publish time. It does not stop one existing in a draft. The JSON
view is a documented escape hatch that can write one.

`CanvasView` itself already guards for this. Those guards define the reachable
set. Below is every decision in `CanvasView.tsx` and `groups.ts` about whether
a node, a path or a box draws. Three review rounds each found one more than
the last. This list comes from reading both files end to end.

| Site | Guard | Rule below |
|---|---|---|
| `CanvasView.tsx:272` | an id-less step gets no position | No id, no focus |
| `groups.ts:29-31`, via `:290` | fewer than two members resolve | A group draws a box only where two resolve |
| `CanvasView.tsx:720` | `!box`, already filtered at `:290` | none needed |
| `CanvasView.tsx:747` | the source step carries no `id` | A path on an id-less step |
| `CanvasView.tsx:755` | `!path.to` | A path needs an `id` and a `to` |
| `CanvasView.tsx:766` | no source or target box, from `groups.ts:74` | A path must resolve both ends |
| `CanvasView.tsx:767-769` | both ends in one collapsed group | A path must resolve both ends |
| `CanvasView.tsx:885` | the step carries no `id` | No id, no focus |
| `CanvasView.tsx:886` | the step hides, from `groups.ts:53-59` | Traversal skips a hidden member |

Nothing else in either file decides whether one of those three draws. These
conditionals pick a child, a decoration or a pointer set instead:

- `:297`: the marquee's and the connect drag's target list
- `:737`: the member count inside a collapsed box
- `:792`: whether a path gets a guard label
- `:816`: the waypoint handles on the selected path
- `:854` and `:859`: the priority badge and the else marker
- `:869`: the connect-drag preview line
- `:918`, `:927`, `:933`, `:958`, `:964`: children of a node that draws
- `:1049`: the reject message

The `<svg>` root at `CanvasView.tsx:698` renders unconditionally, so the
fourth entry-point fallback always has an element. `positionOf`
(`CanvasView.tsx:265-269`) never returns undefined. So `positionsById` holds
an entry for every id-carrying step. The group rule's wording below is the
same condition as the position test at `groups.ts:29-31`.

A module whose whole justification is purity and totality cannot rest on
invariants its input type does not carry. Each rule below is therefore total.

**No id, no focus.** A step with no `id` renders nothing today. The traversal
skips it, and it holds no place in the Up/Down order.

**A path needs an `id` and a `to`.** Lacking either, the traversal skips it.
The synthetic React key is a drawing detail, not an identity. `data-path-id`
is already `undefined` for such a path. Focusing one would name a target no
caller can resolve.

A `Focus` names that id and the end the author arrived through. The traversal
resolves a path by scanning every step's `paths`. Where a deep-partial draft
repeats one id, the first match wins.

**A path must resolve both ends.** A dangling `to` is unreachable. So is a
path with both ends inside one collapsed group. The canvas draws neither, at
`CanvasView.tsx:766` and `:767-769`.

**A path on an id-less step is unreachable too.** The edge pass has its own id
check, at `CanvasView.tsx:747`. It runs before the pass reads the step's
`paths`. So an id-less step's whole path set goes undrawn, however complete
each path is. The incoming-path walk scans every step's `paths` for a matching
`to`. Without this rule it would reach an edge the canvas never painted.

**A group draws a box only where two of its `stepIds` resolve.** Below that,
`groupBox` returns nothing (`groups.ts:29-31`). Then `hiddenStepIds` hides
nothing (`groups.ts:56`), so the member step is still drawn and still
clickable.

A traversal reading `group.collapsed` alone would mark that step hidden and
unreachable. The keyboard would then lose a node the pointer still reaches. A
group that draws no box is no entry point, and no substitute for a hidden
step.

**Array order is the base.** A fan is the step's own `paths` array, filtered
to the reachable paths. That order never compares against `undefined`.

**One condition admits `priority`.** Every path in the fan is automatic. Every
one carries a `priority` that no sibling repeats. Then the fan sorts by that
number, ascending. A mixed fan keeps array order. So does a fan missing one
`priority`, and a fan repeating one.

**A missing `trigger` is neither kind.** Such a path keeps its array place. Its
presence alone puts the whole fan back into array order.

**The entry point falls back four times.** It is `workflow.initialStep` when
that names a reachable step. Otherwise the first reachable step in
`workflow.steps` order. Otherwise the first group box. Otherwise the `<svg>`
itself. Where `initialStep` names a step inside a collapsed group, the entry
is that group's box.

That last fallback matters more than it looks. Under a roving `tabindex`, a
surface where nothing carries `tabindex=0` leaves the page's tab order
altogether. A brand-new draft carries no `initialStep`. It would then be worse
than today, where the canvas at least holds a focusable rename input. The
`<svg>` always exists, so the canvas always keeps its stop.

**A vanished focus falls back to the entry point.** Two ordinary edits
invalidate a focus. Neither changes the draft's step identities. Collapsing
the group around the focused step is one, through the box's own Enter or
through the selection toolbar. Deleting the focused step or its path from a
panel is the other.

Holding the stale id would leave `focus()` a no-op on an element that does not
exist. No element would then carry `tabindex="0"`, and the canvas would leave
the page's tab order. So the component re-runs the entry-point function
whenever the current focus stops resolving.

### The boundary does not wrap and does not beep

Right on a terminal step moves nothing. Left on the initial step moves
nothing. Wrapping to the far end would teach a cycle the process does not
have. This engine's claim is that every state is explicit.

The list axis takes the same rule. Down on the last step in `workflow.steps`
moves nothing, and Up on the first moves nothing. So does Down at either end
of a fan. No axis wraps.

Silence on a keypress is normally a defect. The node's own name already
carries the fact, before the author presses the key. A terminal step announces
its outcome and its empty fan. This change leaves out a live region for the
boundary.

`ponytail: no live region at the boundary. Add one if the browser check finds an author pressing Right repeatedly on a terminal step.`

### The `<svg>` takes `role="application"`

The role is not cosmetic. Picking it wrong makes the whole change useless to
the reader it serves. Under NVDA and JAWS browse mode, the reader intercepts
an arrow key for its own navigation. The key never reaches the element's
`onKeyDown`. The traversal would then work for a sighted keyboard author and
do nothing for a screen-reader author.

The `application` role turns browse mode off inside the subtree, so the keys
reach the handler. The price is that the reader stops offering its own
navigation there. Every element inside must then be a named control. That is
what this change makes each node, each path and each group box.

A listbox, a tree or a grid pattern would also pass the keys through. Each
would state something false about the surface. A process graph is not a list,
not a hierarchy and not a table.

Every key press inside the `<svg>` bubbles to that handler, including one from
the inline rename input. The rename input at `CanvasView.tsx:944-947` stops
neither Enter nor Escape today. The canvas handler therefore returns early for
an event whose target sits inside a text-entry field.

The `<svg>` also takes an `aria-label` naming the graph, and `tabIndex={-1}`.
Escape moves focus back to it. A `focus()` call on an element with no
`tabindex` is a no-op that drops focus to `<body>`. Where the entry point
falls all the way through, the `<svg>` carries `tabIndex={0}` instead.

Escape also hands the roving stop over. The root takes `tabIndex={0}`, and
every node, path and box drops to `-1`. Without that move Tab walks straight
back in. Focus navigation resumes from the focused element's document
position, and the roving `0` still sits inside the `<svg>`. Re-entering the
canvas lands on the root, and an arrow key from there moves to the entry
point.

### The canvas draws the focus ring, rather than styling it

DESIGN.md fixes the indicator. It is a 2px accent outline at 2px offset, on
every focusable thing. A CSS `outline` does not follow an SVG shape, so the
ring is an element.

Each node group carries a `<rect class="canvas-node-focus-ring">` sized three
pixels larger than the node on each side. It has no fill and a 2px accent
stroke, painted centered on that edge, so the gap reads 2px. CSS hides it by
default. The rule `.canvas-node:focus-visible` makes it visible. The state
comes from the attribute the DOM already carries, which is the design
language's own rule.

The stroke takes `vector-effect="non-scaling-stroke"`. Without it the canvas
zoom scales the ring, and the 2px token becomes whatever the zoom says. The
offset scales with the node, which is correct. The ring must hug the shape.

**The node's ring takes a dash.** That dash separates focus from selection.

A selected node draws the same 2px accent, so only the ring's 3-unit offset
stands between the two. That offset scales with the node while the stroke does
not. At the 0.612 default fit the gap renders 1.84px, and the two bands read
as one.

Widening the gap cannot fix that, because every zoom rescales it. The dash
costs no width and no colour. It holds at every zoom: the non-scaling stroke
measures the pattern in screen pixels too.

**A path takes a halo, not a ring.** The node's rule is a 2px stroke held 2px
off the shape. A line cannot hold anything off itself. A stroke has no offset,
and a ring sharing the edge's own `d` is the edge, repainted.

A 2px accent stroke on that `d` therefore recolors the line. That is what
`.canvas-edge-group-selected .canvas-edge` already draws (`app.css:2805-2807`),
so focus and selection would read alike. It also erases the `5 4` dash
`.canvas-edge-manual` carries (`app.css:587-590`).

So the indicator becomes a band around the shape. A sibling `<path>` sits
before the edge, sharing that edge's `d`. It takes no fill, the accent stroke,
a `stroke-width` of 6 and the same vector effect. It carries no
`stroke-dasharray`.

The 1.5px edge then paints over the halo's middle. A manual path keeps its own
dash, and about 2px of accent reads on each side. The same `:focus-visible`
rule makes the node's ring and the path's halo visible.

**The node and the path each set `outline: none`.** A bare `:focus-visible`
rule sits at `packages/web/src/shell/tokens.css:129-132`. It gives every
element a 2px accent outline at 2px offset. It matches an SVG `<g>` carrying a
`tabindex` too, and Chrome and Firefox both paint an outline on an SVG
element.

That outline does not follow the shape, but it does draw a bounding box.
Without the suppression a focused node draws two rings. The browser check
counts them.

Two focus targets keep that global outline, because neither draws a ring
element. The `<svg>` root is one, and its ring would have to wrap the whole
surface. The `spa-accessibility` rule scopes the drawn ring to an element
inside the surface, and the root is not one. The group's disclosure button is
the other. It is HTML, so the outline follows it already.

### The node rect loses its radius in this change

The node rect carries `rx={2}`. That is an SVG presentation attribute, so no
token reaches it. DESIGN.md's zero-radius rule admits no exception. The
subprocess rect inside the same node already draws `rx={0}`, so the two
corners in one node disagree today.

This change fixes it here rather than deferring it. The focus ring attaches to
that same element, and the ring's geometry assumes a square corner. Deferring
would mean writing a ring around a radius that is about to go.

### A collapsed group is a disclosure, and traversal skips its members

A group box is not a step. It gathers steps and can collapse them out of
sight.

The box carries a disclosure button in both states, at its own corner. That
button carries `aria-expanded`, an accessible name and a roving `tabindex`.
Enter toggles the collapse. The box sits in the Up/Down step order immediately
before its first member.

That order holds the box in both states. A button with no place in it takes no
roving stop. No key then reaches the disclosure, which fails WCAG 2.1.1. Only
a collapsed group's member loses its own place, because the box stands in for
it. An expanded group's members keep theirs, after the box.

The button's name identifies the group, so a reader announces which group it
opens. It comes from a catalog key filled with `group.name`. The alternative
was the name a `role="button"` computes from its subtree, over the box's own
`<text>` children at `CanvasView.tsx:734`. That rests on a computation nothing
here tests, and a real button carries its own label anyway.

A step hidden inside a collapsed group is not focusable and not drawn.
Traversal skips it. Where a path's far end hides, Right or Left lands on the
collapsed box. That box is the element the path already anchors on. The author
then presses Enter to open the group and continues.

**The toggle needs a prop nobody has written.** `CanvasView`'s `Props` carries
`groups: StepGroup[]` and no writer (`CanvasView.tsx:69`). The box handlers
at `CanvasView.tsx:726-732` drag and select. None of them touches `collapsed`.

The real toggle is a selection-toolbar button at `EditScreen.tsx:541-552`. It
writes through `onGroupsChange` (`EditScreen.tsx:197`). `CanvasView` has one
call site, `EditScreen.tsx:491`, so threading that writer through stays
contained.

**The box needs a target for `aria-controls`.** No member node carries a DOM
`id` today. The node group at `CanvasView.tsx:907-908` uses a React `key`,
which never reaches the markup. A collapsed group draws none of its members,
because `CanvasView.tsx:886` returns null for a hidden step.

So the node pass wraps each drawn group's members in one `<g>`, carrying
`id="canvas-group-members-<groupId>"`. The wrapper renders in both states. A
collapsed group's wrapper holds nothing. The button's `aria-controls` names
it, so the attribute never points at an absent element.

### The group's disclosure is a real button in a corner `<foreignObject>`

An earlier draft carved the group box out of the live disclosure requirement.
Two claims held that carve-out up. The file disproves both.

The first claim was that an `<svg>` cannot host a real button. The canvas
already places HTML in a `<foreignObject>` twice. The rename `<input>` sits at
`CanvasView.tsx:934-949`, in a rectangle 22 units tall inside the node group.
The guard label's `<div>` sits at `:993-1002`.

The second claim was that a wrapper over the box would cover its members. The
file's own comment at `CanvasView.tsx:716-718` says the opposite. Groups draw
first, so every node and every route sits over them. The group pass runs at
`:719`, the edge pass at `:746`, the node pass at `:884`. Anything drawn on a
group box paints under every node.

So the box gets a real `<button type="button">`. It sits in a 20 by 20
`<foreignObject>` at the box's bottom-right corner. The box margin is 20 user
units (`groups.ts:22`), so that corner stands clear of the outermost member.

Paint order decides the rest, and it is why the buttons draw last inside the
`<svg>`. The section below states that rule in full.

**The drag gesture survives.** The box handlers are not the reason. That `<g>`
carries `onPointerDown`, `onPointerMove` and `onPointerUp`
(`CanvasView.tsx:729-731`). Those three drive the whole-group drag. The button
draws in the late pass, so it is a sibling of that `<g>` rather than a child.
Its own pointer events never bubble through those handlers.

Two things do reach it. Panzoom binds its down-handler natively on
`.canvas-wrap`, above the whole surface (`CanvasView.tsx:182-194`). The
marquee's own capture handler reads the target on the way down
(`CanvasView.tsx:520-522`). Neither is stoppable from a React handler on the
button.

So the guard is `panzoom-exclude`, which both existing `<foreignObject>`s
carry. Both of those two test for that class before they act. The button also
stops its own pointer events, the way the rename input does at
`CanvasView.tsx:943`. That keeps a press off the `<svg>`'s own handlers.

**No carve-out ships.** The `spa-accessibility` delta writes no MODIFIED
disclosure requirement. This change satisfies the live rule rather than
excepting itself from it. The `StepsPanel` header still owes its own fix.

### The two collapse controls agree on `aria-expanded`

A collapse control already exists. The selection toolbar draws one at
`EditScreen.tsx:544`, carrying `aria-pressed` over the same collapsed flag.
It does not rescue the requirement. It appears only after selecting the
group's members on the canvas, which today needs a pointer.

The two controls should agree, and they should agree on `aria-expanded`. Both
write the same `group.collapsed` flag through the same `onGroupsChange`. The
live disclosure requirement names `aria-expanded` for an element that expands
or collapses adjacent content. A pressed-state attribute says nothing about
what the control discloses.

So this change swaps that one attribute and adds the matching
`aria-controls`, naming the same members `<g>` the canvas button names. Both
sit in the same document, so the id reference resolves either way. It is one
line in a file this change already edits for the groups writer.

**That second attribute is conditional.** The wrapper `<g>` exists only for a
group the canvas draws a box for. Below two resolvable members `drawnBox`
returns nothing (`groups.ts:29-31`). A step delete can leave a group at one,
and `EditScreen.tsx:189` filters `stepIds` to the steps the draft still holds.

The helper `groupMatching` still matches that group when the author selects
its one step (`groups.ts:92-95`), so the toolbar's button renders. Naming an
absent element there is the same hazard the canvas button already avoids. The
toolbar's button therefore carries `aria-controls` only where the box draws.

### The step node prints the label

`stepLabel` puts its operands in the right order. It resolves the label first,
falls back to the key, and falls back to the unnamed-step string last. The
expression already exists at `FieldMatrixGrid.tsx:258`, so this is a copy
rather than a fresh derivation.

**The key line hides where the label line prints the key.** The second line
reads `step.key ?? ""` today (`CanvasView.tsx:955-957`). No condition guards
it. That is what makes every node read "capture / capture".

Reordering the operands alone does not fix the fallback case. A step whose
label resolves to nothing prints its key on the label line. It would then
print that key again below. This change exists to stop a node printing one
value twice, so the fallback gets no exemption. The key line draws only where
the two strings differ.

The rename seed does not reuse `stepLabel`. `startRename` seeds from
`resolveDraftLocalizedText` alone, with no fallback. A step whose label has no
entry for the chosen locale opens an empty box. The author then writes a
translation. Seeding from the key would hand them a copy of the key, which
they would then commit as the label.

`commitRename` needs no change. It already patches `step.label` through
`inlineRenamePatch` and derives the key through `nextStepKey`.

**Two more step headings get the same expression.** Those are
`StepsPanel.tsx:173` and `FormEditorScreen.tsx:419`. Both print
`step.key || t("steps.unnamedStep")`, which reaches no label at all.

They are one line each, and they carry the same defect the
`authored-content-localization` requirement names. Leaving them would make
that requirement true only on a literal reading. The canvas would say "Capture
the request". The inspector heading for the same step would say "capture".

**The field matrix's own double print is a named follow-up.** Its column
header already orders the operands correctly, at `FieldMatrixGrid.tsx:258`. A
sibling `<span class="studio-matrix-col-key">` prints `step.key` beside it, at
`FieldMatrixGrid.tsx:260`. So a step whose label resolves to nothing prints
its key twice there, exactly as the canvas node does today.

That is the same defect, in a surface this change does not otherwise touch. It
stays out of scope on purpose, and it needs the same one-line condition the
canvas gets in task 7.2. A follow-up change owns it, under `studio-app`, which
holds the field matrix.

### The accessible name of a step

The name reads in one order: the resolved label, the key, the kind, the
stamps, and the fan. A task step named Capture with two outgoing paths
announces "Capture, capture, Step, 2 outgoing paths". A terminal step adds its
outcome. The initial step adds that it is the entry point.

The kind word comes from the step's `type` and its `terminal` flag. The three
words are the palette's own, `palette.step`, `palette.subprocess` and
`palette.end`. The name reuses them rather than adding a second set. The
palette title-cases them for a button, and a reader announces "Step" and
"step" alike.

The fan count picks between two templates. A single fixed plural announces "1
outgoing paths" on every step carrying one path. So the singular takes a key
of its own, and the count still fills the slot in either template.

### The accessible name of a path

The name reads the path's label, its source step, its target step, its
trigger, and its guard. The guard is the last base segment. An automatic path
appends its priority after it. A guardless default at the highest priority is
a fact an author needs.

The guard is a slot rather than an appended key. Every path either carries a
guard or says it carries none. The base template `canvas.pathLabel` holds that
slot. A guardless path fills it with `canvas.pathLabelNoGuard`. Every slot
takes a value, which keeps the appended-segment rule below true.

**The slot takes the readable guard, not the CEL source.** A reader hears the
summary instead. The canvas already draws that summary through
`guardEdgeLabel`. Its own `<div>` carries `aria-hidden`, so a reader reaches
the raw source alone.

The name now takes the string `guardEdgeLabel` returns. That function returns
the source itself where nothing resolves, which is the honest fallback.

The trigger slot takes the same treatment. A deep-partial draft holds a path
carrying no `trigger`, and the traversal already answers for one. Such a path
fills that slot with `canvas.pathLabelNoTrigger`. Leaving it empty would print
the string this rule exists to stop.

### Each conditional segment of a name is its own key

`canvas.nodeLabel` and `canvas.pathLabel` are the two base templates. Neither
can express a segment that is sometimes absent. Filling an unused slot with an
empty string prints "Capture, capture, Step, , 2 outgoing paths".

So each conditional segment takes a key of its own, appended only where it
applies. There are three:

- a terminal step's outcome
- the initial step's entry-point word
- an automatic path's priority

A fourth key, the phrase a guardless path says, fills the base template's
guard slot rather than appending to it.

The group's disclosure button takes a fifth key, which names the group it
opens.

Section 2 of the tasks lists all of them. That section runs first. The lookup
types its argument as `keyof typeof en`, so an unknown key stops the build.

### The `authored-content-localization` delta restates that capability's Purpose

The live Purpose (`openspec/specs/authored-content-localization/spec.md:3-10`)
scopes the capability to the contract's locale-keyed shape and the pure
resolution function. The requirement this change adds is a rule about the
surfaces that call that function. Merged as it stands, the capability would
state a scope its own requirement exceeds.

The delta therefore carries a `## Purpose` section. It restates the live text
with the caller clause added. A delta amends a Purpose that way here:
`openspec/changes/archive/2026-08-20-field-catalog-redesign/specs/studio-condition-builder/spec.md`
does the same over a capability that already existed. Moving the requirement
to `studio-app` was the alternative. It lost, because CLAUDE.md names this
capability as the cross-cutting one for authored text.

## Risks / Trade-offs

**An SVG group's `tabindex` has an uneven history.** SVG2 allows it. Current
browsers honor it. This is exactly the class the toolchain's split rule sends
to `docs/browser-checks.md`, a browser vendor's own behavior. The check runs
in Chrome and in Firefox.

**The `application` role is a blunt instrument.** It suppresses the screen
reader's own navigation for everything inside the `<svg>`. The canvas holds
only controls this change names, so it costs nothing there today. A future
element inside the canvas that is not a named control would go invisible to
browse mode. The browser check is what would catch it.

**The fan walk carries one bit of state.** A focused path remembers the end
the author came from. A caller that sets focus without that bit gets the
source end, which is the common direction.

**The step order is the draft's array order.** Up and Down move in an order
the canvas does not draw. The field matrix draws it, and it stays stable
across a session. A layout-derived order lost, because dragging a node would
then rewrite the keyboard order.

**Twelve computations is a lot of computations.** The spec's own requirement
asks for it, and each one is small. The alternative is traversal logic inside
a 1056-line component that no test can reach.

**The members wrapper reorders the node pass.** Today the node pass maps
`workflow.steps` flat, so document order is array order. Wrapping each drawn
group's members in one `<g>` makes a group's members contiguous instead. Two
overlapping nodes could swap which one paints on top. Nothing defines that
order today, and `arrange` lays nodes out clear of each other.

**The group's disclosure draws no ring.** It is a small corner button. The
global outline shows its focus. A whole-box ring revealed through `:has()` is
the upgrade path.

`ponytail: the group box draws no focus ring. Add one, revealed by :has() on the disclosure button, if the browser check finds the corner outline too small to find.`

## Migration Plan

Nothing to migrate. No stored data changes, no contract field changes, and no
route changes. Nothing touches the definition a draft holds.

One visible behavior changes for an existing draft. A node that printed a key
now prints a label. A node that printed its key twice now prints it once. Any
author screenshot or note quoting a node's text goes stale. No deployment runs
this engine, so no stored instance changes.

The `rx` change is visual only, and it moves toward the rule the rest of the
UI already follows.

This change earns no `ROADMAP.md` stage row. It is an accessibility pass, and
`ROADMAP.md:378-384` already sends those to the archive with no stage.

## Open Questions

- Should Home and End jump to the initial step and to the last step in the
  draft order? The field matrix binds both. This change leaves them unbound,
  and a browser check reports whether an author reaches for them.
- Should a selected step and a focused step be the same thing? Today a click
  does both. This change keeps them separate. Focus moves with the arrows,
  and Enter commits focus to the selection. A multi-step selection set
  already exists, and merging the two concepts would need its own change.
- Should the canvas announce a traversal move through a live region? The
  focused node's own name carries the same words, so this change ships
  without one.

### This change closes the three findings the fourth review left open

The fourth review round left three findings. Each one was a cost of dropping
the SVG carve-out. This change settles all three below. The specs and the
tasks carry each settled rule.

#### The key handler excludes a text field, not a `<foreignObject>`

An earlier draft returned early from the canvas key handler for any event
inside a `<foreignObject>`. The group box's disclosure button sits in one. The
arrows would then never reach the traversal, and a focused box would trap the
keyboard.

So the exclusion reads its target instead. The handler returns early where the
target sits inside a text-entry field. The test is
`closest("input, textarea, [contenteditable]")`. The rename input is that
field, and it keeps every key it owns today.

The disclosure button is not one. Left, Right, Up, Down and Escape therefore
reach the traversal from a focused box. The button keeps Enter and Space,
which a real button already handles. Nothing fires twice: the handler's Enter
binding covers a step focus and a path focus. A group focus is neither.

#### Escape moves the stop, and an arrow key brings it back

An earlier draft said re-entering the canvas restores the roving `0` to the
remembered focus. Nothing could raise that. The root's own `onFocus` cannot
tell an Escape from a Tab. A second tab stop is what this change's own
`studio-canvas` delta forbids at :5-7.

So the restore goes. Escape moves the roving `0` to the `<svg>` and focuses
it. Tab then leaves the canvas. Re-entering lands on the root, which holds the
stop. An arrow key from a root focus moves to the entry point.

That last rule needs no component state. The `Focus` type already names the
root, so the traversal answers a root focus the way it answers every other
one. An author who leaves and returns starts at the entry point rather than
where they stopped.

`ponytail: an arrow key from the root goes to the entry point, not to the last focus. Hold the last focus in a ref if the browser check finds authors losing their place.`

#### The button sits at the box's bottom-right, in a late pass

The button is 20 by 20. Its `<foreignObject>` sits at the box's bottom-right
corner, at `x + width - 20` and `y + height - 20`.

That band is the group's own 20-unit margin (`groups.ts:22`, `GROUP_MARGIN`).
On an expanded box it is therefore clear of every member node. The same
measurement puts the box's own edge there.

A collapsed box is 180 by 60, from `drawnBox`. The band spans `x+160..x+180`
and `y+40..y+60`. The name draws at `x + 8, y + 24` and the count at
`x + 8, y + 44` (`CanvasView.tsx:734`, `:738`). Both start 152 units to the
left of the band, and the name's own glyphs end above it.

So the collapsed box needs no clipping, and no name can reach the button. The
top-right corner had neither property. A collapsed box's 13px name at
`y + 24` runs through a top-corner button's band, and nothing truncates
`.canvas-group-name`.

The buttons draw last inside the `<svg>`, after every other pass. The group
pass collects them, the way it already collects a guard label and a waypoint
handle. The file states that reason at `CanvasView.tsx:658-662`, for the
guard labels. It holds here too.

Two passes run after the node pass in the same `<svg>`. Guard labels draw at
`CanvasView.tsx:982-1004` and waypoint handles at `:1006-1034`. A guard label
is a `<foreignObject>` up to 220 wide, holding a `<div>` whose own
`onPointerUp` selects a path (`:993-1002`). It lands wherever a route midpoint
lands, so it can cover a box corner.

Drawing the disclosures after both is what keeps a press on them. Nothing the
canvas paints needs to sit over a disclosure, so the late pass breaks nothing.
The group pass runs at `:719` and the edge pass at `:746`. A button drawn in
either would sit under a route. The `.canvas-edge-hitarea` stroke is 12 wide
and would take the press.

A button in that late pass is a sibling of its box `<g>` rather than a child.
It carries the box's drag preview offset, so it follows a group the author is
dragging.

The `spa-accessibility` requirement drops the sentence claiming a corner-sized
rectangle covers nothing. A collapsed box disproves it. The rule states the
paint order instead.
