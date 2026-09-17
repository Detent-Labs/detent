## 1. Reorder handler

<!-- antislop: allow sentence-length -->
<!-- Known linter miscount: the quoted generic type signature's own commas
     read as clause breaks, inflating the count around one code span. -->
- [ ] 1.1 Add a pure, exported `moveTo<T>(list: T[], from: number, to:
  number): T[]` to `packages/web/src/areas/studio/draft/list-ops.ts`. Put
  it beside the existing `removeAt`/`updateAt`. Clamp `to` into `[0,
  list.length - 1]`. Verify a unit test moves an item from index 0 to
  index 3, and from index 3 to index 0. Verify a second test confirms a
  move-earlier at index 0, and a move-later at the last index, are both
  no-ops.
- [ ] 1.2 Replace `EditScreen.tsx`'s `onReorderStep(stepId, neighbourId)`
  adjacent-swap handler with `onMoveStep(stepId: string, toIndex: number)`,
  calling `moveTo` and reassigning `d.workflow.steps` inside the `mutate`
  recipe. In the same task, change `StepsRail`'s `Props` to carry
  `onMove(stepId: string, toIndex: number)` in place of `onReorder`, and
  wire the `StepsRail` mount in `EditScreen.tsx` to `onMoveStep`. Verify
  `bun run typecheck` passes. These two edits land together: an
  intermediate state with one renamed and the other not does not typecheck.

## 2. Drag interaction

- [ ] 2.1 Remove the `ChevronUp`/`ChevronDown` buttons, the `move` style,
  and their column from `StepsRail.tsx`. Verify the rail renders with no
  chevron controls.
- [ ] 2.2 Add a `stepsRail.dragHandle` key to
  `packages/web/src/i18n/catalogs/studio.ts` (e.g. "Reorder {step
  label}"). Add a `GripVertical` drag handle (18px, 1.75 stroke) at each
  row's trailing edge, carrying `draggable="true"`, `dragstart`/`dragend`
  handlers, and an `aria-label` reading that key. Give the grip a hit area
  of at least 24x24 CSS pixels with padding, independent of the 18px icon.
  Render it as a sibling of the row's own `<button>`. It must be a
  sibling, and never a descendant. Verify a static-markup test confirms
  the grip sits outside the row's own button element.
- [ ] 2.3 Track `dragover` on the row list to compute the nearest drop
  position. Render a drop-indicator rule between the two rows nearest the
  pointer, using `boxShadow`. That is the same mechanism `rowMainCurrent`
  uses for its own 3px mark. Use `boxShadow` and never a `borderWidth`, per
  `studio-guidedSurfaceStyle.test.ts`'s ban on any rule weight above 2px in
  this file. Use the `space.sN` tokens already imported for any new gap.
  Use `borderWidth: 0`, never `border: "none"`, for any border clear, per
  that same test's other two checks. This behavior needs the browser check
  (task 6) to verify: a `renderToStaticMarkup` test cannot dispatch
  `dragover`.
- [ ] 2.4 Style the dragged row at 45% opacity for the duration of the drag,
  with no shadow, no radius and no lift. Call `onMove` on `drop` with the
  computed target index. This needs the browser check (task 6) to verify.
- [ ] 2.5 Disable the drag handle when the rail holds exactly one step.
  Verify a static-markup test confirms it carries
  `disabled`/`aria-disabled` there, the same way the existing lone-step
  chevron test does today.

## 3. Keyboard fallback

- [ ] 3.1 Add a `keydown` handler on the grip answering `Alt+ArrowUp` and
  `Alt+ArrowDown`, calling the same `onMove` handler with `currentIndex - 1`
  / `currentIndex + 1`. No separate boundary-refusal logic belongs here:
  `moveTo`'s own clamping, from task 1.1, already makes the boundary a
  no-op. This needs the browser check (task 6) to verify the key dispatch
  itself. The boundary math is already covered by task 1.1's unit test.
- [ ] 3.2 Keep keyboard focus on the moved row's grip after a keyboard
  move. This needs the browser check (task 6) to verify.
- [ ] 3.3 Add a `stepsRail.movedAnnouncement` catalog key (a template
  naming a step label and its new position) to
  `packages/web/src/i18n/catalogs/studio.ts`. Add a visually-hidden
  `aria-live="polite"` region to the rail using that key, naming the moved
  row's label and its new position after a move. Verify a static-markup
  test confirms the region exists with `aria-live="polite"` in the
  rendered output. The region's text content after a real move needs the
  browser check (task 6) to verify.

## 4. Catalog and docs

- [ ] 4.1 Remove `stepsRail.moveEarlier`/`stepsRail.moveLater` from
  `packages/web/src/i18n/catalogs/studio.ts` — task 2.1 already removed
  their last consumers. Verify `bun run typecheck` reports no unresolved
  catalog key.
- [ ] 4.2 Change the "steps rail" passage in
  `.claude/rules/design-language.md` and `tmp/Detent Design Language.dc.html`
  for the new column set (grip replaces the chevron column) and the dragged
  row/drop-indicator states, per `design.md`'s Decisions.

## 5. Existing test coverage

- [ ] 5.1 Fix `packages/web/test/studio-stepsRail.test.tsx`: rename the
  `render()` helper's `onReorder` prop to `onMove`. Replace the "The steps
  rail's reorder controls" describe block's `aria-label="Move
  earlier"`/`"Move later"` assertions with assertions against the grip's
  `stepsRail.dragHandle` aria-label and its `disabled`/`aria-disabled`
  state at the first row, the last row, and the lone-step case. Verify
  `bun test` for this file passes.

## 6. Spec sync

- [ ] 6.1 Confirm `openspec/changes/studio-steps-rail-drag-reorder/specs/studio-step-page/spec.md`
  matches the shipped behavior exactly, scenario text included. Fix any
  drift found while implementing tasks 1-3.

## 7. Browser check

- [ ] 7.1 Add an entry to `docs/browser-checks.md`, naming this change.
  Cover dragging a row to a non-adjacent position, and to the first and
  last position. Cover moving a row with the keyboard fallback at both
  list ends, including that the boundary refuses the move. Cover the
  live-region announcement's actual text after each move type.
- [ ] 7.2 Build `packages/web` and run that new entry against a real
  browser. Verify by observing the resulting `workflow.steps` order
  (Developer view JSON) after each move.
- [ ] 7.3 Run `/impeccable critique` and `/impeccable audit` against the
  Steps tab route. Resolve any material finding they report.

## 8. Verification

- [ ] 8.1 Run `bun run typecheck` and verify it reports no errors.
- [ ] 8.2 Run `bun run build` and verify it completes without error.
- [ ] 8.3 Run the full `bun test` suite with `DATABASE_URL` set and verify every test passes with no silent skip.
- [ ] 8.4 Run the antislop and whitespace push gates over the pushed range
  (`sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and
  the same piped to `whitespace.sh`). Verify both pass on every Markdown
  file this change touched.
