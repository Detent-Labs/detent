## 1. `PathsPanel.tsx` styles and markup

- [x] 1.1 Add `fieldLabel`, `fieldLabelText` and `monoInput` to
  `PathsPanel.tsx`'s local `styles` object, copied from `StepPage.tsx`'s
  declarations, and verify with `bun run typecheck` that the new keys
  compile.
- [x] 1.2 Add a `selectWrap`/`select`/`selectIcon` style group for the
  studio select: `selectWrap` (`position: relative`, block), `select`
  (`appearance: none`, `paddingInlineEnd` wide enough to clear the icon),
  `selectIcon` (`position: absolute`, inset-inline-end, vertically
  centered, `color: colors.textMuted`, `pointerEvents: "none"`). Verify
  with `bun run typecheck`.
- [x] 1.3 Import `ChevronDown` from `lucide-react` in `PathsPanel.tsx`.
- [x] 1.4 Reorder the per-path row's fields to `label`, then `key`, then
  `to` (was `key`, `label`, `to`); wrap `label` and `key` in the
  `fieldLabel`/`fieldLabelText` pattern, giving `key`'s `<input>` the
  `monoInput` style. Verify the JSX matches `StepPage.tsx`'s masthead
  markup shape for those two fields.
- [x] 1.5 Wrap the per-path row's `to` `<select>` in the `selectWrap`
  pattern (label above, `<select>` with the new `select` style, a
  `<ChevronDown size={18} strokeWidth={1.75} aria-hidden="true" />` inside
  a `selectIcon`-styled span).
- [x] 1.6 Apply the same `selectWrap` pattern to the "add path" target
  selector below the path list.
- [x] 1.7 Run the dev build (`bun run build` inside the devcontainer, or
  the running `bun run serve`). Confirm the Paths tab renders with no
  console error.
- [x] 1.8 Add assertions to `packages/web/test/studio-guidedSurfaceStyle.test.ts`
  that read `PathsPanel.tsx`'s source. Check that the `label` field's markup
  precedes the `key` field's markup. Check that the `key` field's `<input>`
  carries `styles.monoInput`. Check that both `to` `<select>` elements
  carry the new `select`/`selectIcon` styles with `appearance: "none"`.
  Verify with `bun test packages/web/test/studio-guidedSurfaceStyle.test.ts`
  inside the devcontainer; a single-file run is fine here, since this test
  has no DB fixture.

## 2. Design documentation

- [x] 2.1 Add a "Select" entry under `DESIGN.md`'s `components:` block
  (border, background and padding inherited from `input`; the added
  `appearance: none` and the decorative `ChevronDown`), and verify
  `DESIGN.md`'s YAML front matter still parses (`bun run typecheck` runs
  no YAML check; open the file and confirm no syntax error, since no
  automated gate reads this file directly).
- [x] 2.2 Add the select's stacked-label and disclosure-arrow rule to
  `.claude/rules/design-language.md`'s "Fields" section, next to the
  existing field rule.
- [x] 2.3 Run the antislop linter over both changed docs. Use
  `python <AntiSlop repo path>/antislop.py check DESIGN.md
  .claude/rules/design-language.md`. Fix every reported finding.
- [x] 2.4 Change the local, untracked `tmp/Detent Design Language.dc.html`
  reference to add the new select component's swatch. `.gitignore`
  excludes this file. This step stays local and never reaches the pushed
  change. Skip it only if that file is absent on this machine.

## 3. Browser check

- [x] 3.1 Open the Paths tab in a real browser, per `CLAUDE.md`'s
  "A real browser, for any UI change" rule. Confirm the path row shows
  `label` above `key` above `to`, `key` in the mono face, and the `to`
  select's custom chevron in place of the browser's own.
- [x] 3.2 Run `/impeccable critique` and `/impeccable audit` against the
  Paths tab route and resolve every material finding they report.
- [x] 3.3 Add an entry to `docs/browser-checks.md`, naming this change.
  Describe opening the Paths tab. State the pass: the `to` select shows
  the slate chevron in place of the browser's own dropdown arrow.

## 4. Verification

- [x] 4.0 Re-point `docs/decisions.md`'s STEP-1 and STEP-2 line citations
  (`panels/PathsPanel.tsx:234` and `:246`) to their post-edit line
  numbers. This change's new styles and markup shift both lines.
- [x] 4.1 Run `bun run typecheck`, then `bun run build`, then the full
  `bun test` suite with `DATABASE_URL` set, then `bun run test:tz` (inside
  the devcontainer; `bun run check` runs all four in this order). Confirm
  every one reports clean. Read the skip count off
  `scripts/gates/silent-green.sh` rather than the pass count alone.
- [x] 4.2 Run the prose gate: `sh scripts/gates/range.sh < /dev/null | sh
  scripts/gates/prose.sh`.
- [x] 4.3 Run the whitespace gate: `sh scripts/gates/range.sh <
  /dev/null | sh scripts/gates/whitespace.sh`. Fix every finding both
  gates report.
