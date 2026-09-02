## 1. Design pass

- [ ] 1.1 Read `.claude/rules/design-language.md` and `DESIGN.md` before any code change
- [ ] 1.2 Confirm the focus ring matches the 2px accent at 2px offset
- [ ] 1.3 Confirm the ring reads its state from `:focus-visible`, not a class

## 2. The catalog keys

Sections 4 and 5 compose their names from these keys. The lookup types its
argument as `keyof typeof en` (`packages/web/src/areas/studio/catalog.ts:7`),
so an unknown key stops the build rather than falling back at runtime. The
keys therefore land before the code that reads them.

- [ ] 2.1 Add the name keys to `packages/web/src/i18n/catalogs/studio.ts`
- [ ] 2.2 The two name templates are `canvas.nodeLabel` and `canvas.pathLabel`
- [ ] 2.2a The kind words reuse `palette.step`, `palette.subprocess` and `palette.end`
- [ ] 2.2b Both name keys carry `{placeholder}` slots, filled with `.replace()` as `FieldMatrixPanel.tsx:19-22` does
- [ ] 2.2c Add one key per conditional segment, appended only where that segment applies
- [ ] 2.2d Those four are a terminal outcome, the initial-step word, a priority and the no-guard phrase
- [ ] 2.2e A fixed template cannot leave a slot out. An empty one prints "Capture, capture, Step, , 2 outgoing paths"
- [ ] 2.2f Add `canvas.groupDisclosure`, which names a group's disclosure button from `group.name`
- [ ] 2.3 Each ships in English alone, the only locale that catalog carries
- [ ] 2.3a The export at `studio.ts:472` is `{ en }`, and `t(key)` takes no locale
- [ ] 2.3b No parity assertion covers these keys. `TWO_LOCALE_AREAS` omits studio (`i18n-catalog-parity.test.ts:16`)

## 3. The traversal module

The input is a `Draft`, which `DraftOf` makes optional through every level
(`packages/web/src/areas/studio/draft/types.ts:12-21`). The definition
contract's fan invariants hold for a published `ProcessBody`, validated at
publish time. They do not hold mid-edit. Each rule below therefore states its
own degenerate case, so the module stays total.

- [ ] 3.1 Write `packages/web/src/areas/studio/canvas/traversal.ts`, pure
- [ ] 3.1a Export a `Focus` type naming a step id, a path id, a group id or the `<svg>` root
- [ ] 3.1b A path focus carries the end the author arrived through
- [ ] 3.2 Export one step function over focus, key, the draft's steps and its groups
- [ ] 3.2a Take no separate paths collection. Paths live at `workflow.steps[i].paths`
- [ ] 3.3 Skip a step carrying no `id`. It is unreachable and holds no place in any order
- [ ] 3.4 Skip a path carrying no `id`, and skip one carrying no `to`
- [ ] 3.4a `CanvasView.tsx:833-834` keys such a path on its index, which is no stable identity
- [ ] 3.4b Skip a path whose `to` names no step in `workflow.steps`, since `CanvasView.tsx:766` draws none
- [ ] 3.4c Skip a path whose source and target sit in one collapsed group, which `CanvasView.tsx:767-769` leaves undrawn
- [ ] 3.4d Skip every path a step with no `id` carries, since `CanvasView.tsx:747` draws none
- [ ] 3.5 Order every fan by the step's own `paths` array
- [ ] 3.6 Refine that order by `priority` ascending, and only under one condition
- [ ] 3.6a Every path in the fan is automatic, and every one carries a distinct number
- [ ] 3.7 Leave a mixed fan in array order, so no comparison against `undefined` ever runs
- [ ] 3.7a Leave a fan missing a `priority` in array order, and a fan repeating one too
- [ ] 3.8 Treat a path with no `trigger` as neither manual nor automatic
- [ ] 3.8a It keeps its array place and never joins a priority sort
- [ ] 3.9 Return the same focus at a boundary, with no wrap
- [ ] 3.10 Walk `workflow.steps` order for Up and Down on a step
- [ ] 3.11 Substitute a collapsed group's box for a hidden step
- [ ] 3.11a A group whose `stepIds` resolve to fewer than two steps draws no box (`groups.ts:29-31`)
- [ ] 3.11b Such a group hides nothing, offers no entry point, and leaves its members reachable
- [ ] 3.12 Export the entry point as its own function over the same draft
- [ ] 3.12a Take `workflow.initialStep` when it names a step the author can reach
- [ ] 3.12b Otherwise the first reachable step in `workflow.steps` order
- [ ] 3.12c Otherwise the first group box the canvas draws
- [ ] 3.12d Otherwise the `<svg>` itself, so the canvas keeps its tab stop
- [ ] 3.12e Where `initialStep` names a step inside a collapsed group, enter at that group's box

## 4. The canvas nodes

- [ ] 4.1 Give the node `<g>` `role="button"`, a roving `tabIndex` and an `aria-label`
- [ ] 4.2 Give the `<svg>` `role="application"`, an `aria-label` and `tabIndex={-1}`
- [ ] 4.2a Escape moves focus to that `<svg>`, and the `tabIndex` is what makes the call work
- [ ] 4.2b The `<svg>` takes `tabIndex={0}` instead where the entry point resolves to it
- [ ] 4.3 Compose the step name from label, key, kind, stamps and fan count
- [ ] 4.4 Change `rx={2}` to `rx={0}` on the node rect (`CanvasView.tsx:924`)
- [ ] 4.5 Add the ring `<rect>` with `vector-effect="non-scaling-stroke"`
- [ ] 4.6 Hold the focused id in state, and move it from the traversal module
- [ ] 4.6a Seed that state from the entry-point function on first render, and re-seed when the draft's steps change identity
- [ ] 4.6b Fall back to the entry point where the focused element stops being reachable
- [ ] 4.6c Collapsing the group around the focused step is one such case, deleting it another
- [ ] 4.6d Holding a stale id would leave no element carrying `tabindex="0"`
- [ ] 4.6e A group focus resolves to that group's disclosure button, the only control it draws
- [ ] 4.6f A root focus resolves to the `<svg>` itself
- [ ] 4.7 Bind Enter to the existing `onSelectStep`
- [ ] 4.7a Bind Escape to move the roving stop to the `<svg>`, then call `svgRef.current?.focus()`
- [ ] 4.7a1 That means `tabIndex={0}` on the root and `-1` on every node, path and box
- [ ] 4.7a2 Without the move Tab re-enters the canvas, since the roving `0` still sits inside the `<svg>`
- [ ] 4.7a3 Re-entering the canvas restores the roving `0` to the remembered focus
- [ ] 4.7b Return early from the canvas key handler when the event target sits inside a `<foreignObject>`
- [ ] 4.7c The rename input's own Enter, Escape and arrow keys then never reach that handler
- [ ] 4.7d The disclosure button's own activation still works, since a real button handles it

## 5. The canvas paths

- [ ] 5.1 Give each path group a role, a roving `tabIndex` and an `aria-label`
- [ ] 5.2 Compose the path name from label, both steps, trigger, priority, guard
- [ ] 5.3 Activate the `onSelectStep(stepId, pathId)` the edge group already calls (`CanvasView.tsx:838-841`)
- [ ] 5.4 Mark the guard label `<div>` `aria-hidden`, keeping its pointer handler
- [ ] 5.5 Add the path's ring `<path>` with the same `d` and `vector-effect="non-scaling-stroke"`

## 6. The group boxes

- [ ] 6.1 Give the group box a `<button type="button">` in a `<foreignObject>` at its corner
- [ ] 6.1a Size that `<foreignObject>` to the button, as `CanvasView.tsx:934` sizes the rename one
- [ ] 6.1b Give the button `aria-expanded` and the canvas's roving `tabIndex`
- [ ] 6.1c Name it from a catalog key filled with `group.name`, so a reader hears which group
- [ ] 6.1d Give it `panzoom-exclude`, which both existing `<foreignObject>`s carry
- [ ] 6.1e Stop its pointer events, as the rename input does at `CanvasView.tsx:943`
- [ ] 6.1f Without 6.1e the box's own drag handlers (`CanvasView.tsx:729-731`) swallow the press
- [ ] 6.2 Add a groups writer to `CanvasView`'s `Props`, which carries `groups` and no writer today
- [ ] 6.2a That prop sits at `CanvasView.tsx:69`, beside the read-only list
- [ ] 6.3 Thread the writer from `EditScreen.tsx:491`, the component's one call site
- [ ] 6.3a Pass `onGroupsChange` (`EditScreen.tsx:197`), which the selection toolbar's collapse button already calls (`EditScreen.tsx:541-552`)
- [ ] 6.4 Bind the button's own `onClick` to that writer, flipping `collapsed` on its group
- [ ] 6.4a A real button activates on Enter and on Space already, so this needs no key binding
- [ ] 6.4b The canvas key handler ignores the press, under 4.7b, which is what makes 6.4 work
- [ ] 6.5 Place the box before its first member in the Up/Down order
- [ ] 6.6 Give the button `aria-controls`, naming the `<g>` that holds its group's members
- [ ] 6.6a Wrap each drawn group's member nodes in that `<g>`, with a stable DOM `id`
- [ ] 6.6b Render the wrapper in both states, holding nothing for a collapsed group
- [ ] 6.6c The node pass is flat today (`CanvasView.tsx:884`), so a group's members become contiguous
- [ ] 6.7 Draw no ring element for the button. The global `:focus-visible` outline is its indicator
- [ ] 6.8 Swap `aria-pressed` for `aria-expanded` on the toolbar's collapse button (`EditScreen.tsx:544`)
- [ ] 6.8a Give that button the same `aria-controls`, since it writes the same flag

## 7. The step label

- [ ] 7.1 Reorder `stepLabel` (`CanvasView.tsx:655-656`) so the resolved label comes first, then the key
- [ ] 7.1a The target expression already exists at `FieldMatrixGrid.tsx:258`. Copy it rather than deriving it again
- [ ] 7.2 Hide the key line when the label line already prints the key
- [ ] 7.2a The key line at `CanvasView.tsx:955-957` is unconditional today
- [ ] 7.3 Seed `startRename` from `resolveDraftLocalizedText` alone
- [ ] 7.4 Leave `commitRename` and `inlineRenamePatch` unchanged
- [ ] 7.5 Apply the same corrected expression to two more step headings
- [ ] 7.5a Those are `StepsPanel.tsx:173` and `FormEditorScreen.tsx:419`
- [ ] 7.5b Both print `step.key || t("steps.unnamedStep")` and reach no label at all
- [ ] 7.6 Leave `FieldMatrixGrid.tsx:258-260` alone. Its column header prints the key twice by the same defect
- [ ] 7.6a A follow-up change under `studio-app` owns that fix

## 8. The focus-ring styles

- [ ] 8.1 Add the ring rules to `packages/web/src/areas/studio/app.css`
- [ ] 8.2 Hide each ring by default, and reveal it under `:focus-visible`
- [ ] 8.3 Set `outline: none` on the node and on the path, the two ring owners
- [ ] 8.3a A bare `:focus-visible` rule at `tokens.css:129-132` gives every element a 2px accent outline
- [ ] 8.3b Chrome and Firefox both paint that outline on an SVG element, so without 8.3 a node draws two rings
- [ ] 8.3c Leave that outline on the `<svg>` root and on each disclosure button
- [ ] 8.3d Neither draws a ring element, so the global outline is the only indicator each has

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

- [ ] 9.1 New file `packages/web/test/studio-canvas-node-a11y.test.tsx`
- [ ] 9.1a Every `canvas-node` group carries a role, a `tabindex` and an `aria-label`
- [ ] 9.1b The defect it rejects is the bare `<g>` at `CanvasView.tsx:907-916`
- [ ] 9.1c The `<svg>` carries a role and a name, rejecting `CanvasView.tsx:699-701`
- [ ] 9.1d Every node rect carries `rx="0"`, rejecting `CanvasView.tsx:924`
- [ ] 9.1e Each path group carries a role, a `tabindex` and an `aria-label`
- [ ] 9.1f The defect 9.1e rejects is the nameless `<g>` at `CanvasView.tsx:833-842`
- [ ] 9.1g Each guard label `<div>` carries `aria-hidden`, rejecting `CanvasView.tsx:993-999`
- [ ] 9.1h A collapsed group's disclosure carries `aria-expanded="false"`, rejecting `CanvasView.tsx:726-732`
- [ ] 9.1i A collapsed group renders no member node, holding the guard at `CanvasView.tsx:886`
- [ ] 9.1i1 Both fixtures give that group two members with positions, or `groups.ts:29-31` draws no box
- [ ] 9.1j The rename input and the disclosure buttons are the only focusable HTML in the `<svg>`
- [ ] 9.1j1 The canvas key handler ignores a key event targeting either of them
- [ ] 9.1k Exactly one element inside the `<svg>` carries `tabindex="0"` on first render
- [ ] 9.1l A group's disclosure is a `<button type="button">` inside a `<foreignObject>`
- [ ] 9.1m Its `aria-controls` names a `<g>` the same markup holds, collapsed or not
- [ ] 9.2 New file `packages/web/test/studio-canvas-node-label.test.tsx`
- [ ] 9.2a A step keyed `capture`, labelled "Capture the request", prints both
- [ ] 9.2b The label line reads the label, rejecting `CanvasView.tsx:655-656`
- [ ] 9.2c The two lines never carry the same string, rejecting `CanvasView.tsx:951-957`
- [ ] 9.2d Rendering at `contentLocale: "de"` prints the German label
- [ ] 9.2d1 The defect 9.2d rejects is the operand order at `CanvasView.tsx:655-656`
- [ ] 9.2d2 `DraftProvider` seeds that locale from `initial.baseLocale` (`draft/store.tsx:86`), so the fixture sets it
- [ ] 9.2e A step whose label resolves empty prints its key on the label line
- [ ] 9.2e1 That same step draws no key line, rejecting `CanvasView.tsx:955-957`
- [ ] 9.3 New file `packages/web/test/studio-canvas-traversal.test.ts`
- [ ] 9.3a Right twice from a step reaches its path, then the path's target
- [ ] 9.3b Left twice reaches the incoming path, then its source
- [ ] 9.3c A three-path automatic fan walks in `priority` order
- [ ] 9.3d A manual fan walks in the step's own array order
- [ ] 9.3e Right on a terminal step returns the same focus
- [ ] 9.3f Left on the initial step returns the same focus
- [ ] 9.3g Up and Down reach a step carrying no path at all
- [ ] 9.3h A path whose target hides returns the collapsed group's box
- [ ] 9.3i A path entered from its target walks the target's incoming set
- [ ] 9.3j A fan missing one `priority` walks in array order
- [ ] 9.3k A fan repeating one `priority` walks in array order
- [ ] 9.3l A fan holding one manual and one automatic path walks in array order
- [ ] 9.3m A path with no `trigger` keeps its array place
- [ ] 9.3n A step with no `id` is unreachable, and so is a path with no `id`
- [ ] 9.3o A draft with no `initialStep` enters at the first step in `workflow.steps`
- [ ] 9.3p A draft holding no reachable step at all enters at the `<svg>`
- [ ] 9.3q A path whose `to` names no step is unreachable
- [ ] 9.3r A path with both ends inside one collapsed group is unreachable
- [ ] 9.3s A collapsed group naming one resolvable step hides nothing and offers no box
- [ ] 9.3t Down on the last step in `workflow.steps` returns the same focus
- [ ] 9.3u Down on the last path in a fan returns the same focus
- [ ] 9.3v A path on a step with no `id` is unreachable, whatever that path carries
- [ ] 9.3w Collapsing the group around the focused step returns a reachable focus
- [ ] 9.3x Deleting the focused step returns a reachable focus, never a stale id

## 10. Checks that stay manual

Each check below fails the split rule's second half. A focus move, a browser
vendor's own behavior, and a visual judgment need a real browser.

- [ ] 10.1 Add a `studio-canvas-keyboard` section to `docs/browser-checks.md`
- [ ] 10.1a Tab lands on the initial step, in Chrome and in Firefox
- [ ] 10.1b A `tabindex` on an SVG group takes focus in both browsers
- [ ] 10.1c Arrow keys move focus along the paths and the step order
- [ ] 10.1d Enter opens the inspector on the focused step
- [ ] 10.1d1 Escape from a focused node returns the stop to the `<svg>`, and Tab then leaves the canvas
- [ ] 10.1e Exactly one focus ring draws on a node and on a path
- [ ] 10.1e1 That drawn ring is the only one, with no global outline beside it
- [ ] 10.1e2 The `<svg>` root and the disclosure button each draw the global outline instead
- [ ] 10.1f That ring stays visible, and measures 2px at 200 percent zoom
- [ ] 10.1g A screen reader announces a step's label, kind, outcome and fan
- [ ] 10.1g1 It also announces a group's disclosure by that group's own name
- [ ] 10.1h Arrow keys still reach the handler with NVDA running, which the role decides
- [ ] 10.1i The header's content-locale selector repaints every node label
- [ ] 10.1j A pointer press on a group's disclosure button starts no group drag
- [ ] 10.1k The disclosure button's own focus outline is findable at the box corner
- [ ] 10.2 Run `/impeccable critique /processes/:id/edit` against the changed screen
- [ ] 10.3 Run `/impeccable audit /processes/:id/edit` for the a11y pass

## 11. Documentation

- [ ] 11.1 `docs/current-state.md`: the traversal module and the node's roles
- [ ] 11.1a Also the group disclosure button and the members `<g>` its `aria-controls` names
- [ ] 11.2 Confirm `ROADMAP.md` needs no stage row for this change
- [ ] 11.2a It is an accessibility pass, and `ROADMAP.md:377-383` sends those to the archive with no stage

## 12. Verification

- [ ] 12.1 `bun run typecheck`
- [ ] 12.2 `bun run build`
- [ ] 12.3 Full `bun test` with `DATABASE_URL` set, never a single-file rerun
- [ ] 12.4 Pipe that run through `scripts/gates/silent-green.sh`
- [ ] 12.5 The browser checks from 10.1, against the production build
- [ ] 12.6 The prose gate over the pushed range
- [ ] 12.7 The whitespace gate over the pushed range
