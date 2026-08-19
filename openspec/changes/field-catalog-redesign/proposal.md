## Why

The field catalog's editor is a developer-shaped stack. One field's key,
label, description, type, options, data source, column mapping,
validation and issues sit in one long scroll. The type picker speaks raw
contract names.

`tmp/Field Catalog Redesign/` is a Claude Design template. It is
direction, not a 1:1 plan. It proposes an editorial take on that same
data: three tabs, friendly type names and a default-value editor. A
per-field translation status, a live preview, a usage list and a state
footer complete it.

Almost everything the template shows already has a home. The contract
carries `columnMapping`, `dataSource` and `validation`. Per-step view
overrides and stage 42's list-and-detail rail cover the rest.

The template's default-value editor is the exception. `FieldDef.default`
parses and type-checks, but no runtime code applies it. This change
leaves it out and records the gap in `docs/decisions.md`.

What is missing is the editor that organizes it. This change realizes
the template as studio UI. It filters the template through the
definition contract. No new field type, no new condition site, no
engine change.

## What Changes

- The single-field editor becomes a three-tab editor, Field / Values /
  Rules, inside the existing `FieldCatalogPanel`. A field's checks
  (`IssueList`) sit once, above the tabs, so an issue stays visible
  whatever tab is open. The Field tab holds the key, the label, the
  description, the type picker and the translation status. It also
  holds a group field's children, the developer view, a preview and
  the usage list. The Values tab holds the options, the data source
  and the column mapping. The Rules tab holds the condition and the
  field's validation rules.
- All three tab panels stay mounted. The two inactive ones carry
  `hidden`, because three controls in the editor hold input the draft
  does not carry yet.
- The type picker shows friendly names with a short note per type. The
  ten names map one-to-one onto the `baseFieldType` values. The
  definition keeps its raw type. "Long text" stays out. No such type
  exists in the contract, and this change does not add one.
- "Only ask this when" becomes a studio-side condition on the field. It
  writes through the existing view-override site. It reuses the
  condition builder's own row style, as a third builder site
  (`studio-condition-builder` gains a delta for it). The condition row
  reads the `visible` overrides of every step view that references the
  field. It writes the same override into every referencing view and
  states plainly when the views disagree. No new contract field.
- The condition row counts a literal `visible` as a disagreement, and
  names that step before it replaces the literal. Its operand picker
  withholds `child.*`, since it writes across steps of mixed type.
- Each field lists its translation status. It marks the base locale and
  counts the missing locales. It reuses `collectUsedLocales` for the
  locale set. The count comes from a new field-scoped helper:
  `localeGapCount` walks the whole draft, so it reports one number for
  every field. Adding a language stays a draft-scoped action in the
  content-locale switcher.
- "How it will look" previews the field through form-ui's `FieldForm`.
  The preview runs over a synthesized single-field view. An author
  previews what a participant gets.
- "Used in" lists the steps whose view references the field. It names
  the modes those references set: `visible`, `required`, `readonly`.
  "Show on the canvas" navigates to the canvas with that step
  preselected. The canvas re-reads the target whenever it changes, not
  only on mount. The `edit` route gains an optional step id, carried
  at its own `/edit/step/:stepId` segment, ranked after `formStepId`
  and `panel`.
- The panels screen adds no new state footer. `ProcessHeaderBar`
  already mounts above it. It shows the draft's revision, its dirty
  state and the `⋮` Save/Discard/Publish menu. The existing "no Save
  control" rule already holds for the panels screen through that
  shared header bar.
- The Fields rail entry shows a field's resolved label and friendly
  type. The key sits on a secondary mono line. The per-row issue mark
  stays.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: the Fields view's editor shape, the rail rows, and the
  route's step target. The field matrix also names the second CEL
  authoring site for `visible`.
- `spa-accessibility`: the tab pattern the editor introduces.
- `studio-condition-builder`: "Only ask this when" is a third builder
  site. The path guard and the view-override sites are the two the
  capability already names.
- `studio-checks-rail`: a field's `IssueList` moves above the tab set.
  The capability names its per-entity placements, and one of them
  changes.
- `unified-shell`: navigation gains a replace mode, so the step
  target's route can clear itself without trapping the browser's Back
  control.

## Impact

- `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx`:
  `FieldRow` splits in two. A tabbed editor takes the selected
  top-level field; a flat `SubFieldRow` takes a group's children. New
  sections add the translation status, the condition row, the preview
  and the usage list. `IssueList` renders once, above the tabs.
- `packages/web/src/areas/studio/screens/PanelsScreen.tsx`: the rail
  row content and the canvas navigation.
- `packages/web/src/areas/studio/screens/EditScreen.tsx` and
  `packages/web/src/areas/studio/routing.ts`: the `edit` route gains an
  optional step id at `/processes/:id/edit/step/:stepId`. The canvas
  reads that target whenever it changes, not only on mount.
- `packages/web/src/shell/routing.ts`: `useLocation`'s `go` and
  `useAreaRoute`'s `navigate` gain a replace mode. Consuming the step
  target then clears it from the address without pushing a new
  history entry.
- `packages/web/src/areas/studio/draft/`: new pure logic. The
  friendly-type mapping and the reverse view index lead. The condition
  read-back and sync, the preview synthesis and the rail row text
  follow.
- `packages/web/src/i18n/catalogs/studio.ts`: the tab, type-name and
  section strings.
- `packages/web/src/areas/studio/app.css`: the tab, preview and rail
  rules, under the design language.
- `packages/form-ui`: the preview renders through the existing
  `FieldForm` export. The renderer itself does not change.
- `.claude/rules/ui-glossary.md`: registers the new tab set beside the
  area's other patterns.
- `docs/decisions.md`: two entries. The `FieldDef.default` gap, no
  runtime reader, as an open question this change does not close. The
  "Long text" deferral joins it, with its trigger.
- `packages/web/test/`: pure-logic suites for the new helpers, and
  routing tests for the step target, including the shell's own
  replace-mode navigation.
- A real browser check covers the tabs, the condition sync and its
  divergence state, the preview, and the used-in navigation. It also
  covers Back returning to the panels screen after "Show on the
  canvas".
