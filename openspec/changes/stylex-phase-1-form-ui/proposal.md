## Why

`stylex-phase-0-tooling` installed the compiler, settled the token home and
proved the path on one pilot screen. `packages/form-ui` is the only package
outside the shell still styled by a hand-written stylesheet with no compiler
behind it: a wrong token name or a mistyped property in `form-ui.css` still
reaches `main` past every gate. Phase 1 closes that gap for the field
renderer both the studio area's Player and the app area's Task screen
mount, so what an author previews stays what a participant gets, and the
form-ui pilot proves the parameterized-style pattern the shell header's
pilot did not need before the next phase reaches 250 `className` sites.

## What Changes

- `FieldForm.tsx`'s field renderer (`FieldForm`, `FieldInput`, `NoteText`)
  moves its 23 `form-ui.css` rules into typed `stylex.create` style objects,
  reading tokens from `packages/form-ui/src/tokens.stylex.ts`.
- `data-columns`/`data-span` attribute-selector CSS becomes parameterized
  StyleX style functions. The grid and its collapse no longer read a DOM
  attribute; the component picks the style at render time from the
  `columns`/`span` values it already computes.
- The `@container form-ui-form (max-width: 34rem)` collapse rule becomes a
  StyleX conditional style, keyed on the same container name.
- `PathButtons.tsx`'s wrapper becomes a compiled style. The component gains
  a new optional style prop so a caller can extend or override that
  wrapper's layout. Its button element keeps the literal `btn btn-primary`
  className unchanged — the `.btn` family stays phase 2's own scope.
- `packages/form-ui/src/form-ui.css` is deleted. The `./form-ui.css` export
  leaves `packages/form-ui/package.json`.
- `packages/form-ui/test/field-form.test.tsx` and
  `packages/form-ui/test/path-buttons.test.tsx` move their class-name
  assertions from the old literal hooks to the stub preload's key-derived
  names, or to role/text/structure assertions where a literal class was
  only ever a convenient hook. `issue-messages.test.ts`, `locale.test.ts`
  and `submit.test.ts` are reviewed and confirmed unaffected (pure logic,
  no rendering).
- `docs/browser-checks.md`'s form-ui field probe paragraph is rewritten to
  match the new markup and to name both the Player and the Task screen.
  `docs/decisions.md` and `ROADMAP.md` stage 45 record phase 1 as done.

No definition contract rule changes. No engine file changes. No area
stylesheet, `.btn` family, or other package touched.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `form-ui`: the field renderer and the path buttons compile from StyleX
  style objects instead of `form-ui.css`. The `./form-ui.css` export is
  removed. `PathButtons` gains a style prop for its wrapper.
- `web-styling`: records the general pattern this phase introduces first —
  a layout choice with a small, fixed set of outcomes (which of two grid
  variants, which of two spans) is chosen among named StyleX styles in
  application code, never read from a DOM attribute by a stylesheet. Phase
  0's own Migration Plan already anticipates phase 2 needing this same
  pattern at a larger scale ("data-derived class maps become typed
  lookups"), so it belongs in the spec every phase writes its delta
  against, not only in `form-ui`'s.

## Impact

- Code: `packages/form-ui/src/FieldForm.tsx`, `packages/form-ui/src/PathButtons.tsx`,
  deletion of `packages/form-ui/src/form-ui.css`, `packages/form-ui/package.json`
  (drop the `./form-ui.css` export).
- Tests: `packages/form-ui/test/field-form.test.tsx`,
  `packages/form-ui/test/path-buttons.test.tsx`.
- Callers: `packages/web/src/areas/studio/screens/PlayerScreen.tsx` and
  `packages/web/src/areas/app/screens/TaskScreen.tsx` only if the new
  `PathButtons` prop needs a call-site change (neither should, since both
  keep the component's own default wrapper style).
- Specs: `openspec/specs/web-styling/spec.md` gains the general
  attribute-to-code-choice pattern; no other requirement there changes.
- Docs: `docs/browser-checks.md`, `docs/decisions.md`, `ROADMAP.md`.
- Dependencies: none new. `@stylexjs/stylex` is already a `form-ui` peer
  dependency from phase 0.
- Out of scope: the `.btn` family, every other package and area, any
  engine file.
