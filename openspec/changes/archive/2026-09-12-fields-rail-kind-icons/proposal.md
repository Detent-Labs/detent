## Why

The Fields tab of the IT Offboarding draft lists 51 entries in a rail 16rem
wide. Each entry splits one line three ways. The label comes first. The kind
word takes a fixed 3rem share. A move picker takes up to 7rem.

In the owner's screenshot of 2026-09-11 the labels read "Pers…", "Firs…" and
"Em…". Three or four characters survive, so the rail no longer names the field.

Two of the three things repeat what the rail already shows. The indent under a
group places a field, yet every picker prints that group's name again. The
kind word is worth keeping, but a word is its widest possible form.

## What Changes

- The rail widens from `16rem` to `20rem`. The Fields tab and the Data sources
  tab share one layout, so both rails widen.
- An icon for the field's kind replaces the visible kind word and leads the
  label. Each of the sixteen kinds in `FIELD_KINDS` takes its own Lucide icon.
  A plugin-typed field takes `Puzzle`. A field whose members name no kind takes
  `Braces`. The kind name stays as the icon's tooltip and inside the entry's
  accessible name.
- The move picker leaves the rail. A field entry keeps its drag, and it prints
  no group name.
- The field editor gains the move control, below the key. The selected field
  gets one, and so does each child row inside a group's editor. The control
  offers the same destinations and reaches the same write. It takes focus back
  after a move.
- `spa-accessibility` routes one kind of keyboard move to the editor. A move
  into a group or out of one answers the keyboard there. A move among siblings
  still answers it in the list.
- `.claude/rules/design-language.md` states when an icon may stand in for a
  visible word. Its entity rail paragraph drops the kind word and `railType`.
- `docs/browser-checks.md`: three walks follow the new move route. One new
  walk covers the icons and the width.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: three requirements change.
  - "The panels screen keeps every change and states so" drops the rail's
    move control and adds the kind icon.
  - "The Fields view divides into a definition half and an effect half" adds
    the move control to its first zone.
  - "A field moves into a group and out of it from the catalog rail" moves
    the keyboard route into the editor.
- `spa-accessibility`: one requirement gains an exception. It reads "A
  reordering gesture inside a list answers the keyboard in that list". A move
  into or out of a group answers the keyboard in the entry's own editor.

## Impact

- `packages/web/src/areas/studio/panels/EntityTabs.tsx`: the rail width, the
  kind icon, the removed picker, and the move handler it passes on.
- `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx`: the move
  control in `FieldEditor` and in `SubFieldRow`.
- `packages/web/src/areas/studio/panels/fieldCatalogLogic.ts`: the control's
  id and its destination list, moved out of `EntityTabs.tsx`.
- `packages/web/src/areas/studio/draft/field-type-labels.ts`: a kind-to-icon
  lookup beside `fieldKindWord`.
- Three test files: `studio-panelsRailFieldRow.test.tsx`,
  `studio-fieldTypeLabels.test.ts` and `studio-fieldCatalogLogic.test.ts`.
- `.claude/rules/design-language.md` and `docs/browser-checks.md`.
- No new catalog key, since the control reuses the `panelsScreen.move*`
  strings. No engine change and no definition contract change.
