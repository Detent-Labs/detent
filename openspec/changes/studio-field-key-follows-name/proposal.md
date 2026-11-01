# Proposal

## Why

A field's key stops following its label as soon as one condition reads it.
After that, a key change leaves every reader on the old key. A guard that
read `data.amount` then reads a key no field holds. The checks rail names
the result in CEL terms. The key notice counts the readers and names none
of them. It offers no way to move them along.

The owner rated this finding, B3, "important". Decision D4 chose rule R1.
The key follows the label until the first publish, then stays. A key change
in the Developer view rewrites every expression that reads it. Principle 4
of stage 64 asks the studio to say in one sentence what a change touched.

This is change 7 of stage 64 (`docs/studio-ui-concept.md`, section 8). It
builds on change 4, which shipped on 2026-10-31. It closes `FIELDS-27` in
`docs/decisions.md`, bar its pending hint, which stays open.

## What Changes

- The key follows the label until the field's first publish. A condition
  that reads the key no longer stops it. Only a base version that holds the
  field does.
- Every key change rewrites the expressions that read the old key, through
  the ranges of the parsed CEL tree. Typing a label and a commit in the
  Developer view both do it. Text in a string literal, an index read and a
  read under `child.data` stay as they are.
- After a change that rewrote at least one expression, a rewrite line under
  the label says so: "Updated 3 conditions."
- The key input moves into a Developer view under the label. It commits on
  blur or Enter as today. Escape puts the key back. A commit refuses an
  empty key and a key outside the identifier grammar. It also refuses a word
  CEL reads as a literal and a key another field holds. The refusal says
  what to do.
- A group's key keeps its own commit rule.
- A derived key avoids a key that an expression reads but no field holds.
  Without that, a label typed through such a key would capture the reader.
  The form editor's mint uses the same taken set.
- A rename of one of two fields that share a key moves no reader.
- A "Read by" zone joins the field editor's effect half, under "Used in". It
  lists each expression that reads the field. Each row names its place. A
  place is a way out, a step's form, a rule, a default, a time limit or a
  child mapping. A condition also reads as a sentence. No CEL and no key
  show.
- The Publish dialog's change list and the Versions screen already list a
  rewritten condition under its owner's row. A spec scenario pins that.
- The form editor names fields through the same label write, so its renames
  rewrite readers too.
- `src/schema/definition.ts` stays as it is. No API changes. CEL still reads
  `data.<key>`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: the key lock reads only the base version. A key change
  rewrites its readers and says so. The key input moves into a Developer
  view, gains Escape and refuses a bad key. The notice gives way to the
  "Read by" zone. The change list scenario covers a rename.
- `studio-form-editor`: a name given in the form editor follows the new
  lock and rewrites readers. A minted key passes over a key only an
  expression reads.
- `studio-condition-builder`: the rewrite of a field read through the parsed
  tree's ranges. A rewritten guard re-reads as a comparison. It also adds the sentence a condition reads as outside the
  builder.

## Impact

- `packages/web/src/areas/studio/draft/key-readers.ts`: reader sites, the
  rewrite and the set of read keys.
- `packages/web/src/areas/studio/draft/fieldLabel.ts`, a new
  `draft/fieldKey.ts`, `draft/view-group-sync.ts`.
- `packages/web/src/areas/studio/panels/fieldCatalogLogic.ts`,
  `panels/FieldCatalogPanel.tsx`, `panels/shared/conditionLogic.ts`, a new
  `panels/readByRows.ts`, `screens/FormEditorScreen.tsx`.
- The studio catalog, `packages/web/src/i18n/catalogs/studio.ts`.
- The tests under `packages/web/test/` that pin the lock, the notice or the
  key input, `studio-fieldLabel.test.ts` among them.
- `docs/authoring-guide.md` states the key rule. `docs/browser-checks.md`
  replaces the `guard-field-key-renames` walk. `docs/decisions.md` closes
  `FIELDS-27`. It also takes the open points. `docs/decisions-archive.md` takes
  the closed entry. `ROADMAP.md` takes the stage status.
- `.claude/rules/ui-glossary.md`: the Developer view entry names the key's
  place in the field editor. Two new terms name the "Read by" zone and the
  line that counts rewritten conditions.
