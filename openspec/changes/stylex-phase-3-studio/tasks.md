## 1. Pre-flight audit

- [x] 1.1 Re-run this design's own rule-count grep against
  `packages/web/src/areas/studio/app.css` at the branch tip. Verify:
  364 distinct rule blocks total, 50 `.canvas-*`-prefixed (phase 4's
  scope), 314 in this phase's own scope.
<!-- antislop: allow synonym-rotation -->
<!-- The git subcommand name, not the prose verb "render". -->
- [x] 1.2 Re-run the duplicate-declaration grep
  (`git show HEAD:<file> | grep -oP '^[^{]+(?=\{)' | sed
  's/[[:space:]]*$//' | sort | uniq -c | sort -rn | awk '$1>1'`).
  Verify: five duplicates total. `.studio-matrix-row-header`,
  `.studio-form-card-body` and `.studio-form-canvas-tail` are this
  phase's own scope (D6). `.canvas-group-name` and
  `.canvas-edge-focus-halo` are phase 4's, untouched here.
- [x] 1.3 Confirm the zero-scope files carry no CSS-backed class to
  convert. Five files render only role/text/structure markup, or the
  deferred `.btn` family. They are `panels/ContractPanel.tsx`,
  `panels/ActionListEditor.tsx`, `panels/SubprocessSpecEditor.tsx`,
  `panels/TimersPanel.tsx` and `panels/shared/
  FieldExpressionMapEditor.tsx`.

  A sixth file renders classes no CSS rule in the repo backs instead.
  `panels/shared/IssueList.tsx` renders `issue-list` and `issue` from
  its `IssueList` export. It renders `badge` and `badge-not-checked`
  from its `NotCheckedBadge` export. This session confirmed all four
  are dead. None of the six files gets a task below.

  `panels/DraftToolbar.tsx`'s own `studio-`-prefixed substrings are
  import paths and catalog keys, not classes. It gets no task either.
- [x] 1.4 Confirm `screens/studio/root.tsx`'s `navStyles` usage needs
  no further change. It already imports and applies `navStyles` from
  phase 2's own Group 2 work. Verify: `grep -n "navStyles"
  packages/web/src/areas/studio/root.tsx` prints the existing import
  and both `stylex.props` calls.

  This file carries one more site past `navStyles`: its own `<main
  className="studio-empty-role">`, backed by a real rule at
  `app.css:29`. Task 3.1 below converts it. Group 3 is the smallest
  remaining group open when this session found the gap.

## 2. The `::backdrop` verification

- [x] 2.1 Write an isolated `@stylexjs/babel-plugin` transform script
  at the repo root. It compiles a `stylex.create()` call with a
  `"::backdrop"` key nested inside a style entry, alongside regular
  border properties. Run it. Verify: the compiled metadata contains a
  rule shaped `.HASH::backdrop{...}`, and `stylex.props()` composes it
  correctly with the entry's other properties into one className.
  Delete the script. Verify: `git status --short` prints no trace.

  This is D4's first check. No task from Group 3 onward that touches
  a dialog file runs before this one passes.

## 3. The dock

- [ ] 3.1 Convert `dock/EditorDock.tsx` to `stylex.create`, reading
  `form-ui/tokens.stylex`. Cover the collapsed strip, the tab row and
  each tab's content frame.

  Per D10, `.studio-dock-body` keeps its literal class name too. Compose
  it alongside its own new compiled style. `.studio-dock-body
  .studio-matrix-scroll` still depends on that literal class. It waits
  until Group 6 converts `FieldMatrixGrid.tsx`.

  Also convert `screens/studio/root.tsx`'s own `.studio-empty-role`
  (task 1.4's finding). That is a one-rule, one-site class, unrelated
  to the dock, folded in here as the nearest open group. Verify:
  `bun run typecheck` passes.
- [ ] 3.2 Verify: `bun run build` succeeds. `app.css` keeps every rule
  this task's own files used. Each stays dead code until Group 9's
  single cleanup pass deletes it (D11). Deleting per group cannot
  tell a dead rule from one a later group's file still renders.
  Forty-one of this phase's 314 rules render in more than one file.

  `studio-editorDock-fieldMatrixTab.test.tsx` needs no change here.
  Its literal-class assertions (`studio-matrix-table`,
  `studio-matrix-flag-*` and the rest) target `FieldMatrixGrid.tsx`'s
  own markup. That markup mounts inside the dock's Field matrix tab.
  None of it is a class `EditorDock.tsx` itself renders. Task 6.7
  updates it, once `FieldMatrixGrid.tsx` converts.

## 4. The header bar and the four dialogs

- [x] 4.1 Convert `panels/ProcessHeaderBar.tsx` to `stylex.create`.
  Cover the header bar itself (`studio-canvas`'s own requirement), the
  publish-confirmation dialog (`studio-publish`) and the
  discard-confirmation dialog (`studio-app`'s own requirement for it).
  Also convert `panels/shared/ContentLocaleSwitcher.tsx`, which this
  file imports (`studio-app`'s own content-locale-switcher
  requirement). `.studio-dialog` compiles; `::backdrop` does not (D12,
  found by task 4.3). Both dialogs compose the literal `studio-dialog`
  class alongside their own compiled style, so `app.css`'s literal
  `::backdrop` rule keeps matching.
- [x] 4.2 Convert `screens/ProcessesScreen.tsx` to `stylex.create`.
  Cover the process list itself and its two dialogs, the
  promotion-preview dialog and the start-picker dialog (both
  `studio-app`'s own requirement). Both compose the literal
  `.studio-dialog` class too (D12).
- [x] 4.3 Build the production bundle and open it in a real browser
  via `playwright-cli`. Open all four dialogs in turn (publish-confirm
  and discard-confirm from `panels/ProcessHeaderBar.tsx`,
  promotion-preview and start-picker from
  `screens/ProcessesScreen.tsx`). Read each one's computed `::backdrop`
  `background-color` in DevTools.

  This is D4's second check, now that a real dialog carries the
  compiled rule. It found none: the production bundle carried no
  compiled `::backdrop` rule anywhere, on any of the four. Task 2.1's
  isolated transform check had compiled one correctly. Fixed per D12:
  every dialog's `stylex.create` entry drops the `"::backdrop"` key,
  and composes the literal `studio-dialog` class instead.

  Verified again after the fix: all four now compute `rgba(0, 0, 0,
  0.45)`, matching the value `app.css:891` declared before this
  change. No console error appeared on either screen.
- [ ] 4.4 Change `studio-processHeaderBar-publishGate.test.tsx`'s
  literal `studio-error-banner` assertions to the stub-derived key
  name. Its `not.toContain("studio-conflict")` assertion needs no
  change: `ProcessHeaderBar.tsx` never renders that class, before or
  after this conversion, so the check stays trivially true. Verify:
  `bun test packages/web/test/
  studio-processHeaderBar-publishGate.test.tsx` passes.
- [ ] 4.5 Verify: `bun run typecheck` and `bun run build` both pass.
  `app.css` keeps every rule these two files used (D11). Group 9's
  cleanup pass deletes it, once every group finishes.

## 5. The field catalog and its shared editors

- [x] 5.1 Convert `panels/FieldCatalogPanel.tsx` to `stylex.create`.
  This is the largest single file in this phase, 56 class-token sites.
  Two classes stay literal: `studio-field-technical` and
  `field-catalog-panel`. Neither has a live `app.css` rule; the
  panel's own `> h3` child selector converts instead.
  `SubFieldRow` threads an optional `labelStyle` prop into the
  shared `FormatControlPickers`. Only `SubFieldRow` renders it as a
  direct child of `.field-row`.
- [x] 5.2 Convert its shared dependencies too, each reading
  `form-ui/tokens.stylex`. They are `panels/shared/
  DefaultValueEditor.tsx`, `panels/shared/FieldValidationEditor.tsx`,
  `panels/shared/RuleBuilder.tsx`, `panels/shared/RuleInput.tsx`,
  `panels/shared/ConditionInput.tsx`, `panels/shared/
  ConditionBuilder.tsx` and `panels/shared/PluginEnvelopeEditor.tsx`.

  `ConditionInput.tsx` and `PluginEnvelopeEditor.tsx` each have a
  later consumer too: `PathsPanel.tsx`, `StepsPanel.tsx`,
  `DataSourcesPanel.tsx`. Converting them here, once, covers every
  consumer.
- [x] 5.3 Verify: `bun run typecheck` and `bun run build` both pass.
  Also run `git grep -c
  'className="condition-\|className="field-\|className="default-value-
  \|className="plugin-field' packages/web/src/areas/studio/panels/`.
  It finds two sites, both dead classes with no live `app.css` rule:
  `field-catalog-panel` and `condition-builder`. Every other reference
  now reads its style from a `stylex.create` entry. `app.css`'s own
  rules for the converted classes stay in place, dead code, until
  Group 9's cleanup pass (D11). Full `bun test` under
  `silent-green.sh` passes too: 3818 tests, 1 pre-existing skip, 0
  fail.

## 6. The panels screen, field matrix, data sources and checks rail

- [x] 6.1 Re-audit `FieldMatrixGrid.tsx`'s `CellState` group before
  writing any style for it (D3, the same per-group re-verification
  phase 2 ran before each area). Confirmed `fieldMatrixLogic.ts`'s
  `CellState` is still the closed three-value union `"hatched" |
  "blank" | "live"`, and that `app.css` still styles only `hatched`
  and `live`.
- [x] 6.2 Convert `screens/PanelsScreen.tsx` to `stylex.create`.
- [x] 6.3 Convert `panels/FieldMatrixGrid.tsx`. Merge the
  `.studio-matrix-row-header` duplicate declaration into one
  `stylex.create` entry (D6). Pick `CellState`'s style from an
  exhaustive lookup over its three values. `blank` gets no extra
  style. This matches today's stylesheet.

  The lookup carries no explicit `Record<CellState, StyleXStyles>`
  type. The `live` entry holds only a `:hover` key, a narrower shape
  than the general `StyleXStyles` type accepts. A `satisfies
  Record<CellState, unknown>` clause keeps the exhaustiveness check
  instead.

  Its scroll box takes a `compact?: boolean` prop, picking the 15rem
  cap `dock/EditorDock.tsx` needs instead of its own 32rem default
  (D10).

  Dropped `.studio-dock-body`'s retained literal class from
  `EditorDock.tsx`'s own JSX, now that the scroll box picks its cap
  in code. `app.css`'s `.studio-dock-body .studio-matrix-scroll` rule
  itself waits for Group 9's cleanup pass, like every other rule
  (D11).
- [x] 6.4 Convert `panels/FieldMatrixPanel.tsx`.
- [x] 6.5 Convert `panels/DataSourcesPanel.tsx` and its dependency
  `panels/shared/InstanceQueryForm.tsx`.
- [x] 6.6 Convert `panels/ChecksRail.tsx`. It mounts in three other
  files too (`StepsPanel.tsx`, `EditScreen.tsx`, both Group 8), so its
  own signature stays untouched. `PanelsScreen.tsx`'s own call site
  wraps it in a plain compiled `<div>` instead, carrying
  `.studio-panels-screen-layout > *`'s min-height: 0. That grid-item
  rule belongs to the screen. It does not belong on a component three
  other screens also mount.
- [x] 6.7 Change five field-matrix/panels test files' literal class
  assertions to the stub-derived key names.

  The five files are `studio-fieldMatrixGrid-bulkBadges.test.tsx`,
  `studio-fieldMatrixPanel-legend.test.tsx`,
  `studio-panelsRailFieldRow.test.tsx`,
  `studio-checksRail-publishVerdict.test.tsx`, and
  `studio-editorDock-fieldMatrixTab.test.tsx` (task 3.2's finding).
  Its assertions target `FieldMatrixGrid.tsx`'s own markup. They wait
  for this task, not `EditorDock.tsx`'s own conversion. Two of the
  bulk-badge assertions switched from a plain substring match to a
  `\b`-bounded regex: `matrixFlagBadge` is also a prefix of
  `matrixFlagBadgePressed`.

  Verify: `bun test` against all five passes. It does: 11/11.
- [x] 6.8 Verify: `bun run typecheck` and `bun run build` both pass.
  `app.css` keeps every rule this group's files used (D11) until
  Group 9's cleanup pass. Full `bun test` under `silent-green.sh`
  passes too: 3818 tests, 1 pre-existing skip, 0 fail.

## 7. The form editor

- [x] 7.1 Convert `screens/FormEditorScreen.tsx` to `stylex.create`.
  The "How it will look" preview's `[data-columns="2"]`/
  `[data-span="2"]` pair becomes a parameterized style function, the
  same shape `form-ui/FieldForm.tsx` already uses (D5). Merged the
  `.studio-form-card-body` and `.studio-form-canvas-tail` duplicate
  declarations into one `stylex.create` entry each (D6). Two more
  duplicate-declaration pairs surfaced during conversion and got the
  same merge: `.studio-form-palette-field`/`.studio-form-card-body`'s
  shared `user-select`/`touch-action` rule, and `.studio-form-canvas
  > .empty`/`.studio-form-canvas-tail`'s shared `grid-column`/`color`
  rule.
- [x] 7.2 The component still renders `data-columns`/`data-span` as a
  plain fact. Running `git grep -c 'data-columns\|data-span'
  packages/web/src/areas/studio/screens/FormEditorScreen.tsx` finds 4.
  Per D11, `app.css`'s own `[data-columns\|[data-span` rules stay dead
  code until Group 9's cleanup pass. They are not deleted here.
  Running `git grep -c '\[data-columns\|\[data-span'
  packages/web/src/areas/studio/app.css` still finds 2.
- [x] 7.3 Verify: `bun run typecheck` and `bun run build` both pass.
  `app.css` keeps every rule `FormEditorScreen.tsx` used (D11), until
  Group 9's cleanup pass. That includes `.studio-dialog-note`:
  `panels/ProcessHeaderBar.tsx` and `screens/ProcessesScreen.tsx`
  (Group 4) also render that one class. Full `bun test` under
  `silent-green.sh` passes too.

## 8. The remaining screens

- [ ] 8.1 Convert `screens/EditScreen.tsx` to `stylex.create`. Keep
  `.canvas-group-name` a literal, unhashed class on the group-rename
  label (D2). Compose it with the label's own new compiled style
  through string concatenation, never through `stylex.props` itself:
  `` className={`canvas-group-name ${stylex.props(styles.x).className}`} ``.
- [ ] 8.2 Convert `panels/PathsPanel.tsx` and `panels/StepsPanel.tsx`.
  The latter covers the inspector's identity zone, its behavior-zone
  tab list and its diagnostics drawer.
- [ ] 8.3 Convert `screens/VersionsScreen.tsx`,
  `screens/TemplatesScreen.tsx`, `screens/PlayerScreen.tsx` and
  `screens/ToolsScreen.tsx`.
- [ ] 8.4 Convert `screens/MigrationPlanScreen.tsx` and
  `panels/MigrationSpecEditor.tsx`, including the raw-JSON textarea
  fallback state.
- [ ] 8.5 Convert `panels/JsonView.tsx`.
- [ ] 8.6 Verify: `bun run typecheck` and `bun run build` both pass.
  `app.css` keeps every rule this phase's files used (D11). Group 9's
  cleanup pass is next. By then every non-canvas file has converted,
  so nothing left in `app.css` is still depended on.

## 9. Cleanup

- [ ] 9.1 Verify no stray `studio-*`/bare-class reference survives
  outside `canvas/`. That proves it is safe to delete `app.css`'s
  remaining non-canvas rules in one pass (D11).

  <!-- antislop: allow sentence-length -->
  <!-- One grep command; its alternation pattern counts as words. -->
  Run `git grep -c 'className="studio-\|className="condition-
  \|className="field-\|className="step-\|className="path-\|className=
  "option-\|className="instance-query-\|className="data-source'
  packages/web/src/areas/studio/ --include='*.tsx'`.

  Exclude `canvas/` from the result by eye. It returns 0.
- [ ] 9.2 Delete every rule `app.css` still carries outside its
  `.canvas-*`-prefixed set, in one pass, except two permanent keepers.
  Every group left its own migrated rules in place on purpose (D11).
  Task 9.1 just confirmed nothing outside `canvas/` still depends on
  any of them. Keep the `@media (prefers-reduced-motion: reduce)`
  block: every area's `app.css` keeps this one, phase 1's own "one
  global stylesheet carries what the compiler cannot" pattern. Keep
  `.studio-dialog::backdrop` too, permanently (D12): every dialog
  still composes the literal `studio-dialog` class for this one rule
  alone. `.studio-dialog`'s own base declaration deletes normally; the
  compiled style already covers it.

  Re-run the rule-count grep from task 1.1. Unlike every earlier
  phase, this file does not shrink to a single literal block. Canvas
  has no stylesheet of its own, so `app.css` keeps its 50 `.canvas-*`
  rules for phase 4.

  Verify: it now finds 52 distinct rule blocks. `.canvas-*` prefixes
  50 of them. Two more classes ride along too, `.canvas-group-name`
  and `.canvas-edge-focus-halo`, D2's deferral and phase 4's own
  duplicate. The 51st and 52nd are the
  reduced-motion block and `.studio-dialog::backdrop`, this phase's
  own two permanent keepers. Also verify: `bun run typecheck` and
  `bun run build` both pass.
- [ ] 9.3 Verify `tokens.css`'s `.btn` family and `app.css`'s
  `.canvas-*` rules stay byte-identical to the commit before this
  phase started. This change touches neither (D1).

## 10. Docs and roadmap

- [ ] 10.1 Add a probe per region to `docs/browser-checks.md`'s
  StyleX section. Name the form editor's two-column preview, the
  panels screen's three-column layout, and the dock's tab switching.
  Name all four dialogs' open/close/`::backdrop` behavior too.
- [ ] 10.2 Change `docs/decisions.md`'s StyleX entry and `ROADMAP.md`
  stage 45. Mark phase 3 done. Name phase 4 (canvas) and phase 5
  (cleanup) as what remains. Correct phase 0's own Migration Plan row
  too. It claims `:popover-open` sees first use in phase 3. It does
  not: phase 0 already used it for the shell account menu.

## 11. Verification

- [ ] 11.1 Run `bun run typecheck`. Verify: exit 0 for the engine and
  both packages.
- [ ] 11.2 Run `bun run build`. Verify: exit 0, and the closeBundle
  assertion still passes.
- [ ] 11.3 Run the full `bun test` with `DATABASE_URL` set, through
  `scripts/gates/silent-green.sh`. Verify: zero failures, skip count
  at the floor, gate exit 0.
- [ ] 11.4 Run `sh scripts/gates/range.sh < /dev/null | sh
  scripts/gates/prose.sh` and the same for `whitespace.sh`, over this
  change's own commits. Verify: both exit 0.
- [ ] 11.5 Build the production bundle and serve it from `WEB_ROOT`,
  not `bun run dev` (Studio's dev-mode crash is pre-existing and
  unrelated). Run each probe from task 10.1 in a real browser via
  `playwright-cli`, with seeded data.

  Run a real keyboard walk too (D8), the stricter bar this phase's
  own exit criterion sets. Tab through the form editor's field list
  and its column-count toggle. Tab through the panels screen's index
  rail into the open view, and through the dock's tab row.

  Open each of the four dialogs with the keyboard. Confirm focus
  traps inside it. Press Escape, then confirm focus returns to the
  control that opened it.

  Verify: every probe passes. Every keyboard walk completes with no
  trap or dead end. No console error appears on any screen.
