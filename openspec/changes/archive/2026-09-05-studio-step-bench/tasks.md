## 1. Pure logic first

- [x] 1.1 Add `draft/registerOrder.ts`. It orders steps by reachability from `initialStep`, unreachable steps next, terminal steps last in the draft's own order. Verify with a `bun:test` over `examples/expense-approval.json`. The expected order is capture, review, book, escalated_review, booking_error, booked, rejected.
- [x] 1.2 Add `draft/roleStamp.ts`. It maps a step to `initial`, `task`, `subprocess` or `end`, plus its tone. Verify with a `bun:test` covering all four.
- [x] 1.3 Add `panels/sectionSummary.ts`. It yields each section's value or count, its issue count via `resolveLoc`, and the default open set. Verify with a `bun:test` that a path's guard issue lands on Paths and the masthead alone.
- [x] 1.4 Add `panels/sectionsFor.ts`. It yields the section list for a performed-by value. Verify with a `bun:test` that terminal omits Paths and Timers, and subprocess omits Assignment and Form.
- [x] 1.5 Move `dock/pathRows.ts` to `panels/pathRows.ts`. Rewire the import in `packages/web/test/studio-dock-path-rows.test.ts` and rename that file `studio-pathRows.test.ts`. Verify the moved test passes unchanged.

## 2. Catalog and routing

- [x] 2.1 Add the studio catalog keys the bench needs. The studio catalog carries English alone. Its `t(key)` takes no locale, so no German counterpart lands. Those keys are the missing section names, the terminal one-liner and the no-assignment warning. Add the ribbon control labels, the add control, and the Changes and Paths view names. `stepSections.developerView` and `stepSections.setInitialStep` already exist and stay. Verify `bun run typecheck` passes with `CatalogKey` covering each, and that `i18n-catalog-parity.test.ts` passes.
- [x] 2.2 Extend `PANEL_VIEWS` in `routing.ts` with two views, `changes` and `paths`. Verify `studio-routing.test.ts` resolves the Changes path and falls back on an unknown view.

## 3. The panels screen absorbs the dock

- [x] 3.1 Move `ChangesTab` out of `EditorDock.tsx` into `panels/ChangesView.tsx`. Mount it as the panels screen's `changes` view, with a rail entry showing the entry count. Its failed load takes the alert-banner shape, in a live region. Verify in the browser that an unsaved rename lists, base first.
- [x] 3.2 Move `PathsTab` into `panels/PathsView.tsx`. Mount it as the `paths` view, with a rail entry showing the path count. Verify in the browser that `expense_approval` shows nine rows.
<!-- Why: "delete" here is a file operation; "Remove step" elsewhere is a UI label. -->
<!-- antislop: allow synonym-rotation -->
- [x] 3.3 Delete `dock/EditorDock.tsx` and the `dock/` directory. Delete `packages/web/test/studio-editorDock-fieldMatrixTab.test.tsx`, whose guarded decision has no subject left. Drop the now-unused `compact` prop and `matrixScrollCompact` style from `panels/FieldMatrixGrid.tsx`. Verify `bun run typecheck` passes and no import of `dock/` remains.

## 4. The configuration pane

- [x] 4.1 Rewrite the masthead in `StepsPanel.tsx`. It holds the role stamp, the inline label, the key and id in mono, and the description. It also holds performed-by, the initial-step control, the issue count and the overflow. Delete `BehaviorTab`, `defaultTabFor` and both tab effects. Verify `bun run typecheck` passes.
- [x] 4.2 Add the section register. Six heads take the form `<button aria-expanded aria-controls>`, with values from 1.3. Each body re-hosts its existing panel component. Entry and Exit split the three action lists. Form holds the count and "Build the form". Verify in the browser that `review` shows Paths 3, Timers 2 and Entry `—`.
- [x] 4.3 Hold the open set in `EditorArea` state keyed by step id, seeded from 1.3. Verify in the browser that collapsing Paths on one step survives selecting another and returning.
- [x] 4.4 Apply `sectionsFor` from 1.4, with the terminal one-liner and the Outcome field in Exit. Verify in the browser that `booked` shows no Paths or Timers head. Verify that switching performed-by re-renders at once.
- [x] 4.5 Route the path-edge click to expand Paths and highlight the row through `selectedPathId`. Verify in the browser by clicking an edge.
- [x] 4.6 Read the no-assignment warning from the catalog key in 2.1. Drop the literal `badge`, `error`, `step-section-name` and `studio-developer-view` classes. Verify with a grep over `StepsPanel.tsx` that no `className=` remains beyond the `.btn` family.

## 5. The bench layout

- [x] 5.1 Add `canvas/StepsRegister.tsx`. It lists ruled rows from 1.1 and 1.2 with issue counts and `aria-current` on the open step. Its foot holds the six process links and the empty-draft add control. Verify in the browser that clicking a row opens the step and marks its node.
- [x] 5.2 Add the canvas ribbon in `EditScreen.tsx`. Its bar holds the control and the checks summary. At rest it shows a fit-scale band. When expanded it shows the same `CanvasView` with the palette, with every interaction live in both states. Its open state lives in `EditorArea` and writes no layout-blob key. Verify in the browser that a reload returns it collapsed and a save writes no ribbon key.
- [x] 5.3 Replace the three-column grid with the ribbon over a two-column bench that holds the 36rem floor. Collapse the register to a disclosure below 64rem, the breakpoint `PanelsScreen` already uses. Verify in the browser at 1280px and at 1000px.
- [x] 5.4 Host the collapsed summary of `ChecksRail` in the ribbon bar as a disclosure that expands in place. Verify in the browser that choosing it pushes the bench down and casts no shadow. Verify that it states the publish verdict.
- [x] 5.5 Delete `canvas/EditRail.tsx` once the palette lives in the expanded ribbon and the links in the register. Verify `bun run typecheck` passes.

## 6. Docs

- [x] 6.1 Update `.claude/rules/ui-glossary.md`. Retire identity zone, behavior zone, diagnostics drawer, dock and dock tab. Add masthead, section register, ribbon, steps register and configuration pane. Verify the antislop gate over the range passes.
- [x] 6.2 Sweep the three renamed `studio-canvas` bodies and the renamed `studio-app` body. RENAMED moves a heading alone, so each body still says "identity zone" or "Steps panel". Verify with a grep over `openspec/specs/` that neither phrase survives.
- [x] 6.3 Update `docs/current-state.md`, `docs/browser-checks.md` and `docs/decisions.md:993-1015` for the bench and the dropped dock. Record that the Player stays rejected and the two deferred tabs become deferred panels views. Verify each named symbol exists with `search_graph`.

## 7. Verification

- [x] 7.1 Run `bun run typecheck`, then `bun run build`. Verify by reporting what each printed.
- [x] 7.2 Run the full `bun test` with `DATABASE_URL` set, piped through `scripts/gates/silent-green.sh`. Verify that no named test fails, and that the skip count does not rise.
- [x] 7.3 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and the same range through `scripts/gates/whitespace.sh`. Verify both pass.
- [x] 7.4 Run `/impeccable critique` and `/impeccable audit` on the structure surface, then walk `docs/browser-checks.md`'s studio entries in a real browser. Verify by reporting what each printed.
