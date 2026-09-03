## 1. Pre-flight

- [x] 1.1 Grep every `package.json` and source file under `packages/` for
  `form-ui/form-ui.css`. Verify: the only match is
  `packages/web/src/main.tsx`'s import, confirming no other importer is
  missed once the file is deleted.

## 2. FieldForm.tsx

- [x] 2.1 Add a `stylex.create` block to `FieldForm.tsx` covering the
  wrapper (`.form-ui-form`'s container-type/name), the one- and two-column
  grid variants (with the container-query collapse, keyed
  `"@container form-ui-form (max-width: 34rem)"` on the two-column
  variant's `gridTemplateColumns` per design.md D3), the group's own base
  layout and its two-column override, the span-2 grid-column rule,
  `.form-ui-field`/`.form-ui-field-control`,
  `.form-ui-field-label`, the input/select/textarea face (with the
  `:focus-visible` border-color conditional), the textarea resize rule, the
  checkbox/radio reset, `.form-ui-field-options` and its legend,
  `.form-ui-option`, the group's own legend (with its two-column
  full-width override), `.form-ui-required-marker`, `.form-ui-field-issues`
  and `.form-ui-note`. Read every value from `tokens.stylex.ts`. Verify:
  `bun run typecheck` passes with no reference to an undeclared token.
- [x] 2.2 Apply the new styles at each JSX call site in `FieldForm`,
  `FieldInput` and `NoteText`, composing the column/span/group variants in
  JS per design.md D1/D2 and `web-styling`'s "A DOM-attribute variant
  becomes a code-side style choice" (`columns === 2 ? styles.x : styles.y`).
  Keep every
  `data-columns`/`data-span` attribute rendered exactly as today — nothing
  in the new styles reads them, but no test or future consumer loses the
  signal. Verify: `bun run build` succeeds; read the emitted CSS and
  confirm it carries a real `@container form-ui-form (max-width: 34rem) { ... }`
  wrapper around the narrow-width declaration, not a literal string or a
  dropped rule (design.md D3 — if it does not, stop and report back before
  writing anything that depends on the shape); the closeBundle assertion
  still passes (it must keep finding the pilot header's own
  `clip-path: polygon(` declaration; this task adds no new occurrence of
  that prefix).
- [x] 2.3 Delete every `className="form-ui-*"` string from `FieldForm.tsx`.
  Verify: `git grep -c 'className="form-ui' packages/form-ui/src/FieldForm.tsx`
  returns 0. The container name `"form-ui-form"` (a string value, not a
  className) legitimately remains.

## 3. PathButtons.tsx

- [x] 3.1 Add a `stylex.create` block for the wrapper's `display: flex`/`gap`
  (from `.form-ui-paths`), reading `tokens.stylex`'s `space` group. Add a
  `style?: stylex.StyleXStyles` prop to `PathButtonsProps`. Apply it via
  `stylex.props(styles.paths, style)` on the wrapper `<div>`. Leave the
  button's `className="btn btn-primary"` unchanged (design.md D5, `web-styling`
  non-goal: `.btn` is phase 2's). Verify: `bun run typecheck` passes, and
  neither `PlayerScreen.tsx` nor `TaskScreen.tsx` needs an edit to keep
  compiling (both call `PathButtons` with no style prop today).
- [x] 3.2 Verify: `git grep -c 'form-ui-paths' packages/form-ui/src/PathButtons.tsx`
  returns 0.

## 4. Tests

- [x] 4.1 In `packages/form-ui/test/field-form.test.tsx`, update every
  literal `form-ui-*` class-name assertion to the class the stub preload
  now derives from the corresponding `stylex.create` key (for example
  `"form-ui-required-marker"` becomes whatever key task 2.1 named that
  style). Leave every `data-columns`/`data-span` assertion untouched
  (design.md D1). Verify: the file's test run is green under
  `bun test packages/form-ui/test/field-form.test.tsx`.
- [x] 4.2 In `packages/form-ui/test/path-buttons.test.tsx`, update the
  wrapper's class-name assertion the same way, and add one asserting that
  a `style` prop's class appears on the wrapper alongside the component's
  own default class. Verify: `bun test packages/form-ui/test/path-buttons.test.tsx`
  passes.
- [x] 4.3 Read `packages/form-ui/test/issue-messages.test.ts`,
  `packages/form-ui/test/locale.test.ts` and `packages/form-ui/test/submit.test.ts`.
  Verify: none renders a component or asserts on a class name; confirm each
  needs no change and record that confirmation in the PR/commit body, since
  design.md's row counts all five files in the package. Confirmed: grepping
  all three for `className|form-ui-|renderToStaticMarkup` returns zero
  matches. No change needed.
- [x] 4.4 Grep the whole `packages/form-ui/test/` directory for the literal
  prefix `form-ui-`. Verify: zero matches — the exit signal for this group,
  not a green test run alone (design.md's Risks: a stale literal could
  still appear in rendered text without asserting on a class).

## 5. Cleanup

- [x] 5.1 Delete `packages/form-ui/src/form-ui.css`. Remove its
  `"./form-ui.css"` export from `packages/form-ui/package.json`. Remove the
  `form-ui/form-ui.css` import task 1.1 located in
  `packages/web/src/main.tsx`. Verify: `bun run build` succeeds with no
  missing-module error.
- [x] 5.2 Verify: `git grep -rn 'form-ui.css'` across the repository
  returns no match outside archived changes, the evaluation record in
  `tmp/`, and this change's own artifacts.
- [x] 5.3 `docs/current-state.md` names the `form-ui/form-ui.css` import at
  two sites (both about the app area's and Studio's Player consuming
  form-ui). Update both to state the compiled-StyleX reality instead.
  Verify: `git grep -n 'form-ui.css' docs/current-state.md` returns no
  match.

## 6. Docs and roadmap

- [x] 6.1 Rewrite the form-ui paragraph in `docs/browser-checks.md`'s "The
  StyleX pilot: computed styles, not source" section: open a field on both
  the studio area's Player and the app area's Task screen, for the same
  field type, and read its computed `font-size`, `padding` and `border`.
  Confirm both screens read identical values, and that both equal
  `form-ui.css`'s pre-migration declarations (14px, `var(--space-2)`,
  `1px solid var(--color-border)`). Confirm `PathButtons`' wrapper computed
  `gap` still equals `var(--space-2)`, and that the two-column grid still
  collapses to one column below 34rem on a real container. Verify: the
  entry names this change and both screens.
- [x] 6.2 Update `docs/decisions.md`'s StyleX entry and `ROADMAP.md` stage
  45: mark phase 1 done, and name phases 2 through 5 as what remains.
  Verify: both read consistently with `stylex-phase-0-tooling`'s entry
  they extend, not restate it.

## 7. Verification

- [ ] 7.1 Run `bun run typecheck`. Verify: exit 0 for the engine and both
  packages.
- [ ] 7.2 Run `bun run build`. Verify: exit 0 and the closeBundle assertion
  prints the stylesheet it checked, unchanged in behavior from phase 0.
- [ ] 7.3 Run the full `bun test` with `DATABASE_URL` set, through
  `scripts/gates/silent-green.sh`. Verify: zero failures, skip count at the
  floor, gate exit 0.
- [ ] 7.4 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`
  and the same for `whitespace.sh`, over this change's own commit(s).
  Verify: both exit 0.
- [ ] 7.5 Build the production bundle and serve it from `WEB_ROOT` (not
  `bun run dev` — Studio's dev-mode `process is not defined` crash is
  pre-existing and orthogonal to this change). Run the probe from task 6.1
  in a real browser via `playwright-cli`, on both the Player and the Task
  screen, at both a wide and a sub-34rem container width. Verify: every
  probe passes, and no console error appears on either screen.
