## Context

See `proposal.md` for the motivation. The Forms tab lives in
`packages/web/src/areas/studio/panels/FormsTab.tsx`. The pure function
`formCardRows` in `formCardRows.ts` yields one row per step that declares a
view. Each row carries a label, a role, a field count, the miniature's
entries and a check badge tally.

Today a miniature entry carries an index, a label, a bar height and a
required flag. The function `miniatureBarHeight` sets the height from the
field's kind: 8, 12, 16, 24 or 32 pixels. A note entry takes the 8px height.
Its label is the note's own text, with "Note" as the fallback. The miniature
renders as a `<ul>`, one `<li>` per entry, with the label above the bar. The
open control is a `btn btn-secondary` at the card's foot.

The grid is `repeat(auto-fill, minmax(280px, 1fr))` with `alignItems:
"stretch"`. A tall card therefore lifts every card in its row.

The owner settled the direction on 2026-09-13. They compared three variants
in mockups built from IT Offboarding's real data. The owner chose variant B,
then its compact form B2. The review of this change then replaced the
mockup's flat grey marks with outlines, and the owner approved that.

Mockups: <https://claude.ai/code/artifact/2b552f9c-7824-4e60-84fe-7299a24ef433>

## Goals / Non-Goals

**Goals:**

- IT Offboarding's twelve cards fit a 635px tab body at three columns. That
  height is what an 850px window leaves under the tab row.
- An author still sees each form's length, its groups and its required
  entries at a glance.
- A problem stays as easy to spot as today: the badge keeps its place in
  the head.

**Non-Goals:**

- No change to the grid, the card order, the badge or the Checks narrowing.
- No change to the open control's words or its target route.
- No change to what the field count counts.
- The miniature draws no form tabs, and it reads no `visible` or `readonly`
  flag.
- No German catalog. The studio ships English only.

## Decisions

### Shape brief

The brief below comes from `/impeccable shape`, run with B2 as the fixed
direction.

- **Job and audience.** An author comes to find a form, open it, or spot a
  problem. Reading a form's contents happens in the form editor. The mode is
  Operate.
- **Outcome.** Twelve cards on one screen at three columns. The badge and
  the advisory box stay where the eye already looks.
- **Direction.** The incumbent world from `DESIGN.md` stays. The card keeps
  its 1px hairline plate. The miniature shrinks to one row of narrow marks on
  the muted ground. The open control drops to an authoring command in a foot
  row beside the count.
- **States and ranges.** Real views hold 8 to 32 entries. A long form wraps
  its marks onto a further line. An empty form keeps its 2px advisory box,
  and a sentence stands where the marks would be. A view holding only notes
  counts as empty, as it does today.
- **Layout and interaction.** Head: kicker and label, with the badge at the
  trailing edge. Middle: the miniature. Foot: count on the left, open control
  on the right. The miniature takes no focus and no pointer input. At phone
  width the grid falls to one column and the tab scrolls; authoring happens
  at a desktop.
- **Constraints.** Components read roles from `tokens.stylex.ts`. Every gap
  sits on the 4-point scale. The detector hook is inactive in this worktree,
  so `impeccable detect` runs once by hand after the build.

### A mark per field entry, a group break per group, nothing for a note

Each field entry other than a group entry draws one mark, 4px wide. A group
entry draws a group break, a 1px line 24px tall. A group opens a section of
the form. A note asks nothing of a participant. The field count
already skips it, so it draws nothing.

The count keeps today's rule for a group entry: it adds one, since
`isDraftViewField` holds for it. That entry draws a group break, not a mark.
Submit the Exit Notification therefore reads "32 fields, 7 required" over 26
marks and 6 group breaks. The approved mockup reads the same.

`formCardRows` drops note entries from `entries`. Each remaining entry keeps
its view index as its React key. It carries a `groupBreak` flag, a `height`
and a `required` flag. The row gains a `requiredCount` for the accessible
name. It counts the entries without a group break whose `required` is
literal `true`. The name's required half then matches the filled marks an
author sees.

An empty form is one whose view has no field entry, a group entry counting
as one. A view holding only notes therefore reads as empty, which is today's
`fieldCount === 0` rule. The delta spec words all three requirements that
way.

### Heights on the 4-point scale

`miniatureBarHeight` returns 8px for a checkbox, 12px for a one-line field,
16px for a choice and 24px for long text. A choice means a `radio` or
`checkboxes` control, or a `list` field. A reference the catalog no longer
declares takes the one-line height, as today. The group branch leaves the
function, since a group now draws a group break.

The old scale ran to 32px. A 24px ceiling keeps one line of marks at 24px,
and a wrapped line adds 28px.

### Required marks differ in fill as well as color

An ordinary mark draws as a 1px outline in `textMuted`. A required mark
fills solid in `accentOnMuted`. The group break takes `textMuted` too. Each
mark sets `boxSizing: "border-box"`, so the outline stays inside the 4px
width and the kind's height.

The fill carries the difference without color, which WCAG 1.4.1 asks for.
Both colors clear the 3:1 minimum for a graphic against the muted ground:

| Role | Light | Dark |
|---|---|---|
| `textMuted` | 5.4:1 | 4.9:1 |
| `accentOnMuted` | 5.9:1 | 6.7:1 |

The mockup drew every ordinary mark flat in ink at 50%. That reads 3.1:1
against the light ground, but 1.9:1 against the required red. The `divider`
role, ink at 40%, reads 2.4:1 and 2.5:1. A flat mark cannot clear both at
once. A grey far enough from the red sits too close to the ground.

Under `forced-colors: active`, the required mark fills with `CanvasText`
(`forcedColorAdjust: "none"`) and the group break draws as a 1px border, so
both survive.

### The miniature's box

The mockup spaced marks 2px apart. The design language places every gap on
the 4-point scale. The build therefore uses 4px between marks and between
wrapped lines.

The miniature takes 4px of block padding and 8px of inline padding. It holds
a minimum height of 32px. Marks and group breaks align to the line's bottom
edge, `alignItems: "flex-end"`, so each kind rises from one baseline. The
row wraps with `flexWrap: "wrap"` and clips nothing. The empty sentence takes
the same 32px, its text centered on the vertical axis and set flush left.
Those are the mockup's B2 values, so one-line miniatures in a grid row end
level.

A 280px card fits about 30 marks on one line. IT Offboarding's longest form,
26 marks and 6 group breaks, fits one line at three columns.

The card's own gap drops from 8px to 4px as well. The height budget below
needs it.

### One accessible name, no list semantics

The miniature renders as one element with `role="img"`. Its name comes from
one catalog key per plural form: "{count} fields, {required} required" and
"1 field, {required} required". Each sentence stays whole for a translator.
The marks inside have no text and no role. The `<ul>` goes, because a
screen reader would otherwise announce a list of unnamed items.

An empty form renders a `<p>` reading "No fields yet" in the miniature's
place. The mockup read "No entries yet". A view holding only notes does hold
entries, so the word follows the count's own word instead. The catalog
retires `formsTab.requiredMark` and `formsTab.noteEntry`, since nothing reads
them any more.

The component keeps its name `Miniature`. Its styles keep the names
`miniature` and `miniatureRequired`. The style checks in
`studio-guidedSurfaceStyle.test.ts` find both blocks by name.

The name repeats the count's words. A markup test that looks for "1 field"
therefore matches the name as well as the foot. The tests match the foot's
count as element text, `>1 field<`, which the attribute never contains.

### The open control becomes an authoring command

The control keeps its words, "Open the form" and "Start the form". It takes
`btn btn-ghost` plus a compiled style with the mono face at 11px in
`textMuted`. Hover washes to `surfaceMuted`, and a press washes ink at 14%.
That is the treatment `FormTabStrip.tsx` calls `control`.

One value departs from that treatment: the block padding drops from 8px to
4px. The mockup's B2 drew the same 4px. The Form Card section in `DESIGN.md`
states that departure, since its `button-authoring` token reads `8px 4px`.

`FormsTab.tsx` declares its own copy of that style. `FormTabStrip.tsx` keeps
its style object private, and `design-language.md` allows a deliberate
duplicate. A comment names the source. Exporting the style from
`FormTabStrip.tsx` was the alternative. It would tie a Forms tab restyle to
the form editor's file.

A secondary button draws a second box inside the plate, beside the badge's
own box. It also stands 12.5px taller than the command, at the 1.5 line
height the budget assumes.

The design language gives the authoring command to a row of secondary
commands. This change widens that rule to a card's single open control. The
rule stands twice in `DESIGN.md`, in the Buttons section and in the Do's
list, and once in `design-language.md`. All three widen.

### The count moves to the foot

The count leaves the identity block. It joins the open control in one foot
row at the card's bottom edge. The head shrinks by one line. Cards in a row
keep their foot rows on one line, as the open control does today.

### The height budget

A card's height, from top to bottom:

| Part | Height |
|---|---|
| Border and padding, top | 13px |
| Kicker, 4px gap, label | 43px |
| Card gap | 4px |
| Miniature, one line | 32px |
| Card gap | 4px |
| Foot row, the command with its 1px border | 26.5px |
| Padding and border, bottom | 13px |
| **Card** | **135.5px** |

Four rows need 542px. The grid adds three 12px row gaps and 12px of padding
at each end. The tab body therefore needs about 602px. That leaves about
33px under the 635px budget.

The card's gap at 8px would cost 8px per card, and 634px in all. The
command's block padding at 8px would cost a further 8px per card.

### Rejected alternatives

- **A, register rows.** One ruled row per form: number, kind, name, count,
  badge and command. It fit every form on one screen at any width, and put
  every badge in one column. It dropped the form's shape from the tab. The
  owner chose B over it.
- **C, list and preview.** Register rows on the left, a preview of the
  selected form on the right. It serves reading a form's contents, which the
  owner does not use this tab for. Opening a form takes two clicks. The form
  editor already shows the same preview.
- **B1, the button at the foot.** Variant B with today's count line and
  secondary button. A card stands about 184px tall, so four rows at three
  columns overflow 635px.

## Risks / Trade-offs

- [The 635px budget comes from a screenshot] → The browser check sizes the
  tab body to 635px at 1100px wide. It reads the
  twelfth card there. The budget table holds about 33px in reserve.
- [The tab stops naming a form's fields] → The owner uses this tab to find,
  open and check forms. The form editor carries the labels.
- [One long form's wrapped marks lift its whole grid row] → Accepted. The
  stretch keeps foot rows aligned, and a 60-entry form costs one extra line.
- [An outline 4px wide leaves 2px of ground inside it] → The browser check
  reads both mark kinds in both schemes. A mark too faint to read fails that
  check.
- [IT Offboarding never wraps a miniature] → The browser check adds ten field
  entries to one form.
- [The authoring command is quieter than a bordered button] → Every card
  carries it in the same place. Its name and focus ring stay unchanged.
- [`tmp/Detent Design Language.dc.html` should change with `DESIGN.md`] →
  That file sits outside Git, in the main checkout alone. The owner updates
  it there.
- [The `tokens.css` comment on `--color-accent-on-muted` argues a 4.5:1 need
  at 11px] → The comment gets a new reason. The filled mark is a graphic held
  to 3:1. It reads this token to keep the required color the asterisk used.
  `.btn-destructive` stays the reader held to 4.5:1.

## Migration Plan

No data, route or definition changes. The build ships the new card with the
next web bundle. Reverting the commit restores the old miniature.

## Open Questions

None.
