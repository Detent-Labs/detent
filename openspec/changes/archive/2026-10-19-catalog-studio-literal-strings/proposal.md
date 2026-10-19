# Proposal

## Why

An author on the Paths tab reads the caption `priority` above a number box.
No operator can override that word, since it has no catalog key. The audit of
2026-10-10 found about thirty such strings in the studio's panels (E2-19).
They break the rule in `ui-string-overrides` that every author-facing studio
string comes from the studio catalog. STEP-4 and the path row's captions in
`docs/decisions.md` record the same defect class.

## What Changes

- A field caption on the studio panels reads as plain words from the studio
  catalog. Where the caption names a JSON property, the property's name
  trails it in the mono face. The owner chose this form on 2026-10-19.
- The captions move for the path row and a path's priority and actions. The
  timer row, the subprocess spec and the plugin envelope move too. So do a
  data source's key and the header bar's `key` and `baseLocale`. The step
  page's three action lists and a migration plan's `onUnmappable` follow.
- The plugin config validation messages become whole catalog sentences. The
  unknown-data-list warning, the locale gap count and the "not checked"
  badges do too.
- A new test parses every studio panel component. It fails on a literal
  caption or text node. A named list of machine values stays exempt.
- The studio catalog's header comment states the new caption rule.
- `docs/decisions.md` loses STEP-4, the path-row caption entry and this
  change's own audit index entry.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ui-string-overrides`: the studio catalog requirement states how a caption
  that names a JSON property reads. It also counts a validation message as
  author-facing text.

## Impact

- `packages/web/src/areas/studio/panels/`: `PathsPanel.tsx`,
  `TimersPanel.tsx`, `SubprocessSpecEditor.tsx`, `DataSourcesPanel.tsx`,
  `ProcessHeaderBar.tsx`, `StepPage.tsx`, `ActionListEditor.tsx`,
  `MigrationSpecEditor.tsx`, `dataListKeysLogic.ts`, and under `shared/`
  `PluginEnvelopeEditor.tsx`, `ContentLocaleSwitcher.tsx` and
  `IssueList.tsx` and `FieldExpressionMapEditor.tsx`. One new shared caption
  component, `shared/KeyCaption.tsx`.
- `packages/web/src/i18n/catalogs/studio.ts`: new keys and the header rule.
- `packages/web/test/`: one new guard test, plus updates to tests that
  assert the old literal text.
- No engine, schema or HTTP change. The definition contract stays as it is.
