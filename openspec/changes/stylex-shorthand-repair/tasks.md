## 1. The shell and form-ui

- [x] 1.1 Convert the 5 declarations in `form-ui/src/FieldForm.tsx`
- [x] 1.2 Convert `Chrome.tsx`'s `menuItem` hover map to `backgroundColor`
- [x] 1.3 Convert `navStyles.ts`'s active background to `backgroundColor`
- [x] 1.4 Run `bun run typecheck` and `bun run build`

## 2. The app, admin and reporting areas

- [x] 2.1 Convert the 3 app screens: Tasks, Started, Involved
- [x] 2.2 Convert the 7 admin screens: DataList, DataLists, Instances, Timers, Users, Groups, Outbox
- [x] 2.3 Convert the 2 reporting screens: ProcessPicker, ReportsList
- [x] 2.4 Confirm each row hover reads `transparent`, never `none`
- [x] 2.5 Run `bun run typecheck` and `bun run build`

## 3. The studio area

- [x] 3.1 Convert `FormEditorScreen.tsx`, 11 declarations
- [x] 3.2 Convert `FieldMatrixGrid.tsx`, 10 declarations
- [x] 3.3 Convert `CanvasView.tsx`, 9 declarations
- [x] 3.4 Convert `RuleBuilder.tsx`, 8 declarations
- [x] 3.5 Convert `MigrationPlanScreen.tsx`, 5 declarations
- [x] 3.6 Convert `FieldMatrixPanel.tsx`, `MigrationSpecEditor.tsx`, `ConditionBuilder.tsx`, `ToolsScreen.tsx`
- [x] 3.7 Convert `ProcessHeaderBar.tsx` and `EditScreen.tsx`
- [x] 3.8 Convert the 7 two-declaration files under `panels/` and `screens/`
- [x] 3.9 Convert the 9 one-declaration files under `panels/` and `screens/`
- [x] 3.10 Run `bun run typecheck` and `bun run build`

## 4. The guard

- [x] 4.1 Add `packages/web/test/stylex-shorthand.test.ts`
- [x] 4.2 Walk every `.ts` and `.tsx` module under both source trees
- [x] 4.3 Fail on a line whose first token is `border:` or `background:`
- [x] 4.4 Report the file and the line number for each hit
- [x] 4.5 Exempt `tokens.stylex.ts`, whose `border` is a token name
- [x] 4.6 Assert the test fails on a fixture declaring each key
- [x] 4.7 Confirm the test passes against the converted tree

## 5. Specs and docs

- [x] 5.1 Raise `global.css`'s stated bound to about 150 lines in `web-styling`
- [x] 5.2 Add the element-default paragraph and its fieldset scenario
- [x] 5.3 Add the browser-check entry to `docs/browser-checks.md`
- [x] 5.4 Name the four surfaces the entry covers: canvas, field matrix, JSON view, error banner

## 5b. The pressed bulk badge

- [x] 5b.1 Replace the accent pressed style with one style per flag
- [x] 5b.2 Pick the style from the flag key the button already holds
- [x] 5b.3 Add `packages/web/test/studio-fieldMatrixBadge.test.ts`
- [x] 5b.4 Assert each flag fill clears 4.5:1 in both color schemes
- [x] 5b.5 Assert the flag fills beat the accent's own margin
- [x] 5b.6 Write the `studio-app` delta for the pressed fill

## 6. Verification

- [x] 6.1 Run `bun run typecheck` in the devcontainer
- [x] 6.2 Run `bun run build` in the devcontainer
- [x] 6.3 Run the full `bun test` with `DATABASE_URL` set
- [x] 6.4 Pipe the log through `scripts/gates/silent-green.sh`
- [x] 6.5 Parse the built stylesheet and assert it now carries border atoms
- [ ] 6.6 Walk the four surfaces in a browser at 1440x900
- [x] 6.7 Confirm the field matrix legend swatch draws its frame and its fill
- [ ] 6.8 Confirm a register row fills on hover in all three areas
- [x] 6.9 Run `/impeccable critique` on the field matrix route
- [ ] 6.10 Run `/impeccable audit` on the field matrix route
- [x] 6.11 Run the prose gate over every changed Markdown file
- [x] 6.12 Run the whitespace gate over the pushed range
