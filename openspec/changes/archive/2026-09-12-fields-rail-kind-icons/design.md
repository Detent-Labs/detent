## Context

The entity rail lives in `packages/web/src/areas/studio/panels/EntityTabs.tsx`.
Its `layout` style sets the grid to `16rem minmax(0, 1fr)`. The Fields tab and
the Data sources tab both read that style.

A Fields entry renders through `PanelsRailFieldRow`. A wrapper `div` holds two
sibling controls: the row `button` and the move `select`. The button holds the
label (`railName`), the kind word (`railType`, a `0 1 3rem` flex basis) and the
issue mark. The select sits beside it at `0 1 auto`, capped at `7rem`.

The kind word comes from `fieldKindWord` in `draft/field-type-labels.ts`. It
gives one of three answers:

- a kind's name, through `fieldKindOf` and `fieldKindLabel`
- the custom-type word, for a plugin envelope
- the raw member triple, for a combination no kind names

The kind picker reads `fieldKindLabel` too.

The move lives in `FieldsTab`. Its `moveField` makes one write through
`moveFieldAndSyncViews` and keeps the moved field selected. It announces the
result in a polite live region. Then it hands focus to the element whose id
`moveControlId(fieldId)` names. The select's options come from
`groupTargetsFor` in `fieldCatalogLogic.ts`, plus any parent that is no group.

`FieldCatalogPanel` edits the selected top-level field through `FieldEditor`.
A group's children render inside that editor as `SubFieldRow`. Each child row
has its own key input and a `field-row-<id>` anchor. The file
`EntityTabs.tsx` imports the panel, so the panel cannot import back from it.

A requirement in `spa-accessibility` keeps a drag's keyboard route inside the
list. Its title reads "A reordering gesture inside a list answers the keyboard
in that list". The `studio-app` move requirement cites it. On 2026-09-11 the
owner chose to route one kind of move through the editor instead.

The owner chose the icon set the same day. The choice came from
[a mockup](https://claude.ai/code/artifact/8aea695d-56fb-4af2-8804-0ab311059465)
built on the IT Offboarding fields.

The rule file `.claude/rules/design-language.md` names `tmp/Detent Design Language.dc.html` as its source.
The rule asks that both files change together. Git does not track that source,
and this worktree lacks it.

## Shape brief

The owner confirmed this brief from `/impeccable shape` on 2026-09-11.

- **Job and audience.** A process author, in Operate mode, scans the Fields
  rail for a field. They select it, drag it into a group, or move it from its
  editor. The label is what they scan for.
- **Outcome.** A label reads whole, or nearly whole, on a 20rem rail. The kind
  reads at a glance from a leading icon. The indent alone shows the group.
- **Direction.** The row stays inside the existing register world: a ruled
  entry with a hairline, flush left, and no stamp. An 18px Lucide icon at a
  1.75 stroke leads the label in slate. Beside the issue mark the row carries
  nothing else. The move control stands in the editor under the key, as an
  ordinary labelled field.
- **Boundaries.** The Data sources rail only widens. The selection bar, the
  indent, the issue mark and the drag stay as they are. So do the move's
  destinations, its write and its announcement. Three anti-goals: no icon-only
  control, no new catalog string, and no tint or badge for a kind.
- **States and ranges.** IT Offboarding shows 51 entries: 7 groups and 44
  fields. The longest label there is "Written confirmation of the immediate
  lock obtained". The walk also needs a plugin field and a triple no kind
  names. It needs a selected group with its children, and an entry carrying an
  issue mark. Two more states: focus after a move, and the German locale.

## Goals / Non-Goals

**Goals:**

- A field's label gets the whole line beside its icon and issue mark.
- The kind stays readable three ways. An icon shows it at a glance. Its name
  shows under the pointer and reaches a screen reader.
- A keyboard user still reaches every destination the drag reaches.

**Non-Goals:**

- Icons in the kind picker. It keeps its names and notes.
- Any change to the move's destinations, its write or its announcement.
- Any change to the steps rail, or to a Data sources entry beyond its width.
- A keyboard move among siblings. The Fields rail offers none today.

## Decisions

### One icon per kind, through the branches `fieldKindWord` already takes

The file `field-type-labels.ts` gains `fieldKindIcon(field)`. It and
`fieldKindWord` both read one private helper, which answers in three branches:

- a kind, through `fieldKindOf`
- a plugin envelope
- a triple no kind names

The icon lookup maps those three to a `Record<FieldKindName, LucideIcon>`, to
`Puzzle` and to `Braces`. A fourth branch added to the helper then reaches
both functions. A kind with no icon fails `bun run typecheck`, because the
lookup is a `Record`.

| Kind | Icon |
|---|---|
| `text` | `Type` |
| `longText` | `TextAlignStart` |
| `radioChoice` | `CircleDot` |
| `date` | `Calendar` |
| `dateTime` | `CalendarClock` |
| `email` | `AtSign` |
| `person` | `User` |
| `number` | `DecimalsArrowRight` |
| `wholeNumber` | `Hash` |
| `yesNo` | `SquareCheck` |
| `yesNoRadio` | `ToggleLeft` |
| `multiChoice` | `List` |
| `checkboxChoice` | `ListChecks` |
| `people` | `Users` |
| `file` | `Paperclip` |
| `group` | `Folder` |
| plugin envelope | `Puzzle` |
| no kind | `Braces` |

Every name above resolved against `lucide-static@1.40.0` on 2026-09-11, and
each export exists in `lucide-react@1.40.0`. That is the version
`packages/web/package.json` pins.

Considered: one icon per value form, read from `type` and `format` alone. That
gives ten icons. The owner turned it down. Text, Long text and One choice would
share one icon, while the picker offers them as three separate kinds.

### The kind name stays inside the button, visually hidden

The icon renders inside a wrapper whose `title` carries the kind name. The
kind name also follows the label inside the button as visually hidden text,
through the file's existing `visuallyHidden` style. For "Person category" the
button's name then reads "Person category One choice". That is the same text
the visible word gives it today.

The wrapper itself carries `aria-hidden`. A `title` on an element holding no
text counts toward a button's name. With the attribute on the icon alone, a
screen reader would hear the kind twice.

The Icons section of `design-language.md` says an icon never appears alone in
place of a label. Here the icon sits beside the field's label, and it stands in
for a secondary word. The section gains one sentence. An icon may stand in for a
secondary word beside a label. That word stays its tooltip and stays inside the
accessible name.

Considered: `role="img"` with an `aria-label` on the icon. The name computation
for a button then passes through an image role. Hidden text keeps the name
plain, and the row test can still read it as text.

### The move control leaves the rail for the editor

The rail row loses its `select`, its four move props and the `railMove` style.
The wrapper stays, since it carries the indent, the hairline and the drop
target. The entry keeps its drag.

`FieldEditor` gains a move control directly under the key input, inside "What
this field asks". `SubFieldRow` gains the same control under its own key. The
label reads the existing `panelsScreen.moveTargetLabel`, "Move this field to".
The first option reads `panelsScreen.moveTargetTopLevel`. The value names the
group that holds the field, or the top level.

The owner picked the editor over two alternatives on 2026-09-11. A rail picker
shown under the pointer alone would leave the keyboard an invisible target.
Showing it on keyboard focus as well keeps the old rule. It adds hover, focus
and touch branches, though, and it shortens the label as it appears.

### One write, one announcement, and focus back on the control

`FieldsTab` passes its `moveField` to `FieldCatalogPanel` as `onMoveField`. The
panel hands it to `FieldEditor`. Each `SubFieldRow` hands it on to its own
children. No second write path exists.

The control's element takes the id `moveControlId(fieldId)` names. The refocus
effect in `FieldsTab` then finds it after the move, even across a remount. A
child moved to the top level becomes the selected field. Its new editor mounts
in the commit that the effect runs after.

The live region stays in the rail's `nav`. It is polite and always rendered.
An announcement for a move made in the editor therefore still reaches a screen
reader.

The helpers `moveControlId` and a new `moveTargetsFor(fields, fieldId)` move
into `fieldCatalogLogic.ts`. Both the tab and the panel import them from
there, which avoids an import cycle. The new helper returns the current parent
and the ordered destinations. The top level comes first, then a parent that is
no group, then every group from `groupTargetsFor`.

### The rail widens in the shared layout

The `layout` style changes `16rem` to `20rem`, and both tabs read it. Below the
narrow breakpoint the rail keeps its one-column stack.

The `railType` style goes, and so does its mention in the comment on
`railName`. The field row's own style, `railFieldInRow`, takes `alignItems:
center`, since an SVG has no text baseline. The shared `railRow` keeps
`baseline`, because the Data sources entries and both Add entries read it.

### The accessibility rule names the one route that leaves the list

The `spa-accessibility` requirement keeps its rule for a move among siblings.
It gains a paragraph for a move into a group or out of one. Such a move answers
the keyboard in the editor that selecting the entry opens beside the list.
Focus stays on that editor's move control.

The exception needs both conditions. The move changes the group, and the
editor opens on selection anyway. A dialog never qualifies, and the JSON view
never qualifies either.

### Pure lookups get assertions; the route gets a walk

`studio-fieldTypeLabels.test.ts` asserts three things. Sixteen kinds map to
sixteen different icons. A plugin envelope maps to `Puzzle`. A triple no kind
names maps to `Braces`.

`studio-fieldCatalogLogic.test.ts` covers `moveTargetsFor`. The top level
comes first. The field and its descendants never appear. A parent that is no
group stays in the list.

`studio-panelsRailFieldRow.test.tsx` renders the row through
`renderToStaticMarkup`. It asserts that no `select` renders. It asserts the
kind name as text inside the button. It asserts a wrapper carrying
`aria-hidden` and the kind name as its `title`.

Focus return and the announcement need a live draft store and real focus. The
static renderer has neither. Both land in `docs/browser-checks.md` as walks,
per the `development-toolchain` requirement "A browser check lands as an
assertion or as a checklist entry".

## Risks / Trade-offs

- [Tab reaches the editor after every later entry] → The rail precedes the
  editor in the tab order. Every editor field shares that route today, the key
  input included. The owner accepted it on 2026-09-11.
- [A child's control sits inside its group's editor] → Selecting the child
  selects the group and scrolls to its row. The control stands in that row.
- [The exception reads as a general license] → Its wording needs a change of
  group and an editor that selection opens. A move among siblings and a dialog
  both stay under the rule.
- [Two icon pairs look alike at 18px] → Date and Date and time differ in detail
  only. Yes/no and Yes/no buttons do too. The tooltip and the kind picker name
  each one.
- [Lucide renames an export] → `lucide-react` pins `1.40.0` exactly. A renamed
  export fails `bun run typecheck`.
- [The design-language source file drifts from its rule file] → This worktree
  lacks `tmp/Detent Design Language.dc.html`. A task records the new icon
  sentence, so someone can copy it into the main checkout's file.
- [The editor reads two keys named for the rail] → Both keys keep their
  `panelsScreen.` prefix. A rename would touch the catalog and every override a
  deployment stored.

## Migration Plan

Nothing migrates. The change touches no data and no definition contract. No
stored state changes either. The next build ships it, and a rollback reverts
its commits.

## Open Questions

None.
