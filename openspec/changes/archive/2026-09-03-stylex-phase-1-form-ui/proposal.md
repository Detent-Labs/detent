## Why

`stylex-phase-0-tooling` installed the compiler and settled the token
home. It proved the path on one pilot screen. One package outside the
shell still lacks a compiler behind its styles: `packages/form-ui`. A
wrong token name, or a mistyped property, in `form-ui.css` still reaches
`main` past every gate.

Phase 1 closes that gap for the field renderer. The studio area's Player
mounts it. So does the app area's Task screen. What an author previews
therefore stays what a participant gets.

This phase also proves a second thing: the attribute-to-code-choice
pattern. The shell header's own pilot did not need it. The next phase
will, at 250 `className` sites.

## What Changes

- `FieldForm.tsx`'s field renderer (`FieldForm`, `FieldInput`, `NoteText`)
  moves its 23 `form-ui.css` rules into typed `stylex.create` style
  objects, reading tokens from `packages/form-ui/src/tokens.stylex.ts`.
- `data-columns`/`data-span` attribute-selector CSS becomes a code-side
  choice among named StyleX styles. The two attributes still render;
  nothing reads them back. The grid's `@container form-ui-form
  (max-width: 34rem)` collapse becomes a StyleX conditional value. It
  sits on the two-column style, keyed on the same container name.
- `PathButtons.tsx`'s wrapper becomes a compiled style. The component
  gains a new optional style prop, so a caller can extend or override
  that wrapper's layout. Its button element keeps the literal
  `btn btn-primary` className unchanged. The `.btn` family stays phase
  2's own scope.
- `packages/form-ui/src/form-ui.css` no longer exists. The
  `./form-ui.css` export leaves `packages/form-ui/package.json`.
- `packages/form-ui/test/field-form.test.tsx` and
  `packages/form-ui/test/path-buttons.test.tsx` move their class-name
  assertions. The old literal hooks give way to the stub preload's
  key-derived names. `issue-messages.test.ts`, `locale.test.ts` and
  `submit.test.ts` need no change. Neither renders a component, and
  neither asserts on a class name.
- `docs/browser-checks.md`'s form-ui field probe paragraph now matches
  the new markup. It names both the Player and the Task screen.
  `docs/decisions.md` and `ROADMAP.md` stage 45 record phase 1 as done.

No definition contract rule changes. No engine file changes. No area
stylesheet, `.btn` family, or other package touched.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `form-ui`: the field renderer and the path buttons compile from
  StyleX. Neither reads `form-ui.css` any longer. `form-ui` drops the
  `./form-ui.css` export. `PathButtons` gains a style prop for its
  wrapper.
- `web-styling`: records a general pattern this phase introduces first.
  A layout choice can have a small, fixed set of outcomes. Two examples
  are which of two grid variants, and which of two spans. Application
  code now chooses among named StyleX styles for that choice, not a DOM
  attribute a stylesheet reads.

  Phase 0's own Migration Plan already anticipates phase 2 needing this
  same pattern. It names a larger scale: "data-derived class maps
  become typed lookups." This pattern belongs in the spec every phase
  writes its delta against, not only in `form-ui`'s.

## Impact

- Code: `packages/form-ui/src/FieldForm.tsx`, `packages/form-ui/src/PathButtons.tsx`,
  deletion of `packages/form-ui/src/form-ui.css`, `packages/form-ui/package.json`
  (drop the `./form-ui.css` export).
- Tests: `packages/form-ui/test/field-form.test.tsx`,
  `packages/form-ui/test/path-buttons.test.tsx`.
- Callers: `packages/web/src/areas/studio/screens/PlayerScreen.tsx` and
  `packages/web/src/areas/app/screens/TaskScreen.tsx`, only if the new
  `PathButtons` prop needs a call-site change. Neither should: both keep
  the component's own default wrapper style.
- Specs: `openspec/specs/web-styling/spec.md` gains the general
  attribute-to-code-choice pattern; no other requirement there changes.
- Docs: `docs/browser-checks.md`, `docs/decisions.md`, `ROADMAP.md`.
- Dependencies: none new. `@stylexjs/stylex` is already a `form-ui` peer
  dependency from phase 0.
- Out of scope: the `.btn` family, every other package and area, any
  engine file.
