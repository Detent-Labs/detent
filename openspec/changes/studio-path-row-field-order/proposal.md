## Why

The Paths tab's per-path editor row renders `key`, `label` and `to` as three
bare, inline `<label>text<input></label>` pairs. They share no visual
treatment. The Step page's masthead stacks the same kind of fields instead:
label above control, mono for machine values. A screenshot review of the
running app flagged the mismatch. It separately flagged the `to` (target
step) select as visually off. That select is a plain, unstyled native
`<select>`, the only kind of select anywhere in the studio today.

## What Changes

- Reorder the path row's fields: `label` first, then `key` (was `key` then
  `label`).
- Restyle `label` and `key` to the Step masthead's stacked field pattern
  (`fieldLabel`/`fieldLabelText`), with `key` taking the mono treatment
  `StepPage.tsx` already gives a step's own `key`.
- Introduce a studio select component: a native `<select>` with the UA
  chevron removed (`appearance: none`). A decorative Lucide `ChevronDown`
  (18px, 1.75 stroke, slate) sits over it. It takes the same stacked
  `fieldLabel` pattern as every other field. Apply it to both `to` selects
  in `PathsPanel.tsx`: the per-path row's target picker, and the "add
  path" target selector below the list.
- Document the new select pattern in `DESIGN.md` and
  `.claude/rules/design-language.md` as the pattern a future studio select
  adopts when its own file is next touched; this change does not retrofit
  every existing `<select>` in the app.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-canvas`: the existing requirement "The inspector's Paths and
  Timers tabs render from compiled styles" asserted pixel parity between
  `PathsPanel.tsx`'s compiled styles and the plain stylesheet they replaced.
  This change deliberately changes that rendering: field order, stacked
  labels, mono key, styled select. The requirement's own text and scenario
  need to describe the new rendering instead of parity with the
  now-superseded prior look.

## Impact

- `packages/web/src/areas/studio/panels/PathsPanel.tsx`: path row markup and
  `styles` object.

- `DESIGN.md` and `.claude/rules/design-language.md` document the new
  select component. `tmp/Detent Design Language.dc.html` gets the same
  swatch locally. `.gitignore` excludes that file. This step never
  reaches the pushed change.

- `packages/web/test/studio-guidedSurfaceStyle.test.ts` gets new
  assertions for the path row's field order and the new select's styles.

- `docs/decisions.md` gets two re-pointed line citations. This change's
  new lines shift both. `docs/browser-checks.md` gets a new entry for
  the select's chevron.

- `.impeccable/config.json`: one narrow `ignore-value` entry silencing the
  `design-system-font-size` detector rule for `PathsPanel.tsx`'s copied
  `monoInput` value (mirrors an existing precedent entry).

- No engine, schema, or API changes. No new dependency: `lucide-react` is
  already a project dependency and already used for other studio chevrons.
