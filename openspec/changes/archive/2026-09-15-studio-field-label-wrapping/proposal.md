## Why

The form editor's placed-field card wraps a field's `key` at an arbitrary
character boundary once too narrow. For example, `full_name` renders as
`ful`/`l_n`/`ame`. The card's Move up / Move down / Remove row is styled as
three full-size bordered buttons. They never shrink below their own text
width. On a narrower card, nearly all the missing space lands on the key.

`web-styling`'s authoring-command rule already exists to keep a row of
secondary studio commands small. This row was never migrated to it. Fixed
by a live mockup the user approved
(https://claude.ai/artifact/UqpN9oGDETZFbGwex1jTst).

## What Changes

- `styles.formCardMoves` (`FormEditorScreen.tsx`) has two consumers. One is
  the field card's own Move up / Move down / Remove row. The other is the
  group's own Move up / Move down / Remove(N) row, in its `<legend>`. Move
  up and Move down switch from `.btn.btn-secondary` to the
  authoring-command style at both sites. That style uses the mono face at
  11px, with slate text turning to ink on hover and press. It also carries
  a muted-surface hover wash, a 14%-ink press wash, and no border.
- The field card's own plain Remove switches too. The group's
  `Remove ({count})` keeps its `.btn.btn-secondary.btn-destructive` classes
  unchanged. It is a deliberate warning cue for a cascading, multi-entry
  removal, and the authoring-command style has no destructive variant.
- The field key (`formCardKey`) drops `overflowWrap: "anywhere"`. The key
  renders with a break opportunity after every `_`. A wrap lands between
  underscore-delimited segments first. It falls back to breaking a single
  oversized segment only when that segment alone still does not fit.
- No change to the free-text note preview (`formCardNotePreview`): a note is
  prose, not an identifier, and keeps its existing wrap behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-form-editor`: a placed field's card now breaks its key only at an
  underscore. It falls back to breaking an oversized segment as a last
  resort. It no longer breaks at an arbitrary character.
- `web-styling`: the authoring-command rule's list of covered controls adds
  a placed field's move-up, move-down and remove controls.

## Impact

- `packages/web/src/areas/studio/screens/FormEditorScreen.tsx`: the
  `formCardMoves` button markup/style at both its consumers (the field
  card's row and the group legend's row) and the `formCardKey` style and
  render helper.
- `packages/web/test/studio-formEditor-groupCanvas.test.tsx`: its
  `isButtonDisabled` assertions check only the `disabled` attribute, not a
  class, and keep passing unmodified; the change adds new cases for the
  authoring-command style and the key-wrap behavior.
- No schema, contract, or API change. No new dependency.
