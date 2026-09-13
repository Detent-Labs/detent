## Why

The Forms tab exists to find a form, open it, and spot a problem. Its cards
make that slow. A card's miniature draws a label and a bar for every view
entry, with no cap. "Submit the Exit Notification" in
`examples/it-offboarding.json` holds 32 entries, so its miniature alone stands
about 1480px tall. Every card in its grid row stretches to match. An author scrolls
through several screens to reach the twelfth form.

## What Changes

- The miniature draws one narrow mark per field entry, in a row on the muted
  ground. A mark's height stands for the field's kind. It has no label.
- A group entry draws a group break, a thin line, in place of a mark. It
  still adds one to the field count, as today. A note entry draws nothing.
- An ordinary mark draws as an outline. A required entry's mark fills solid
  in the accent-on-muted color.
- The miniature wraps onto a further line when its marks outgrow the card.
  It never clips a mark.
- The miniature carries one accessible name: its field count and its
  required count.
- The field count moves from under the step's label to a foot row. The open
  control stands beside it, restyled as an authoring command.
- An empty form keeps its advisory box. The miniature's place reads "No
  fields yet". A form of notes alone counts as empty.

The goal: IT Offboarding's twelve forms fit one screen at three columns.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-forms-overview`: three requirements change. The count moves on the
  card. The empty-form rule changes for the count and the open control. The
  miniature changes its form: marks, group breaks, fill, wrapping and
  accessible name.

## Impact

- `packages/web/src/areas/studio/panels/FormsTab.tsx` and `formCardRows.ts`.
- The studio catalog in `packages/web/src/i18n/catalogs/studio.ts`: new keys
  for the miniature's name and the empty sentence, and two keys retired.
- Tests: `studio-formCardRows.test.ts`, `studio-formsTab.test.tsx`,
  `studio-guidedSurfaceStyle.test.ts`.
- Docs: `DESIGN.md`, `.claude/rules/design-language.md`,
  `docs/current-state.md`, `docs/browser-checks.md`, and a comment in
  `packages/web/src/shell/tokens.css`.
- No engine, schema, HTTP or definition contract change.
