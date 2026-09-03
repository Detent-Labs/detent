## 1. Pre-flight

- [x] 1.1 Grep every `package.json` and source file under `packages/` for
  `form-ui/form-ui.css`. Verify: the only match is
  `packages/web/src/main.tsx`'s import. That confirms no other importer
  gets missed once the file goes away.

## 2. FieldForm.tsx

- [x] 2.1 Add a `stylex.create` block to `FieldForm.tsx`, reading every
  value from `tokens.stylex.ts`. It covers:
  - the wrapper (`.form-ui-form`'s container-type/name)
  - the one- and two-column grid variants, with the container-query
    collapse keyed `"@container form-ui-form (max-width: 34rem)"` on
    the two-column variant's `gridTemplateColumns`, per design.md D3
  - the group's own base layout and its two-column override
  - the span-2 grid-column rule
  - `.form-ui-field`/`.form-ui-field-control`, `.form-ui-field-label`
  - the input/select/textarea face, with the `:focus-visible`
    border-color conditional, and the textarea resize rule
  - the checkbox/radio reset
  - `.form-ui-field-options` and its legend, `.form-ui-option`
  - the group's own legend, with its two-column full-width override
  - `.form-ui-required-marker`, `.form-ui-field-issues`, `.form-ui-note`

  Verify: `bun run typecheck` passes with no reference to an undeclared
  token.
- [x] 2.2 Apply the new styles at each JSX call site in `FieldForm`,
  `FieldInput` and `NoteText`. Compose the column/span/group variants in
  JS: `columns === 2 ? styles.x : styles.y`. That follows design.md
  D1/D2, and `web-styling`'s "A DOM-attribute variant becomes a
  code-side style choice."

  Keep every `data-columns`/`data-span` attribute rendered exactly as
  today. Nothing in the new styles reads them back. No test, and no
  future consumer, loses that signal.

  Verify: `bun run build` succeeds. Read the emitted CSS. Confirm it
  carries a real `@container form-ui-form (max-width: 34rem) { ... }`
  wrapper around the narrow-width declaration. It must not be a literal
  string, and it must not be a dropped rule (design.md D3). If it is
  either, stop, and report back before writing anything that depends on
  the shape.

  The closeBundle assertion still passes: it must keep finding the
  pilot header's own `clip-path: polygon(` declaration. This task adds
  no new occurrence of that prefix.
- [x] 2.3 Delete every `className="form-ui-*"` string from `FieldForm.tsx`.
  Verify: `git grep -c 'className="form-ui' packages/form-ui/src/FieldForm.tsx`
  returns 0. The container name `"form-ui-form"` (a string value, not a
  className) legitimately remains.

## 3. PathButtons.tsx

- [x] 3.1 Add a `stylex.create` block for the wrapper's `display: flex`/`gap`
  (from `.form-ui-paths`), reading `tokens.stylex`'s `space` group. Add a
  `style?: stylex.StyleXStyles` prop to `PathButtonsProps`. Apply it via
  `stylex.props(styles.paths, style)` on the wrapper `<div>`. Leave the
  button's `className="btn btn-primary"` unchanged: design.md D5,
  `web-styling`'s non-goal states `.btn` is phase 2's.

  Verify: `bun run typecheck` passes. Neither `PlayerScreen.tsx` nor
  `TaskScreen.tsx` needs a change to keep compiling. Both call
  `PathButtons` with no style prop today.
- [x] 3.2 Verify: `git grep -c 'form-ui-paths' packages/form-ui/src/PathButtons.tsx`
  returns 0.

## 4. Tests

- [x] 4.1 In `packages/form-ui/test/field-form.test.tsx`, change every
  literal `form-ui-*` class-name assertion. Each moves to the class the
  stub preload now derives from the corresponding `stylex.create` key.
  For example, `"form-ui-required-marker"` becomes whatever key task
  2.1 named that style. Leave every `data-columns`/`data-span`
  assertion untouched (design.md D1). Verify: the file's test run is
  green under `bun test packages/form-ui/test/field-form.test.tsx`.
- [x] 4.2 In `packages/form-ui/test/path-buttons.test.tsx`, change the
  wrapper's class-name assertion the same way. Add one asserting that a
  `style` prop's class appears on the wrapper alongside the component's
  own default class. Verify: `bun test packages/form-ui/test/path-buttons.test.tsx`
  passes.
- [x] 4.3 Read `packages/form-ui/test/issue-messages.test.ts`,
  `packages/form-ui/test/locale.test.ts` and `packages/form-ui/test/submit.test.ts`.
  Verify: none renders a component or asserts on a class name. Confirm
  each needs no change. Record that confirmation in the PR/commit body:
  design.md's row counts all five files in the package. Confirmed:
  grepping all three for `className|form-ui-|renderToStaticMarkup`
  returns zero matches. No change needed.
- [x] 4.4 Grep the whole `packages/form-ui/test/` directory for the
  literal prefix `form-ui-`. Verify: zero matches. That is the exit
  signal for this group, not a green test run alone. A stale literal
  could still appear in rendered text without asserting on a class
  (design.md's Risks).

## 5. Cleanup

- [x] 5.1 Delete `packages/form-ui/src/form-ui.css`. Delete its
  `"./form-ui.css"` export from `packages/form-ui/package.json`. Delete
  the `form-ui/form-ui.css` import task 1.1 found in
  `packages/web/src/main.tsx`. Verify: `bun run build` succeeds with no
  missing-module error.
- [x] 5.2 Verify: `git grep -rn 'form-ui.css'` across the repository
  returns no match outside archived changes, the evaluation record in
  `tmp/`, and this change's own artifacts.
- [x] 5.3 `docs/current-state.md` names the `form-ui/form-ui.css` import
  at two sites, both about the app area's and Studio's Player consuming
  form-ui. Change both to state the compiled-StyleX reality instead.
  Verify: `git grep -n 'form-ui.css' docs/current-state.md` returns no
  match.

## 6. Docs and roadmap

- [x] 6.1 Rewrite the form-ui paragraph in `docs/browser-checks.md`'s
  "The StyleX pilot: computed styles, not source" section. Open a field
  on both the studio area's Player and the app area's Task screen, for
  the same field type. Read its computed `font-size`, `padding` and
  `border`. Confirm both screens read identical values.

  Confirm both equal `form-ui.css`'s pre-migration declarations: 14px,
  `var(--space-2)`, `1px solid var(--color-border)`. Confirm
  `PathButtons`' wrapper computed `gap` still equals `var(--space-2)`.
  Confirm the two-column grid still collapses to one column below
  34rem, on a real container. Verify: the entry names this change and
  both screens.
- [x] 6.2 Change `docs/decisions.md`'s StyleX entry and `ROADMAP.md`
  stage 45. Mark phase 1 done. Name phases 2 through 5 as what remains.
  Verify: both read consistently with `stylex-phase-0-tooling`'s entry.
  Neither restates it.

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
- [ ] 7.5 Build the production bundle and serve it from `WEB_ROOT`, not
  `bun run dev`. (Studio's dev-mode `process is not defined` crash is
  pre-existing and unrelated to this change.) Run the probe from task
  6.1 in a real browser via `playwright-cli`. Cover both the Player and
  the Task screen, at both a wide and a sub-34rem container width.
  Verify: every probe passes, and no console error appears on either
  screen.
