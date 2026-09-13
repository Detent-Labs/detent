## Context

See `proposal.md` for the motivation. Every path below under `panels/` or
`screens/` starts at `packages/web/src/areas/studio/`.

The Forms tab body is one `tabpanel` in `screens/EditScreen.tsx`. Its
`tabBody` style is a flex column that scrolls. `FormsTab` renders the grid of
cards as that body's only child. The grid scrolls inside it, through its own
`overflowY: "auto"`.

`FormCard` in `panels/FormsTab.tsx` prints the step label in a `<span>` with
a `useId` id. That span sits inside the `identity` span, under the kicker. The
open control's `aria-labelledby` points at the id. The check badge's
`aria-label` joins the count to `formsTab.issueMark` or
`formsTab.issueMarkOne`, which read "open issues on this form" and "open issue
on this form".

In `panels/formCardRows.ts`, `miniatureEntry` sets `required: entry.required
=== true`. A draft types `required` as `boolean | DraftOf<Expression> |
undefined`, through `viewField` in `src/schema/definition.ts`. The helper
`isExpression` in `panels/shared/overrideMode.ts` already tells an expression
from a boolean. It is the test the form editor's own override control reads.

The `openControl` style sets 4px of block padding. FORMS-6 records it at
93.8x23px.

The header bar's `h1` holds the process name, in
`panels/ProcessHeaderBar.tsx`. The tab row is a `tablist`, and each tab body
is a `tabpanel` named by its tab. No heading stands between that `h1` and the
Forms tab body.

### The owner's picks

The owner chose on a mockup built from IT Offboarding's real rows. The block
below copies the picks verbatim from the program record.

Mockup: <https://claude.ai/code/artifact/33271039-eff3-4eaf-8a1e-69cdfbf966d2>

```text
- A1: legend line above the grid — field (outline), required (fill), "required if a condition holds" (dashed), section (group break), "taller asks for more" (8/16/24 sample). One line from ~720px.
- B1: a CEL-conditional required entry draws a 1px dashed outline in the required color (accentOnMuted), no fill; the foot keeps counting only literal `required: true`; the legend explains the dash.

Invisible parts of change 2 (no mockup needed): FORMS-13 badge name "{count} open issues on {step}" from one key per plural; FORMS-8 card name becomes a heading styled as today; FORMS-6 min-height 24px (+1px per card); FORMS-9 browser check adds 15 entries.
```

## Goals / Non-Goals

**Goals:**

- An author reads what each mark means without opening a form.
- A CEL-conditional entry reads apart from an ordinary and a required one,
  in both color schemes and under forced colors.
- IT Offboarding's twelve cards still fit the 635px tab body at 1100px wide,
  legend included.
- A screen reader moves between cards by heading, and tells two badges apart.

**Non-Goals:**

- A conditional entry in the foot's text. The owner kept the foot's count to
  a literal `required: true`.
- A legend naming each of the four heights. The owner chose A1 over A2.
- The authoring command's hover and press colors (FORMS-7) and the empty
  card's border role (FORMS-14). A later change in the same program owns
  both.
- The narrow widths of FORMS-11, FORMS-12, FORMS-15 and FORMS-16, which a
  fourth change owns.
- The check badge's own height. It stands under 24px as well. No other
  target shares the card's head, so it passes on WCAG 2.5.8's spacing
  exception.
- The entity rail's badge name, FIELDS-6's "1 issues".
- The steps rail's badge name, which joins `stepsRail.issueMark` to its count.

## Decisions

### Shape brief

The brief below comes from `/impeccable shape`, run with A1 and B1 as the
fixed direction.

- **Job and audience.** An author comes to find a form, open it, or spot an
  open issue. The legend answers what a mark means while the author reads a
  miniature. An author on a screen reader moves between cards by heading and
  reads the badges in the button list. The mode is Operate.
- **Direction.** The incumbent world from `DESIGN.md` stays. The legend is
  quiet slate text at 11px. Its samples are the miniature's own marks.
- **States and ranges.** IT Offboarding's forms hold 5 to 26 marks and 0 to 7
  required entries. None declares a CEL-conditional `required`, so a dashed
  mark appears only where an author writes a condition. The tab holds 0 to 12
  cards there. A tab with no card shows its sentence and no legend.
- **Layout and interaction.** The legend stands on one line above the grid.
  Its left edge sits on the cards' 12px inset. It keeps its place while the
  grid scrolls, and below about 720px wide it may wrap. It offers no control,
  no focus and no hover.
- **Accessibility.** The samples leave the accessibility tree, and the words
  stay in it as a named list. Each card label is a level-2 heading. The badge
  names its count and its step in one sentence. The open control stands 24px
  tall.
- **Constraints.** Components read roles from `tokens.stylex.ts`. Every gap
  sits on the 4-point scale. The detector hook may be inactive in the
  worktree, so `impeccable detect` runs once by hand after the build.

### The legend is a named list whose samples are the miniature's marks

The legend renders as a `<ul role="list">` ahead of the grid. Its
`aria-label` comes from `formsTab.legendLabel`, "What the marks mean". Each
`<li>` holds a sample group carrying `aria-hidden="true"`, then its words from
one catalog key. A screen reader reads "What the marks mean, list, 5 items",
then the five names. No sample reaches it.

WebKit drops a list's role under `listStyle: "none"`. The explicit role keeps
the list in VoiceOver on Safari. Chromium reads the role as redundant.

One `MiniatureMark` component draws a mark or a group break from a
`MiniatureEntry`. The miniature and the legend both render it, so a sample
cannot drift from the mark it names. The constant `FORMS_LEGEND`, exported
from `formCardRows.ts`, lists each item's key and its sample entries:

| Key | Words | Samples |
|---|---|---|
| `formsTab.legendField` | field | one outline, 12px |
| `formsTab.legendRequired` | required | one solid fill, 12px |
| `formsTab.legendConditional` | required if a condition holds | one dashed outline, 12px |
| `formsTab.legendSection` | section | one group break, 24px |
| `formsTab.legendHeight` | taller asks for more | three outlines, 8px, 16px and 24px |

The word "section" matches the form editor's palette. Its
`formEditor.mintSection` button adds a group under that word.

Each sample group stands 24px tall, its marks aligned to the bottom edge and
4px apart. The group takes the `legendSample` style: `display: "flex"`,
`alignItems: "flex-end"`, a `columnGap` of `space.s1` and `height: 24`. A
mark is an empty `<span>`, and an inline span ignores a width and a height.
The words take the empty-form sentence's type: 11px in slate, in the body
face.

Each `<li>` takes the `legendItem` style: `display: "flex"`,
`alignItems: "flex-end"` and a `columnGap` of `space.s1`. The words then
follow the group 4px later, on its bottom edge. The item stands 24px tall,
the group's own height. A default list item puts the group on a text baseline
and stands about 28px.

Alternatives considered:

- **Hide the whole legend with `aria-hidden`.** An author with low vision who
  also listens would see words the screen reader skips.
- **Five spans in a `<p>`.** The five names run together, with no boundary.
- **The Legend type style from `DESIGN.md`.** It sets uppercase at 0.06em,
  for a table header or a fieldset legend. The mockup reads lowercase.

### The legend's box and the height budget

The legend is a sibling of the grid inside the tab body. It sets
`display: "flex"`, `flexWrap: "wrap"` and `alignItems: "flex-end"`, with a
16px column gap and a 4px row gap. It takes 12px of inline padding and no
block padding, with `listStyle: "none"` and no margin. The grid keeps
`overflowY: "auto"` and shrinks to the height the legend leaves, so the legend
stays put while the grid scrolls. A style test holds the grid's declaration.

The surface's 12px gap stands above the legend. The grid's own 12px top
padding stands below it.

FORMS-2 measured 47px free under the grid, in the 635px tab body at
1100x876. The budget from there:

| Part | Height |
|---|---|
| Tab body | 635px |
| Grid content, 635px less the measured 47px | 588px |
| Open control's extra pixel, four card rows | 4px |
| Legend, one line | 24px |
| **Left free** | **19px** |

The mockup placed one legend line at about 720px wide and up. At 1100px the
tab body stands well above that, so the legend takes one line there.

### A third requirement state in the row model

`MiniatureEntry.required: boolean` becomes `requirement: "optional" |
"required" | "conditional"`. The function `miniatureEntry` reads it from the
entry's `required`:

| `required` | `requirement` | Mark |
|---|---|---|
| `true` | `"required"` | solid fill |
| an expression object | `"conditional"` | dashed outline |
| `false` | `"optional"` | outline |
| absent | `"optional"` | outline |

An expression with an empty `src` still reads as conditional. The Checks tab
reports the incomplete expression. The condition builder writes no key while
a row stays incomplete. Such an entry reads as optional until the row
completes.

`requiredCount` counts `"required"` alone, group breaks aside. A group break
ignores its entry's `requirement`.

The field takes a new name so typecheck flags every reader of the old
boolean. `FormsTab.tsx` and `studio-formCardRows.test.ts` are those readers.

The alternative kept `required` and added a `conditional` boolean. That pair
admits `required` and `conditional` both true, a state no entry has.

### The dashed mark

The style `miniatureConditional` stacks on `miniatureMark`, which keeps the
4px width, the 1px border and the box sizing. It declares:

- `borderStyle: "dashed"`
- `borderColor: { default: colors.accentOnMuted, [FORCED_COLORS]: "CanvasText" }`
- `forcedColorAdjust: { default: "auto", [FORCED_COLORS]: "none" }`

It declares no background. On the ledger ground, `accentOnMuted` reads 5.9:1
in light and 6.7:1 in dark. The `forms-tab-form-strip` design records both,
over the 3:1 a graphic needs.

The legend's samples stand on paper, the tab body's own ground. There
`accentOnMuted` reads 6.4:1 in light and 7.9:1 in dark, and `textMuted` reads
5.8:1 in both schemes. Each figure clears 3:1 as well.

Forced colors keep a border's style and replace its color. The explicit
`CanvasText` matches the rules on the solid fill and the group break. All
three marks then read one system color and differ by shape alone. A style
test in `studio-guidedSurfaceStyle.test.ts` holds each declaration.

### The open control's minimum height

The `openControl` style gains `minHeight: 24`. `shell/global.css` sets
`box-sizing: border-box` on every element, so 24px bounds the border box. The
4px block padding stays. The `.btn` rule's `align-items: center` keeps the
text centered. Each card grows by one pixel.

The alternative restored 8px of block padding. That costs 8px per card,
which the `forms-tab-form-strip` budget already refused.

### The step label becomes a level-2 heading

The label's `<span>` becomes an `<h2>` with the same id. The `identity` span
becomes a `<div>`, since a heading cannot sit inside a span. The control's
`aria-labelledby` keeps its reference.

The stylesheet `shell/global.css` gives every `h2` the heading face, a size,
uppercase, tracking, a muted color and margins. The `name` style resets each
one: `margin: 0`, `fontFamily: fonts.body`, `fontSize: "inherit"`,
`textTransform: "none"`, `letterSpacing: "normal"` and `color: colors.text`.
Weight 800 and `overflowWrap` stay.

Today the heading face and the body face name one stack. The face reset keeps
the label in the body face once Archivo ships as the heading face. A compiled
class outranks the element selector, so the heading prints as the span does
today.

The level is 2. The header bar's `h1` holds the process name, and nothing
between it and the Forms tab body is a heading. The files `ChecksRail.tsx` and
`StepsRail.tsx` already put a tab body's own headings at `h2`.

On the Fields tab the outline jumps from that `h1` to an `h3` (FIELDS-7).
That entry stays open, and its repair may settle on another level. The Risks
list names that dependency. The decisions task appends two sentences to
FIELDS-7: "Since `forms-card-legend`, the Forms tab's card labels stand at
`h2` under the header bar's `h1`. The repair matches that level or moves them
with it."

The alternative added a "Forms" heading at level 2 and set each card label
at level 3. Only a visually hidden heading keeps today's look. The
`tabpanel` already takes its name from the tab, so the hidden heading would
repeat it. The studio's visually hidden recipe also escapes its container,
FIELDS-2 in `docs/decisions.md`.

### The badge's name

The two keys take whole sentences:

| Key | Text |
|---|---|
| `formsTab.issueMark` | {count} open issues on {step} |
| `formsTab.issueMarkOne` | 1 open issue on {step} |

The key names stay. No deployment runs this engine yet, so no stored override
holds the old fragment. The catalog comment over the keys names both
placeholders.

`FormCard` fills `{count}` first, then `{step}` from `row.label`, the text
the heading prints. The `{step}` fill passes a function, so a label holding
`$&` prints as the author typed it. The name then leads with the badge's
visible count, as WCAG 2.5.3's guidance recommends.

Alternatives considered:

- **`aria-labelledby` joining the badge to the heading.** The name would read
  "2 Submit the Exit Notification", with no sentence around the count.
- **Two new key names.** They add churn and protect no stored override.

### Tests read the grid apart from the legend

The legend's sample groups carry `aria-hidden="true"`, as the miniature does.
The helper `miniatures()` in `studio-formsTab.test.tsx` matches every such
element. The order test finds the first one. Both read the markup from the
grid's own label onward.

Each test finds a list by its attribute alone. The grid starts at
`html.indexOf('aria-label="Forms in this process"')`, and the legend at
`aria-label="What the marks mean"`. The compiled `class` attribute precedes
`aria-label` on both lists, so a `<ul aria-label=` substring matches nothing.
The grid's label names nothing else on the tab, so the anchor is unique. The
legend's assertions read the markup ahead of the grid's anchor. The heading
test finds its `<h2>` by the `id` attribute alone, for the same reason.

The no-badge test asserts that the markup has no "open issue" at all. The
same tab with one issue prints that text, so the negative has something to
catch. A badge name's ampersand prints escaped, as `$&amp;`.

### Documentation

- **`DESIGN.md`.** The Form Card section gains the legend, the dashed mark,
  the heading and the 24px minimum. It says the heading keeps the body text at
  weight 800, apart from the Hierarchy's Title entry. The Shapes section's
  list of dashed marks gains the conditional mark, and so does the Accent on
  Muted color entry. That entry also names the legend's samples on paper, with
  their figures. The rules file
  `.claude/rules/design-language.md` stays as it is. It names three dashed
  marks as examples, and `DESIGN.md` holds the full list.
- **`docs/current-state.md`.** The Forms tab paragraphs name the legend, the
  `requirement` field, the heading and the badge's sentence.
- **`docs/browser-checks.md`.** Step 4 adds fifteen field entries. Step 1's
  pass line reads the legend on one line, and the twelfth control without
  scrolling the grid.

  Five steps join after step 6. Step 7 reads the legend, then scrolls the
  grid under a tab body about 400px tall. Its pass line reads the grid's
  `scrollTop` above 0, and the tab body's own `scrollTop` at 0. Steps 8 and 9
  read the headings and the control's height. Step 10 authors two dashed
  marks, at 12px and at 8px. Step 11 reads both under forced colors.

  The closing paragraph names both steps that leave the draft dirty.
- **`.claude/rules/ui-glossary.md`.** "Legend" already names the field
  matrix's line of explanations. The Forms tab's line is the same kind of
  thing. It takes the same word, with no row of its own. The Forms tab row
  names the legend above the cards. The form card row names a heading where
  it names a label.

  The legend's word "section" names a form's group, as the form editor's
  palette does. The table's `section` row names the step page's subject
  group. A short paragraph under the table records both uses:

  > The word *section* also names a form's group, on the form editor's
  > palette and the Forms tab's legend. The table's row names the step page's
  > subject group.
- **`docs/decisions.md`.** The six entries leave. FIELDS-7 gains the two
  sentences quoted under the level-2 heading decision. The branch
  `process-list-create-once` removes FORMS-10 first, and this change applies
  on a branch cut after that merge. The entries that stay cite lines in
  `FormsTab.tsx` and `DESIGN.md`, which this change moves. The section's
  opening paragraph names the card's heading where it names the name span.

  The decisions task re-reads each citation, and each bare `:NNN`
  continuation after one. Two citations are stale already. The one in FORMS-7
  misses the authoring command in `DESIGN.md` by two lines. The one in
  FORMS-14 names a blank line of `.claude/rules/design-language.md`. A
  verification task repeats that sweep after any fix that edits a cited file.

## Risks / Trade-offs

- [A dashed 8px checkbox mark shows a dash or less] → The legend's sample
  stands 12px, where the dash reads. An 8px one has no fill, so it reads apart
  from a required mark. Beside an ordinary 8px outline the dash alone tells
  the two apart, and forced colors leave nothing else. The browser check reads
  a 12px and an 8px conditional mark, in both schemes and under forced colors.
  Where the 8px pair does not read apart, the check records a new FORMS entry.
  The owner's pick stays as it is.
- [A screen reader never hears a conditional entry] → The owner kept the
  foot's count to literal `required: true`. The form editor's strip prints a
  CEL mark beside the flag, `formEditor.markCel`, which a screen reader reads.
- [The 588px figure predates the legend and the heading] → The browser
  check's step 1 rereads the twelfth card at 635px. The budget keeps 19px in
  reserve.
- [A screen reader hears five legend names first] → Heading navigation skips
  the list and lands on the first card. Each name is short.
- [An all-empty tab still shows the legend] → An author who adds a field
  meets the marks it names.
- [FIELDS-7's repair may put item names under a tab-level heading] → The
  Forms tab's card labels then move with it. Today they sit at `h2`, as the
  headings in `ChecksRail.tsx` and `StepsRail.tsx` do.
- [At 400px wide the legend wraps to two lines] → It takes 28px more from
  the grid's scroll box. FORMS-15 measured that box at 394px. The studio
  targets a desktop, and the owner kept FORMS-15 as is.
- [`tmp/Detent Design Language.dc.html` should change with `DESIGN.md`] →
  That file sits outside Git, in the main checkout alone. The owner updates it
  there.
- [This change and `process-list-create-once` both cut entries from one
  `decisions.md` section] → The program runs its changes in series. This
  change branches from `origin/main` after that merge.

## Migration Plan

No data, route or definition change. The next web bundle ships the legend and
the card. Reverting the commit restores today's tab.

## Open Questions

None.
