## 1. Tokens

- [x] 1.1 Add `--color-flag-visible`, `--color-flag-required` and
      `--color-flag-readonly` to `packages/web/src/shell/tokens.css`'s
      primitives block (`:root`, alongside `--stamp-600` and
      `--refusal-700`), each a hue distinct from the other two and from
      `--color-accent`/`--color-refusal`, following the primitive-tier
      pattern design.md's Decisions describe rather than a `var()`-based
      semantic alias.
- [x] 1.2 Add each token's dark-mode value under the existing
      `@media (prefers-color-scheme: dark)` block.
- [x] 1.3 Check every token's light and dark value against
      `--color-surface` with a contrast checker; each SHALL clear the
      3:1 WCAG 1.4.11 non-text-contrast floor, the applicable criterion
      for an `accent-color` fill and a decorative legend swatch. Hold
      each pair to the stricter 4.5:1 text floor too, as a house target.

## 2. Grid checkboxes

- [x] 2.1 Add `.studio-matrix-flag-visible`,
      `.studio-matrix-flag-required` and `.studio-matrix-flag-readonly`
      classes to `packages/web/src/areas/studio/app.css`, each setting
      `accent-color` to its matching token.
- [x] 2.2 In `FieldMatrixGrid.tsx`, apply the matching class to each
      live cell's `visible`/`required`/`readonly` checkbox, keyed on
      `FlagKey`. Gate a checkbox with `aria-disabled="true"`, never the
      native `disabled` attribute. Guard the `onChange` handler to
      return early while a checkbox reads `aria-disabled`, and keep the
      checkbox out of tab order (`tabIndex={-1}`) for that same span,
      through the grid's existing roving-tabindex mechanism.
- [x] 2.3 Retarget `.studio-matrix-cell input:disabled` to
      `.studio-matrix-cell input[aria-disabled="true"]`. Confirm in a
      real browser that a checked, gated checkbox renders its assigned
      hue at 45% opacity, not the browser's own muted gray. Confirm an
      unchecked, gated checkbox keeps the platform's own default
      unchecked box, at that same 45% opacity.
- [x] 2.4a In
      `packages/web/test/studio-editorDock-fieldMatrixTab.test.tsx`, add
      an assertion that a gated checkbox's markup carries
      `aria-disabled="true"` and no native `disabled` attribute. Use the
      existing `renderToStaticMarkup` pattern that file already uses.
      Using a draft fixture with all three flags in plain-boolean,
      non-CEL, non-hatched state, also assert that a live cell's
      `visible` checkbox carries `studio-matrix-flag-visible`, its
      `required` checkbox carries `studio-matrix-flag-required`, and its
      `readonly` checkbox carries `studio-matrix-flag-readonly`.
- [x] 2.4b Extract the `onChange` guard into a new, exported predicate
      in `view-flags.ts` (e.g. `isFlagGated(entry, written,
      technicalFieldIds, key)`) that wraps the existing
      `gatedKeys(...).includes(key)` expression, without changing
      `gatedKeys`'s own signature or behavior. `FormEditorScreen.tsx`'s
      and `fieldMatrixLogic.ts`'s existing `gatedKeys` call sites stay
      untouched. In `packages/web/test/studio-viewFlags.test.ts`, add a
      bun:test assertion that calling it against a gated flag returns
      true, with no simulated DOM click. This repo's test suite carries
      no jsdom or testing-library dependency, so no test here may
      simulate one.

## 3. Legend

- [x] 3.1 In `FieldMatrixPanel.tsx`, add the legend's seventh entry
      naming which color maps to `visible`, `required` and `readonly`,
      using a new `fieldMatrix.legendColors` catalog key. Add that key to
      `packages/web/src/i18n/catalogs/studio.ts`, and add it to
      `LEGEND_KEYS` in `FieldMatrixPanel.tsx`.
- [x] 3.2 Render one swatch per flag in the legend entry, each reading
      its color from the same token the grid's checkboxes use. Each
      swatch SHALL carry `aria-hidden="true"`, since the flag name text
      beside it already carries the accessible content (the pattern
      `.rep-rule`'s bar already uses for a decorative mark).
- [x] 3.3 In
      `packages/web/test/studio-fieldMatrixPanel-legend.test.tsx`, raise
      the expected span count to match the seventh `LEGEND_KEYS` entry
      and its swatch markup, or replace the blanket `<span>` count with
      one scoped to top-level legend entries through a dedicated wrapper
      or attribute. Assert the new entry's three swatches read the
      `--color-flag-*` tokens. While here, also update the file's
      top-of-file comment and this test's own description string, both
      of which currently say "six" — state seven instead, and attribute
      the count to this change rather than the superseded task 3.4a
      citation.

## 4. Design language

- [x] 4.1 Add one line to `.claude/rules/design-language.md` naming the
      `--color-flag-*` tokens as a scoped exception to both the studio
      area's one-hue-plus-neutrals palette and the Color section's
      primitive/semantic-alias separation, per `design.md`'s Risks and
      Decisions sections.
- [x] 4.2 Add the three `--color-flag-*` swatches to the `roles` array
      in the Colour section of `tmp/Detent Design Language.dc.html`. Give
      each entry's `use` field text stating plainly that no separate
      primitive ramp backs this token, e.g. "The field matrix's checked
      `visible` checkbox and its legend swatch — no separate primitive
      ramp backs this token." That wording is how each entry reconciles
      itself with the section's own intro paragraph, which otherwise
      states the ramp steps behind a role are its primitives. Keep the
      three entries consistent with the one-line exception note added to
      `.claude/rules/design-language.md` in task 4.1.

## 5. Docs and spec sync

- [x] 5.1 Run `openspec-sync-specs` (or the equivalent manual sync) so
      `openspec/specs/studio-app/spec.md` picks up this change's
      `MODIFIED Requirements`.

## 6. Verification

- [x] 6.1 Run `bun run typecheck` and confirm it passes.
- [x] 6.2 Run `bun run build` and confirm it passes.
- [x] 6.3 Run the antislop linter over every Markdown file this change
      touched or edited, and confirm no findings remain.
- [x] 6.4 Run the full `bun test` suite with `DATABASE_URL` set, and
      confirm it passes with no unexpected skips.
- [x] 6.5 In a real browser, open the field matrix on the panels screen
      and on the canvas dock's Field matrix tab. Confirm each of the
      three checkbox colors is distinct, matches its legend swatch, and
      stays visible (dimmed, not neutral) on a checked, disabled
      checkbox, in both light and dark mode. Confirm a checked, gated
      checkbox keeps its assigned color at reduced opacity, not the
      browser's own muted gray. Confirm an unchecked, gated checkbox
      shows the plain, dimmed default box, never a colored one. Confirm
      a technical field's `readonly` checkbox renders unchecked,
      dimmed, and uncolored, not the readonly color — the entry can
      carry no explicit `readonly` key, so this checkbox never reflects
      the engine's forced `readonly: true` for that field. Click a
      gated, checked `required` or `readonly` checkbox with the mouse.
      Confirm its checked state and the underlying view entry are
      unchanged afterward — the `aria-disabled` guard blocks the
      write, unlike the previous native `disabled` attribute, which
      made the click itself inert.
- [x] 6.6 Add an entry to `docs/browser-checks.md`, titled after this
      change's slug (`field-matrix-checkbox-colors`), documenting the
      color/legend/dimming check task 6.5 performs. While here, also
      correct the adjacent pre-existing text in that same section
      describing the legend as "a five-line legend" — update it to
      "a seven-line legend", since a prior change already grew it to
      six without updating this line.
