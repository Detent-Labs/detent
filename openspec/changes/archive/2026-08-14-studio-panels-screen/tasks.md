## 1. Routing

- [x] 1.1 Add `panel?: PanelView` to the `edit` entry of `Route` in
  `packages/web/src/areas/studio/routing.ts`.
- [x] 1.2 Match `/processes/:id/edit/panels/:view` in `matchRoute`, before the
  plain edit pattern. The form pattern shows the placement.
- [x] 1.3 Fall through to the plain edit route on an unrecognized `:view`, so a
  typo lands on the canvas.
- [x] 1.4 Carry `panel` in `routePath`, beside the `formStepId` branch already
  there.

## 2. Routing tests

- [x] 2.1 Assert a panels path round-trips through `matchRoute` and
  `routePath`, per view.
- [x] 2.2 Assert an unrecognized `:view` matches the plain edit route.
- [x] 2.3 Assert a panels path and a form path do not match each other.

## 3. The screen

- [x] 3.1 Turn `EditPanelsModal.tsx` into the panels screen. Drop the
  `<dialog>`, the `showModal()`/`close()` effect and the footer.
- [x] 3.2 Render all three views and toggle them with the `hidden` attribute.
  Do not mount and unmount them.
- [x] 3.3 Lay out three columns: the index rail, the open view, the checks
  rail.
- [x] 3.4 Render `ChecksRail` in its full grouped state. The screen carries no
  selection, so it needs no new prop.
- [x] 3.5 Add one back-to-canvas control, the `btn btn-ghost studio-back`
  button `FormEditorScreen` uses. Add the note saying the screen keeps every
  edit.
- [x] 3.6 Keep the rail as it is: entity count, issue count, the field
  sub-list, `aria-current`, and the two-level indent cap. Nothing there moves.

## 4. The edit screen

- [x] 4.1 Drop `openPanel` from `EditScreen.tsx` and read the route's `panel`
  instead.
- [x] 4.2 Make the three Process links navigate rather than set state.
- [x] 4.3 Render the panels screen in place of the canvas whenever the route
  carries a `panel`.
- [x] 4.4 Keep the links off the JSON view, the rule `studio-json-view`
  already carries.
- [x] 4.5 Delete the `openPanel` comment that argues component state over
  route state. This work reverses it.

## 5. Styling and wording

- [x] 5.1 Turn the `.studio-panels-modal*` rules in
  `packages/web/src/areas/studio/app.css` into screen rules.
- [x] 5.2 Keep the 2px structural rules and the 1px row hairlines the register
  language sets. No radius appears.
- [x] 5.3 Add the back label and the keeps-every-edit note to
  `packages/web/src/areas/studio/catalog.ts`, in EN and DE.
- [x] 5.4 Drop the modal's own close key once nothing reads it.
- [x] 5.5 Give the screen the growth rule `.studio-canvas-layout` carries:
  `flex: 1 1 auto` and the same `min-height` floor. The dialog's `88vh` does
  not survive the move, and item 1 shipped a whole pass over exactly this.

## 6. Naming

- [x] 6.1 Rename the term in `.claude/rules/ui-glossary.md`. "Edit panels
  modal" becomes "panels screen".
- [x] 6.2 Move the component to `screens/PanelsScreen.tsx`, and rename its
  export to `PanelsScreen`. `screens/` is where this repo's screens sit.
  `FormEditorScreen` set that precedent. Re-export `PANEL_VIEWS` and
  `PanelView` from there.
- [x] 6.3 Sweep for the old name. `docs/current-state.md` and
  `docs/browser-checks.md` both carry it.
- [x] 6.4 Repoint `canvas/EditRail.tsx` at the moved module. Its import, its
  `onOpenPanel` doc comment and its entity-count comment all name
  `EditPanelsModal`.
- [x] 6.5 Lift the entity-count expression into one exported helper beside
  `flattenRailFields` in `draft/panel-rail.ts`. Both rails read it, and each
  builds its own copy today.

## 7. Documentation

- [x] 7.1 Record the work in `ROADMAP.md` as stage 36, with the direction the
  design session took.
- [x] 7.2 Rewrite the studio section of `docs/current-state.md`.
- [x] 7.3 Replace the shared-modal walk in `docs/browser-checks.md` with the
  screen's own.
- [x] 7.4 Move item 10 to `ARCHIVED` in `tmp/open-work-priority.md`.

## 8. Verification

- [x] 8.1 `bun run typecheck`, then `bun run build`.
- [x] 8.2 Full `bun test` with `DATABASE_URL` set. Read the skip count beside
  the pass count.
- [x] 8.3 The antislop linter over every Markdown file this work touched.
- [x] 8.4 `git diff --check`, and `git ls-files --eol` for a CR in the `w/`
  column.
- [x] 8.5 A real browser. Deep-link a view, reload it, press Back, and switch
  views with text half-typed.
- [x] 8.6 In the browser, confirm the checks rail lists in full beside the
  views, and that a fix clears its entry.
- [x] 8.7 In the browser, read the screen on a tall window and on a short one.
  The columns fill the first and hold the floor on the second.
