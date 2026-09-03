## 1. Design pass

- [x] 1.1 Read `.claude/rules/design-language.md` and `DESIGN.md` before any code change
- [x] 1.2 Confirm the focus ring matches the 2px accent at 2px offset
- [x] 1.3 Confirm the ring reads its state from `:focus-visible`, not a class

## 2. The catalog keys

Sections 4 and 5 compose their names from these keys. The lookup types its
argument as `keyof typeof en` (`packages/web/src/areas/studio/catalog.ts:7`),
so an unknown key stops the build rather than falling back at runtime. The
keys therefore land before the code that reads them.

- [x] 2.1 Add the name keys to `packages/web/src/i18n/catalogs/studio.ts`
- [x] 2.2 The two name templates are `canvas.nodeLabel` and `canvas.pathLabel`
- [x] 2.2a The kind words reuse `palette.step`, `palette.subprocess` and `palette.end`
- [x] 2.2b Both name keys carry `{placeholder}` slots, filled with `.replace()` as `FieldMatrixPanel.tsx:19-22` does
- [x] 2.2c Add one key per conditional segment, appended only where that segment applies
- [x] 2.2d Those four are a terminal outcome, the initial-step word, a priority and the no-guard phrase
- [x] 2.2e A fixed template cannot leave a slot out. An empty one prints "Capture, capture, Step, , 2 outgoing paths"
- [x] 2.2f Add `canvas.groupDisclosure`, which names a group's disclosure button from `group.name`
- [x] 2.3 Each ships in English alone, the only locale that catalog carries
- [x] 2.3a The export at `studio.ts:472` is `{ en }`, and `t(key)` takes no locale
- [x] 2.3b No parity assertion covers these keys. `TWO_LOCALE_AREAS` omits studio (`i18n-catalog-parity.test.ts:16`)

## 3. The traversal module

The input is a `Draft`, which `DraftOf` makes optional through every level
(`packages/web/src/areas/studio/draft/types.ts:12-21`). The definition
contract's fan invariants hold for a published `ProcessBody`, validated at
publish time. They do not hold mid-edit. Each rule below therefore states its
own degenerate case, so the module stays total.

- [x] 3.1 Write `packages/web/src/areas/studio/canvas/traversal.ts`, pure
- [x] 3.1a Export a `Focus` type naming a step id, a path id, a group id or the `<svg>` root
- [x] 3.1b A path focus carries the end the author arrived through
- [x] 3.2 Export one step function over focus, key, the draft's steps, its groups and its initial step
- [x] 3.2b The initial step reaches it for a root focus alone, which returns the entry point
- [x] 3.2a Take no separate paths collection. Paths live at `workflow.steps[i].paths`
- [x] 3.3 Skip a step carrying no `id`. It is unreachable and holds no place in any order
- [x] 3.4 Skip a path carrying no `id`, and skip one carrying no `to`
- [x] 3.4a `CanvasView.tsx:833-834` keys such a path on its index, which is no stable identity
- [x] 3.4b Skip a path whose `to` names no step in `workflow.steps`, since `CanvasView.tsx:766` draws none
- [x] 3.4c Skip a path whose source and target sit in one collapsed group, which `CanvasView.tsx:767-769` leaves undrawn
- [x] 3.4d Skip every path a step with no `id` carries, since `CanvasView.tsx:747` draws none
- [x] 3.5 Order every fan by the step's own `paths` array
- [x] 3.6 Refine that order by `priority` ascending, and only under one condition
- [x] 3.6a Every path in the fan is automatic, and every one carries a distinct number
- [x] 3.7 Leave a mixed fan in array order, so no comparison against `undefined` ever runs
- [x] 3.7a Leave a fan missing a `priority` in array order, and a fan repeating one too
- [x] 3.8 Treat a path with no `trigger` as neither manual nor automatic
- [x] 3.8a It keeps its array place and never joins a priority sort
- [x] 3.9 Return the same focus at a boundary, with no wrap
- [x] 3.10 Walk `workflow.steps` order for Up and Down on a step
- [x] 3.10a Emit each step id once in that order, at its first place
- [x] 3.10a1 A repeated id makes Down from the second entry a dead end
- [x] 3.11 Substitute a collapsed group's box for a hidden step
- [x] 3.11a A group whose `stepIds` resolve to fewer than two steps draws no box (`groups.ts:29-31`)
- [x] 3.11b Such a group hides nothing, offers no entry point, and leaves its members reachable
- [x] 3.11c Move Right from a group box to the first path leaving that box
- [x] 3.11c1 Move Left to the first path entering it, on the same rule
- [x] 3.11c2 Return the same focus where no path crosses that box
- [x] 3.11c3 The canvas draws a path between two collapsed groups
- [x] 3.11c4 Neither end step is focusable, so only the box reaches it
- [x] 3.12 Export the entry point as its own function over the same draft
- [x] 3.12a Take `workflow.initialStep` when it names a step the author can reach
- [x] 3.12b Otherwise the first reachable step in `workflow.steps` order
- [x] 3.12c Otherwise the first group box the canvas draws
- [x] 3.12d Otherwise the `<svg>` itself, so the canvas keeps its tab stop
- [x] 3.12e Where `initialStep` names a step inside a collapsed group, enter at that group's box
- [x] 3.12f Test every entry candidate against the graph's own step ids
- [x] 3.12f1 A step whose `id` is the empty string is no entry point, since the graph drops it

## 4. The canvas nodes

- [x] 4.1 Give the node `<g>` `role="button"`, a roving `tabIndex` and an `aria-label`
- [x] 4.1a Drop all three while that node renames. ARIA forbids a focusable input inside a button
- [x] 4.1a1 `renaming` is already component state (`CanvasView.tsx:904`)
- [x] 4.2 Give the `<svg>` `role="application"`, an `aria-label` and `tabIndex={-1}`
- [x] 4.2a Escape moves focus to that `<svg>`, and the `tabIndex` is what makes the call work
- [x] 4.2b The `<svg>` takes `tabIndex={0}` instead where the entry point resolves to it
- [x] 4.3 Compose the step name from label, key, kind, stamps and fan count
- [x] 4.3a That count covers the reachable paths alone, the set the traversal walks
- [x] 4.3b Pick a singular template where the fan holds one path
- [x] 4.4 Change `rx={2}` to `rx={0}` on the node rect (`CanvasView.tsx:924`)
- [x] 4.5 Add the ring `<rect>` with `vector-effect="non-scaling-stroke"`
- [x] 4.6 Hold the focused id in state, and move it from the traversal module
- [x] 4.6a Seed that state from the entry-point function on first render
- [x] 4.6b Fall back to the entry point where the focused element stops being reachable
- [x] 4.6c Collapsing the group around the focused step is one such case, deleting it another
- [x] 4.6d Holding a stale id would leave no element carrying `tabindex="0"`
- [x] 4.6e A group focus resolves to that group's disclosure button, the only control it draws
- [x] 4.6f A root focus resolves to the `<svg>` itself
- [x] 4.6g Move the roving stop on a pointer press, from all three press handlers
- [x] 4.6g1 A node press takes a step focus, a path press one entered from its source
- [x] 4.6g2 A disclosure press takes that group's focus, so one Enter does one thing
- [x] 4.7 Bind Enter to the existing `onSelectStep`
- [x] 4.7a Bind Escape to move the roving stop to the `<svg>`, then call `svgRef.current?.focus()`
- [x] 4.7a1 That means `tabIndex={0}` on the root and `-1` on every node, path and box
- [x] 4.7a2 Without the move Tab re-enters the canvas, since the roving `0` still sits inside the `<svg>`
- [x] 4.7a3 Re-entering the canvas lands on the `<svg>`, which holds the stop
- [x] 4.7a4 An arrow key on a root focus moves to the entry point
- [x] 4.7a5 So the traversal answers a root focus too
- [x] 4.7b Return early from the canvas key handler when the event target sits inside a text-entry field
- [x] 4.7b1 The test is `closest("input, textarea, [contenteditable]")` on the target
- [x] 4.7c The rename input's own Enter, Escape and arrow keys then never reach that handler
- [x] 4.7c1 Return focus to the node `<g>` when that rename commits or cancels
- [x] 4.7c2 The `<foreignObject>` unmounts (`CanvasView.tsx:944-947`) and focus drops to `<body>` today
- [x] 4.7d A disclosure button is no such field, so an arrow key and Escape reach the handler from one
- [x] 4.7e Bind Enter for a step focus and a path focus alone
- [x] 4.7e1 A group's button then keeps its own key
- [x] 4.7f Call `e.preventDefault()` on every arrow branch, as `FieldMatrixGrid.tsx:169-202` does
- [x] 4.7f1 Without it an arrow both moves canvas focus and scrolls the page
- [x] 4.7f2 The 4.7b guard runs first, so the rename input keeps its own caret movement
- [x] 4.7g Bind `onKeyDown` on the `<svg>` itself, not on `.canvas-wrap`
- [x] 4.7g1 A handler on `.canvas-wrap` would also catch the toolbar buttons (`CanvasView.tsx:683-698`)

## 5. The canvas paths

- [x] 5.1 Give each path group a role, a roving `tabIndex` and an `aria-label`
- [x] 5.2 Compose the path name from label, both steps, trigger, priority, guard
- [x] 5.2a Fill the guard slot with the readable label the edge draws
- [x] 5.3 Activate the `onSelectStep(stepId, pathId)` the edge group already calls (`CanvasView.tsx:838-841`)
- [x] 5.4 Mark the guard label `<div>` `aria-hidden`, keeping its pointer handler
- [x] 5.5 Draw the path's halo `<path>` before the edge, sharing that edge's own `d`
- [x] 5.5a Give it no fill, the accent stroke, `stroke-width` 6 and no `stroke-dasharray`
- [x] 5.5b Add `vector-effect="non-scaling-stroke"`, so the canvas zoom leaves that 6 alone
- [x] 5.5c The 1.5px edge paints over it, so a manual path keeps its `5 4` dash (`app.css:587-590`)
- [x] 5.5d A coincident 2px ring would instead recolor the edge, as `app.css:2805-2807` already does

## 6. The group boxes

- [x] 6.1 Give the group box a `<button type="button">` in a `<foreignObject>` at its bottom-right corner
- [x] 6.1a Size that `<foreignObject>` host 28 by 28, at `x + width - 24` and `y + height - 24`
- [x] 6.1a1 Center a 20 by 20 button in it, which puts the button back at `x + width - 20`
- [x] 6.1a2 The 4 units clear on each side are the focus outline's room, 2px of it at a 2px offset
- [x] 6.1a3 A host cut to the button clips that outline away whole, so a focused button shows nothing
- [x] 6.1a4 Collect the buttons in the group pass and draw them last inside the `<svg>`
- [x] 6.1a5 That means after the guard-label pass (`CanvasView.tsx:982`) and the waypoint-handle pass (`:1006`)
- [x] 6.1a6 The group pass runs first, so a button drawn there sits under every route and node
- [x] 6.1a7 Carry the box's drag preview offset, so the button follows a group the author drags
- [x] 6.1a8 The button's band is the group's own 20-unit margin, so no member node reaches it (`groups.ts:22`)
- [x] 6.1a9 On a collapsed 180 by 60 box it spans `x+160..x+180`, clear of the name and the count at `x + 8`
- [x] 6.1b Give the button `aria-expanded` and the canvas's roving `tabIndex`
- [x] 6.1c Name it from a catalog key filled with `group.name`, so a reader hears which group
- [x] 6.1d Give it `panzoom-exclude`, which both existing `<foreignObject>`s carry
- [x] 6.1e Stop its pointer events, as the rename input does at `CanvasView.tsx:943`
- [x] 6.1f The button is a sibling of its box `<g>`, so those drag handlers never see the press
- [x] 6.1f1 The guard that matters is 6.1d, against Panzoom (`CanvasView.tsx:182-194`) and the marquee capture (`:520-522`)
- [x] 6.1g Draw one chevron glyph inside the button, carrying `aria-hidden="true"`
- [x] 6.1g1 It points right on a collapsed group, and down on an open one
- [x] 6.2 Add a groups writer to `CanvasView`'s `Props`, which carries `groups` and no writer today
- [x] 6.2a That prop sits at `CanvasView.tsx:69`, beside the read-only list
- [x] 6.3 Thread the writer from `EditScreen.tsx:491`, the component's one call site
- [x] 6.3a Pass `onGroupsChange` (`EditScreen.tsx:197`), which the selection toolbar's collapse button already calls (`EditScreen.tsx:541-552`)
- [x] 6.4 Bind the button's own `onClick` to that writer, flipping `collapsed` on its group
- [x] 6.4a A real button activates on Enter and on Space already, so this needs no key binding
- [x] 6.4b The canvas key handler ignores the press, under 4.7b, which is what makes 6.4 work
- [x] 6.5 Place the box before its first member in the Up/Down order, in both states
- [x] 6.5a A box holding no place takes no roving stop, so no key reaches it
- [x] 6.5b Drop a member from that order only where a collapsed group holds it
- [x] 6.6 Give the button `aria-controls`, naming the `<g>` that holds its group's members
- [x] 6.6a Wrap each drawn group's member nodes in that `<g>`, with a stable DOM `id`
- [x] 6.6b Render the wrapper in both states, holding nothing for a collapsed group
- [x] 6.6c The node pass is flat today (`CanvasView.tsx:884`), so a group's members become contiguous
- [x] 6.7 Draw no ring element for the button. The global `:focus-visible` outline is its indicator
- [x] 6.8 Swap `aria-pressed` for `aria-expanded` on the toolbar's collapse button (`EditScreen.tsx:544`)
- [x] 6.8a Give that button the same `aria-controls`, and only where the group draws a box
- [x] 6.8b Omit it where `drawnBox` returns nothing (`groups.ts:29-31`), since no wrapper `<g>` exists
- [x] 6.8c A step delete can leave a group at one member (`EditScreen.tsx:189`), and `groupMatching` still matches it

## 7. The step label

- [x] 7.1 Reorder `stepLabel` (`CanvasView.tsx:655-656`) so the resolved label comes first, then the key
- [x] 7.1a The target expression already exists at `FieldMatrixGrid.tsx:258`. Copy it rather than deriving it again
- [x] 7.2 Hide the key line when the label line already prints the key
- [x] 7.2a The key line at `CanvasView.tsx:955-957` is unconditional today
- [x] 7.3 Seed `startRename` from `resolveDraftLocalizedText` alone
- [x] 7.4 Leave `commitRename` and `inlineRenamePatch` unchanged
- [x] 7.5 Apply the same corrected expression to two more step headings
- [x] 7.5a Those are `StepsPanel.tsx:173` and `FormEditorScreen.tsx:419`
- [x] 7.5b Both print `step.key || t("steps.unnamedStep")` and reach no label at all
- [x] 7.6 Leave `FieldMatrixGrid.tsx:258-260` alone. Its column header prints the key twice by the same defect
- [x] 7.6a A follow-up change under `studio-app` owns that fix

## 8. The focus-ring styles

- [x] 8.1 Add the ring rules to `packages/web/src/areas/studio/app.css`
- [x] 8.2 Hide each ring by default, and reveal it under `:focus-visible`
- [x] 8.2a Dash the node ring, so focus reads apart from selection
- [x] 8.3 Set `outline: none` on the node and on the path, the two ring owners
- [x] 8.3a A bare `:focus-visible` rule at `tokens.css:129-132` gives every element a 2px accent outline
- [x] 8.3b Chrome and Firefox both paint that outline on an SVG element, so without 8.3 a node draws two rings
- [x] 8.3c Leave that outline on the `<svg>` root and on each disclosure button
- [x] 8.3d Neither draws a ring element, so the global outline is the only indicator each has
- [x] 8.4 Add a `.canvas-group-disclosure` rule to that same file, sizing and centering the chevron
- [x] 8.4a The reset at `tokens.css:134-138` strips a button's border, so the glyph is the only affordance

## 9. Tests that reject a violating input

Every check below is a `bun:test` assertion. Sections 9.1 and 9.2 each meet
both halves of `development-toolchain`'s split rule. This repository produced
the defect at the file and line named, and `renderToStaticMarkup` observes the
property with no browser. Section 9.3 is unit coverage for a new pure module,
which the split rule does not reach. That rule governs a browser check, and
none of 9.3 is one.

No test renders `CanvasView` today; the eight existing `studio-canvas-*`
suites all test a pure module. The harness precedent is
`packages/web/test/studio-fieldMatrixGrid-bulkBadges.test.tsx`, which wraps a
`useDraft` component in `DraftProvider` and reads `renderToStaticMarkup`.

- [x] 9.1 New file `packages/web/test/studio-canvas-node-a11y.test.tsx`
- [x] 9.1a Every `canvas-node` group carries a role, a `tabindex` and an `aria-label`
- [x] 9.1b The defect it rejects is the bare `<g>` at `CanvasView.tsx:907-916`
- [x] 9.1c The `<svg>` carries a role and a name, rejecting `CanvasView.tsx:699-701`
- [x] 9.1d Every node rect carries `rx="0"`, rejecting `CanvasView.tsx:924`
- [x] 9.1e Each path group carries a role, a `tabindex` and an `aria-label`
- [x] 9.1f The defect 9.1e rejects is the nameless `<g>` at `CanvasView.tsx:833-842`
- [x] 9.1g Each guard label `<div>` carries `aria-hidden`, rejecting `CanvasView.tsx:993-999`
- [x] 9.1h A collapsed group's disclosure carries `aria-expanded="false"`, rejecting `CanvasView.tsx:726-732`
- [x] 9.1i A collapsed group renders no member node, holding the guard at `CanvasView.tsx:886`
- [x] 9.1i1 Both fixtures give that group two members with positions, or `groups.ts:29-31` draws no box
- [x] 9.1j The rename input and the disclosure buttons are the only focusable HTML in the `<svg>`
- [x] 9.1j1 Each disclosure `<foreignObject>` measures 20 by 20, and none sits inside a group `<g>`
- [x] 9.1k Exactly one element inside the `<svg>` carries `tabindex="0"` on first render
- [x] 9.1l A group's disclosure is a `<button type="button">` inside a `<foreignObject>`
- [x] 9.1m Its `aria-controls` names a `<g>` the same markup holds, collapsed or not
- [x] 9.2 New file `packages/web/test/studio-canvas-node-label.test.tsx`
- [x] 9.2a A step keyed `capture`, labelled "Capture the request", prints both
- [x] 9.2b The label line reads the label, rejecting `CanvasView.tsx:655-656`
- [x] 9.2c The two lines never carry the same string, rejecting `CanvasView.tsx:951-957`
- [x] 9.2d Rendering at `contentLocale: "de"` prints the German label
- [x] 9.2d1 The defect 9.2d rejects is the operand order at `CanvasView.tsx:655-656`
- [x] 9.2d2 `DraftProvider` seeds that locale from `initial.baseLocale` (`draft/store.tsx:86`), so the fixture sets it
- [x] 9.2e A step whose label resolves empty prints its key on the label line
- [x] 9.2e1 That same step draws no key line, rejecting `CanvasView.tsx:955-957`
- [x] 9.3 New file `packages/web/test/studio-canvas-traversal.test.ts`
- [x] 9.3a Right twice from a step reaches its path, then the path's target
- [x] 9.3b Left twice reaches the incoming path, then its source
- [x] 9.3c A three-path automatic fan walks in `priority` order
- [x] 9.3d A manual fan walks in the step's own array order
- [x] 9.3e Right on a terminal step returns the same focus
- [x] 9.3f Left on the initial step returns the same focus
- [x] 9.3g Up and Down reach a step carrying no path at all
- [x] 9.3h A path whose target hides returns the collapsed group's box
- [x] 9.3i A path entered from its target walks the target's incoming set
- [x] 9.3j A fan missing one `priority` walks in array order
- [x] 9.3k A fan repeating one `priority` walks in array order
- [x] 9.3l A fan holding one manual and one automatic path walks in array order
- [x] 9.3m A path with no `trigger` keeps its array place
- [x] 9.3n A step with no `id` is unreachable, and so is a path with no `id`
- [x] 9.3o A draft with no `initialStep` enters at the first step in `workflow.steps`
- [x] 9.3p A draft holding no reachable step at all enters at the `<svg>`
- [x] 9.3q A path whose `to` names no step is unreachable
- [x] 9.3r A path with both ends inside one collapsed group is unreachable
- [x] 9.3s A collapsed group naming one resolvable step hides nothing and offers no box
- [x] 9.3t Down on the last step in `workflow.steps` returns the same focus
- [x] 9.3u Down on the last path in a fan returns the same focus
- [x] 9.3v A path on a step with no `id` is unreachable, whatever that path carries
- [x] 9.3w Collapsing the group around the focused step returns a reachable focus
- [x] 9.3x Deleting the focused step returns a reachable focus, never a stale id
- [x] 9.3y Right from a collapsed box reaches the path leaving it, then the far box
- [x] 9.3y1 Left from a collapsed box reaches the path entering it
- [x] 9.3y2 An arrow sweep from the entry point reaches a path between two boxes
- [x] 9.3y3 Left and Right on a box no path crosses return the same focus
- [x] 9.3y4 A step whose `id` is the empty string never becomes the entry point
- [x] 9.3y5 A draft repeating a step id still reaches every later step with Down
- [x] 9.3z An expanded group's box holds a place, and Down reaches its first member
- [x] 9.3z1 A group focus stays reachable once that group expands

## 10. Checks that stay manual

Each check below fails the split rule's second half. A focus move, a browser
vendor's own behavior, and a visual judgment need a real browser.

- [x] 10.1 Add a `studio-canvas-keyboard` section to `docs/browser-checks.md`
- [x] 10.1a Tab lands on the initial step, in Chrome and in Firefox
- [x] 10.1b A `tabindex` on an SVG group takes focus in both browsers
- [x] 10.1c Arrow keys move focus along the paths and the step order
- [x] 10.1c1 An arrow key moves focus and scrolls nothing
- [x] 10.1d Enter opens the inspector on the focused step
- [x] 10.1d1 Escape from a focused node returns the stop to the `<svg>`, and Tab then leaves the canvas
- [x] 10.1e Exactly one focus ring draws on a node and on a path
- [x] 10.1e1 That drawn ring is the only one, with no global outline beside it
- [x] 10.1e2 The `<svg>` root and the disclosure button each draw the global outline instead
- [x] 10.1e3 A focused manual path keeps its dash, and the halo reads on each side of the line
- [x] 10.1e4 A focused path and a selected path look different, which a recolored edge would not
- [x] 10.1f That ring stays visible, and measures 2px at 200 percent zoom
- [x] 10.1f1 Measured through CDP device metrics, not the browser's own zoom control
- [x] 10.1f2 At device ratio 2 the ring holds 2 CSS px, so it draws 4 device px
- [x] 10.1g A screen reader announces a step's label, kind, outcome and fan
- [x] 10.1g0 NVDA 2026.2 read "Done, done, End, 0 outgoing paths, outcome approved"
- [x] 10.1g1 It also announces a group's disclosure by that group's own name
- [x] 10.1g2 NVDA read "Steps in Onboarding review, button, expanded"
- [x] 10.1h Arrow keys still reach the handler with NVDA running, which the role decides
- [x] 10.1h1 Drive that check with real OS key events, never a driver's injected ones
- [x] 10.1h2 A driver injects a key below the reader's hook, so the reader never sees it
- [x] 10.1i The header's content-locale selector repaints every node label
- [x] 10.1j A pointer press on a group's disclosure button starts no group drag
- [x] 10.1j1 A route crossing the box's bottom-right corner takes no press meant for that button
- [x] 10.1j2 A guard label or a waypoint handle over that corner takes no press either
- [x] 10.1k The disclosure button's own focus outline is findable at the box corner
- [x] 10.1k1 A collapsed box with a long name shows the chevron whole, with no text under it
- [x] 10.1l Down on a focused disclosure button moves focus, and Enter still toggles the group
- [x] 10.1m Escape, Tab, Shift+Tab and then Right land on the entry point
- [x] 10.1n A renaming node carries no role, no `aria-label` and no `tabindex`
- [x] 10.1n1 `renaming` is internal state that only a double click sets, so no static render reaches it
- [x] 10.1n2 `renderToStaticMarkup` draws the initial state alone, and the package carries no DOM harness
- [x] 10.2 Run `/impeccable critique /processes/:id/edit` against the changed screen
- [x] 10.3 Run `/impeccable audit /processes/:id/edit` for the a11y pass

## 11. Documentation

- [x] 11.1 `docs/current-state.md`: the traversal module and the node's roles
- [x] 11.1a Also the group disclosure button and the members `<g>` its `aria-controls` names
- [x] 11.2 Confirm `ROADMAP.md` needs no stage row for this change
- [x] 11.2a It is an accessibility pass, and `ROADMAP.md:378-384` sends those to the archive with no stage

## 12. Verification

- [x] 12.1 `bun run typecheck`
- [x] 12.2 `bun run build`
- [x] 12.3 Full `bun test` with `DATABASE_URL` set, never a single-file rerun
- [x] 12.4 Pipe that run through `scripts/gates/silent-green.sh`
- [x] 12.5 The browser checks from 10.1, against the production build
- [x] 12.6 The prose gate over the pushed range
- [x] 12.7 The whitespace gate over the pushed range
