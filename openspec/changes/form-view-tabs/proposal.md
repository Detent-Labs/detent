## Why

A step's form is one flat list of entries today. A long form scrolls. The author's
only structuring tool is a group, which draws a `<fieldset>`. A group keeps
every field on screen at once. Forms that ask for twenty fields across three
subjects have no way to separate those subjects.

Tabs give the author that separation without a new step. One step keeps one
form, one submission and one set of paths.

## What Changes

- A step's `view` MAY declare `tabs`, an ordered list. Each tab carries a
  `key` and a `LocalizedText` `label`.
- A view entry, field or note, MAY declare `tab`, naming a tab the same view
  declares.
- Five publish rules fix the hierarchy `tabs -> fields and groups -> group
  members`:
  - Tab keys are unique within a view.
  - A `tab` names a tab the view declares.
  - With tabs declared, every root entry carries a `tab`.
  - An entry inside a group has no `tab`.
  - Without tabs declared, no entry carries a `tab`.
- `form-ui` renders a tab strip above the form when the view declares tabs. A
  failed submission opens the first tab holding an error and marks every tab
  that holds one. A tab whose entries are all invisible hides itself.
- The studio form editor gains a tab strip over its canvas: add, rename,
  reorder, remove. The row strip gains a tab picker beside its group picker.
- No breaking change. All three keys are optional, so every stored body parses
  as it does today and no `definitionHash` moves.

## Capabilities

### New Capabilities

None. Tabs extend four capabilities that already own this surface.

### Modified Capabilities

- `definition-contract`: the two new view keys, the five rules above, and the
  base-locale check on a tab label.
- `runtime-api`: the resolved view carries the step's tabs and each entry's
  own tab.
- `form-ui`: rendering a tabbed view, the pure helpers a consumer switches
  tabs with, and the auto-hidden empty tab.
- `studio-form-editor`: authoring tabs on the canvas and assigning an entry to
  one.

## Impact

- `src/schema/definition.ts`: `viewTab`, `view.tabs`, `tab` on `viewField` and
  `viewNote`, a `view` superRefine holding the five rules, and a tab-label call
  in `processBody`'s base-locale pass.
- `src/runtime/api.ts`: `tab` on both resolved entry shapes, `tabs` on
  `InstanceView`.
- `packages/form-ui/src/types.ts`, `FieldForm.tsx`, `locale.ts` and `index.ts`:
  the tab strip, the per-tab panel, two pure helpers and the tab-label locale
  resolver.
- The three screens that mount `FieldForm`: `TaskScreen.tsx`,
  `PlayerScreen.tsx` and the studio's `FormPreview.tsx`. Each owns the open
  tab and passes it in.
- `packages/web/src/areas/studio/draft/field-preview.ts`: the editor preview's
  own tabs and per-entry tab.
- `packages/web/src/areas/studio/screens/FormEditorScreen.tsx` and the studio's
  draft view helpers: the editor's tab strip and tab picker.
- `packages/web/src/i18n` studio catalog: the new editor strings.
- `docs/openapi.yaml`, `docs/authoring-guide.md`, `docs/browser-checks.md`,
  `docs/decisions.md` and the two files under `.claude/rules/`: the rule delta.
- `examples/`: one definition carrying a tabbed form.
- No HTTP route and no stored data change. View resolution gains two response
  keys. The submission payload is what it is today: tabs are layout, like
  `columns` and `span`.
