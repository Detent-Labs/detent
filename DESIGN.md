---
name: Detent
description: A case register for form- and approval-driven business processes.
colors:
  paper-50: "#f3f2f2"
  ledger-100: "#eae9e9"
  ink-900: "#201e1d"
  slate-500: "#605d5d"
  hairline-300: "#d7d3d3"
  stamp-600: "#d42b11"
  refusal-700: "#ae1800"
  accent-400: "#ff9783"
  accent-600: "#dd2b0f"
  accent-700: "#ae1800"
  neutral-500: "#9b9797"
  neutral-900: "#2d2b2b"
  flag-visible: "#1450b8"
  flag-required: "#7a4d00"
  flag-readonly: "#6b2fa0"
typography:
  headline:
    fontFamily: "system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.5
    letterSpacing: "-0.015em"
  title:
    fontFamily: "system-ui, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 800
    lineHeight: 1.5
    letterSpacing: "0.08em"
  body:
    fontFamily: "system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  button:
    fontFamily: "system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 800
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.1em"
  legend:
    fontFamily: "system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.06em"
  mono:
    fontFamily: "ui-monospace, SF Mono, Cascadia Code, Roboto Mono, monospace"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0.08em"
rounded:
  sm: "0px"
  md: "0px"
  lg: "0px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
components:
  button-primary:
    backgroundColor: "{colors.stamp-600}"
    textColor: "{colors.paper-50}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "8px 14.4px"
  button-primary-hover:
    backgroundColor: "{colors.accent-600}"
    textColor: "{colors.paper-50}"
  button-primary-active:
    backgroundColor: "{colors.accent-700}"
    textColor: "{colors.paper-50}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink-900}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "8px 14.4px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.stamp-600}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "8px 4px"
  button-destructive:
    backgroundColor: "transparent"
    textColor: "{colors.stamp-600}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "8px 14.4px"
  button-destructive-hover:
    textColor: "{colors.accent-700}"
  button-authoring:
    backgroundColor: "transparent"
    textColor: "{colors.slate-500}"
    rounded: "{rounded.md}"
    padding: "8px 4px"
  input:
    backgroundColor: "{colors.paper-50}"
    textColor: "{colors.ink-900}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px"
  stamp-open:
    backgroundColor: "transparent"
    textColor: "{colors.stamp-600}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    padding: "2px 7px"
  stamp-settled:
    backgroundColor: "transparent"
    textColor: "{colors.ink-900}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    padding: "2px 7px"
  stamp-dormant:
    backgroundColor: "transparent"
    textColor: "#726e6e"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    padding: "2px 7px"
  stamp-refusal:
    backgroundColor: "{colors.refusal-700}"
    textColor: "{colors.paper-50}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    padding: "2px 7px"
  stamp-case:
    backgroundColor: "transparent"
    textColor: "{colors.stamp-600}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    padding: "2px 7px"
  check-badge-blocker:
    backgroundColor: "transparent"
    textColor: "{colors.refusal-700}"
    rounded: "{rounded.md}"
    padding: "0px 4px"
  check-badge-advisory:
    backgroundColor: "transparent"
    textColor: "{colors.slate-500}"
    rounded: "{rounded.md}"
    padding: "0px 4px"
  register-tab:
    backgroundColor: "{colors.stamp-600}"
    textColor: "{colors.paper-50}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    padding: "4px 14.4px 4px 8px"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-900}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  segmented-option:
    backgroundColor: "transparent"
    textColor: "{colors.ink-900}"
    rounded: "{rounded.md}"
    padding: "4px 8px"
  segmented-option-pressed:
    textColor: "{colors.stamp-600}"
  account-menu:
    backgroundColor: "{colors.paper-50}"
    textColor: "{colors.ink-900}"
    rounded: "{rounded.md}"
    padding: "8px"
  dialog:
    backgroundColor: "{colors.paper-50}"
    textColor: "{colors.ink-900}"
    rounded: "{rounded.md}"
    padding: "16px"
  form-card:
    backgroundColor: "{colors.paper-50}"
    textColor: "{colors.ink-900}"
    rounded: "{rounded.md}"
    padding: "12px"
  warning-callout:
    backgroundColor: "transparent"
    textColor: "{colors.refusal-700}"
    padding: "0px 0px 0px 8px"
---

# Design System: Detent

## Overview

<!-- Why: the DESIGN.md format spec fixes this heading text; renaming it breaks the tools that parse it. -->
<!-- antislop: allow dead-metaphors -->
**Creative North Star: "The Rubber Stamp Ledger"**

Detent moves a case through explicit states. The interface is the record of
that movement. Two devices carry the whole identity. A ruled row holds the
case. A stamp marks the state it reached.

Nothing floats. No surface pretends to be a card when it is a row in a
register. Alignment and rules organize the page. Shadow, color and radius do
not.

The screen prints two kinds of value. Prose takes the written face. A value
the engine matches exactly takes the mono face. The split itself is a signal.

The studio adds a selection mark in the accent. It shows what is open,
pressed or current. A 2px rule sits under an open tab. A 3px rule sits on the
leading edge of the current row.

**Key Characteristics:**

- Zero radius on every box. Only the canvas's SVG geometry curves.
- Two structural rule weights, and nothing between them.
- One accent, used as a stamp and as a selection mark, never as a ground.
- Machine values in mono, prose in the written face.
- Flush-left alignment, including inside a wide button.

## Colors

One accent sits on a near-white paper ground. Both schemes ship. The dark
scheme swaps the primitives and keeps every semantic role in place.

### Primary

- **Docket Red** (`#d42b11` light, `#ff563c` dark): the state stamp, and the
  one filled action per screen. It also draws the focus ring, the required
  marker, both selection marks, and the fill in a measuring rule. It marks. It
  never grounds a surface. The light value is a darkened vermilion. It is cut
  to the point that clears 4.5:1 at 11px.
- **Accent on Muted** (`#ae1800` light, `#ff9783` dark): the accent as text on
  the ledger ground or on a hover wash. Plain Docket Red measures under 4.5:1
  there. It colors the required marker in a form card miniature, and a
  destructive button on hover and press.

### Secondary

- **Refusal** (`#ae1800` light, `#ff9783` dark): the error tone. It marks a
  `faulted` instance, a dead letter, an overdue timer and a field error. It
  fills the refusal stamp in a row, and it draws the error banner's box. A
  blocker count and the header bar's dirty state print in it too.
- **Advisory** (`#ff9783` in both schemes): a check result that leaves publish
  open.
  It draws the warning callout's rule, an empty form card's box, and an
  incomplete condition's dashed box. The accent ramp has no dark override, so
  this value holds in both schemes.

### Tertiary

- **Flag Blue** (`#1450b8` light, `#6fa8ff` dark): the visible flag in the
  studio field matrix.
- **Flag Amber** (`#7a4d00` light, `#d4a017` dark): the required flag.
- **Flag Violet** (`#6b2fa0` light, `#b98aff` dark): the read-only flag.

Those three are the one place a component reads a color token directly. Each
has a single consumer and no ramp behind it.

### Neutral

- **Paper** (`#f3f2f2` light, `#201e1d` dark): the page ground, a field's own
  background, and a card or dialog.
- **Ledger** (`#eae9e9` light, `#2d2b2b` dark): the header band, the boundary
  fallback, a row's hover wash, and the canvas ground.
- **Ink** (`#201e1d` light, `#f3f2f2` dark): body text, and a settled stamp.
- **Slate** (`#605d5d` light, `#9b9797` dark): a label, a section heading, an
  empty state, a hint, a count.
- **Hairline** (`#d7d3d3` light, `#444141` dark): the 1px ledger rule between
  rows, a field border, and a card box.
- **Dormant** (`#726e6e` light, `#9b9797` dark): the dormant stamp.
- **Divider**: ink at 40%, mixed to transparent. It draws the 2px structural
  rule, a secondary button's border, and a dialog's box.

### Named Rules

**The Stamp Rule.** The accent marks state, selection, and one primary action
per screen. It never becomes the ground under content.

**The Five Tones Rule.** A stamp has five tones and no sixth. Adding one is a
design change. A single screen never decides it.

**The Never Green Rule.** A settled case prints in ink. Success never turns
green. A destructive action stays outlined in the accent and never turns red.

**The Role Rule.** A component reads a semantic role, never a ramp step and
never a hex. The three flag tokens are the only exception. A component
compiled with StyleX reads that role from
`packages/form-ui/src/tokens.stylex.ts`, which aliases the same custom
property `tokens.css` declares. Advisory and Dormant still need a role there.

## Typography

**Written Font:** `system-ui, sans-serif`

**Mono Font:** `ui-monospace, "SF Mono", "Cascadia Code", "Roboto Mono", monospace`

No webfont loads. The written face is whatever the reader's OS provides, at
two weights only: 800 and 400.

**Character:** the pairing is clerical. The written face carries what a person
wrote. The mono face carries what the engine matches. Nothing else separates
them, and nothing else needs to.

### Hierarchy

- **Headline** (800, 1.25rem, -0.015em): the `h1`. One per screen.
- **Title** (800, 0.85rem, uppercase, 0.08em, slate): the `h2` section
  heading.
- **Body** (400, 15px, 1.5): prose and control text. The reading column stays
  under 68 characters. A table sets its text at 0.9rem.
- **Button** (800, 14px): the label of every `.btn`. A row's identity button
  and a menu item keep the body text.
- **Label** (400, 11px, uppercase, 0.1em, slate): a field label, a kicker, a
  menu group label, a term in the profile register.
- **Legend** (400, 11px, uppercase, 0.06em, slate): a table header, a fieldset
  legend, a section heading on the step page.
- **Mono** (600, 11px, uppercase, 0.08em): a stamp. The register tab tracks
  it wider, at 0.14em.

A machine value inside running text takes the mono face at the size around
it, with no uppercase. That covers an id, a hash, a key, CEL, and a figure in
a column. Most of them print between 0.8rem and 0.85rem.

### Named Rules

**The Machine Face Rule.** A string takes mono only when you can name the
reason. Otherwise it takes the written face.

**The Tracking Floor Rule.** A tracked label stays at 11px or above. Its
uppercase tracking must survive umlauts and eszett.

## Layout

Each area screen caps its own column and centers it. The shell sets no cap of
its own. A participant reads, so the app area and the shell's own screens cap
at 46rem. An operator scans, so admin, reporting and studio screens cap at
60rem. The process surface takes no cap and fills the viewport height.

Inside a screen, a few blocks cap themselves. A prose note runs to 60ch. A
dialog and a standalone note cap at 34rem. A single input on the profile page
caps at 22rem.

Spacing runs on a 4-point scale: 4, 8, 12, 16, 24 and 32px. A gap that misses
the scale is a mistake.

Two structural rule weights exist. A 2px divider separates major sections and
sits under a screen heading. A 1px hairline separates rows of a register or a
table. Nothing sits between the two weights. Neither one softens into a tint.
A selection mark belongs to a separate class, which Shapes describes.

The layout changes at these widths:

- **30rem:** the header wraps, and the nav takes a row of its own. The profile
  register drops to one column.
- **40rem:** an app register row drops to one column. Its quantity moves to
  the left.
- **64rem:** a studio tab body stacks its columns. A rail leaves its side
  column and caps its height at 20rem.
- **Container queries:** the step form stacks at 34rem of its own width, and
  the player at 64rem.

An independent scroll region contains its own overscroll. Scrolling a rail to
its end leaves the page behind it in place.

### Named Rules

**The Long German Rule.** German runs up to 40% longer than English. No
control derives its width from the English label. No stamp takes a fixed
width: a two-line stamp is correct, a clipped one is not.

## Elevation & Depth

Strictly flat. Every surface on the page rests at one level.

Two shadow tokens exist, and only because the top layer has no rule to sit
on. A new use of either one counts as a design change.

### Shadow Vocabulary

- **shadow-md** (`0 3px 10px color-mix(in srgb, var(--color-text) 16%, transparent)`):
  the account menu.
- **shadow-lg** (`0 12px 32px color-mix(in srgb, var(--color-text) 22%, transparent)`):
  a dialog.

Both derive from the current scheme's ink, so they stay correct in the dark
scheme. A dialog's backdrop darkens the page with black at 45%. Depth on the
page itself comes from three things only. The 2px structural rule, the 1px
ledger hairline, and one muted surface.

A selection mark draws with an inset `box-shadow`. It lifts nothing. It draws
a rule.

### Named Rules

**The Escape Hatch Rule.** A shadow marks an element that left the page. On
the page there is no shadow, at rest or on hover. The inset selection mark is
the one exception, because it draws a rule.

## Shapes

No box has a radius. All three radius tokens are `0px`. The `.btn` family and
the global field rule read them. A compiled style declares no radius.

The border is the form language. A field is a 1px box. A card is a 1px
hairline box. A stamp is a 2px `currentcolor` border.

An error banner is a 2px box in the refusal tone. A dialog is a 2px box in
the divider. A canvas group is a 1px stroke with no fill, so the grid stays
visible through it.

A dashed border means not there yet. It marks an incomplete condition, an
unresolved migration mapping, and a conditionally visible form card. It also
marks a field kind the catalog lacks, the drop target at a form's tail, and a
suggested role. The process name in the header bar takes a dashed underline
while an author can still rename it in place. On the canvas, a dash marks a
manual path and the keyboard focus ring.

A selection mark is a separate class of rule, drawn in the accent:

- **Open mark:** a 2px accent rule under an open tab or a pressed option.
- **Current mark:** a 3px accent rule on the leading edge of the current row.
  A selected path row and a selected form editor card take it too.

One shape breaks the rectangle. The register tab cuts its trailing edge with
`clip-path: polygon(0 0, 100% 0, calc(100% - 0.4rem) 100%, 0 100%)`. It reads
as a divider tab slotted into a ledger, never as a pill.

The canvas draws SVG geometry, and three of its shapes curve. A circle of
radius 16 marks the initial and the terminal step. A circle of radius 7 marks
a connect handle. A path turns each corner on an 8px arc.

### Named Rules

**The Zero Radius Rule.** Every box is square. No size, no state and no
surface earns a curve. The canvas's SVG geometry is the one exception.

**The Mark Rule.** A selection mark shows what is open, pressed or current. It
never separates one region from another. Only the accent draws it, at 2px or
3px.

## Components

The character is clerical and exact. A control behaves like an entry in a
record: precise, repeatable, and boring on purpose. Character comes from the
mono face and the stamp, never from the control itself.

### Buttons

- **Shape:** square (0px), a 1px transparent border, 8px by 14.4px padding.
- **Primary:** accent fill, paper text. One per screen. Hover `#dd2b0f`,
  active `#ae1800`.
- **Secondary:** transparent, ink text, divider border. Hover washes ink at
  7%, active at 14%.
- **Ghost:** transparent, accent text, 4px inline padding. Hover washes the
  accent at 10%, active at 18%.
- **Destructive:** outlined in the accent, never filled and never red. It
  rides alongside secondary. On hover and press it switches to Accent on
  Muted.
- **Authoring command:** a ghost button in slate, mono at 11px. Hover washes
  to the ledger surface, and press washes ink at 14%.
- **Disabled:** 45% opacity and `cursor: not-allowed`.
- **Focus:** a 2px accent outline at 2px offset, on every focusable thing. A
  field draws it at 0 offset, and a grid cell at -2px.
- A label sits flush left in any button wider than its own text.

A row of secondary commands in the studio takes the authoring command. The
form tab strip holds one such row. The accent there stays with the open tab.

### Icons

- Lucide at 18px with a 1.75 stroke, in `currentcolor`.
- An icon sits beside a label, or it decorates and carries `aria-hidden`.
- An icon never stands in place of a label.
- In the entity rail, a field row leads with its kind icon in slate.

### The Stamp

- **Shape:** a 2px `currentcolor` border, 2px by 7px padding, mono at 11px,
  weight 600, uppercase, tracked 0.08em.
- **Five tones:** open (accent), settled (ink), dormant (Dormant), refusal
  (filled), and case (accent, on a task screen).
- **Refusal in the banner:** the stamp stays outlined there. The banner's own
  box carries the tone.
- **Tilt:** minus 2 degrees only where the stamp marks an error, in the banner
  or the boundary fallback. In a row or a cell it sits straight.
- One stamp per row. A second fact belongs in the row's own column.

### The Check Badge

The badge counts a row's open check results, and it prints smaller than a
stamp. The steps rail and the form card carry it.

- **Shape:** a 2px `currentcolor` border, 0 by 4px padding, mono at 11px,
  weight 600, tabular figures, no uppercase.
- **Tones:** refusal for a blocker, slate for an advisory result.
- It prints only when the count is above zero.

### The Register Row

- Three columns: a stamp, an identity, and a right-aligned quantity in mono,
  like a ledger's amount column.
- A 1px hairline under each row, 8px of vertical padding.
- Hover washes the row to the ledger surface, and the step name underlines.
- The identifying content is a real `<button>`. The row itself has no click
  handler.
- Below 40rem the row stands in one column, and the quantity moves left.

### Tables

- Text at 0.9rem.
- Header cell: 11px uppercase at 0.06em in slate, left aligned, with the 2px
  divider under it.
- Body cell: a 1px hairline under it, top aligned, 8px padding.
- An admin table row washes to the ledger surface on hover.
- The identity in a cell is a bare button in the body text. It underlines on
  hover.

### Navigation

- **Header:** a flex row on the ledger surface, 8px by 12px padding, with the
  2px divider under it.
- The register tab names the open area: mono, 11px, tracked 0.14em, accent
  fill, paper text, trailing edge clipped.
- One tab shows at a time. The other three areas live in the account menu,
  and the actor's roles decide which of them appear.
- A nav entry is a secondary button with an icon. The current entry takes a
  7% ink wash.
- The same check that sets `aria-current="page"` picks the current entry's
  compiled style.
- **Account menu:** a native popover, a 1px hairline box on paper, at least
  12rem wide. It takes `shadow-md`.
- A 1px hairline splits the menu's sections. An item washes ink at 7% on
  hover.

### Dialogs

- A native `<dialog>`: a 2px divider box on paper, 16px padding, at most 34rem
  wide.
- It takes `shadow-lg` over a backdrop of black at 45%.
- Its facts sit in a two-column grid, term then value.

### Inputs / Fields

- Label above control, both flush left, 4px apart.
- The one exception: a field inside a toolbar row, such as the canvas bar's
  group name. Its label sits beside the control, 8px apart, so the row keeps
  one control's height.
- The label takes 11px uppercase at 0.1em, in slate.
- The control takes a 1px hairline border, the paper ground, 8px padding and
  14px text. The border is the field; no fill stands behind it.
- **Focus:** the border turns accent and the 2px ring sits on top at 0 offset.
- A required marker prints in the accent. On the ledger ground it prints in
  Accent on Muted.
- Errors list in mono at 12px in the refusal tone. The list is a sibling of
  the label and never nests inside it.
- A checkbox or radio drops the border and takes `accent-color`.
- A note is not a field. It has no box. It takes a 2px hairline rule on its
  left, 12px from the text.
- The process name in the header bar drops the box. A 1px dashed underline
  stays, and it turns accent on focus.

### The Tab Row

Three strips share one tab language. The process surface has the tab row.
The form editor has the form tab strip, and the step form has its own tabs.

- **Row:** one line that scrolls sideways, with the 2px divider under it.
- **Tab:** transparent, 8px by 12px padding. Hover washes to the ledger
  surface.
- **Open tab:** weight 800 and the open mark, with no fill.
- **Count:** mono tabular figures in slate, with no box.
- The Checks count turns refusal at weight 800 while a blocker is open.
- The form tab strip and the step form pin their tab text at 14px. The tab row
  keeps the body text.

### The Segmented Control

- Its options sit in one row and share their edges. Each option takes a 1px
  hairline box, and each one after the first drops its left border.
- A pressed option takes an accent border, accent text and the open mark.
- Its legend takes the Legend style.

### Rails

A rail is a fixed-width column beside the main content, and it scrolls on its
own.

- **Frame:** the 2px divider on the edge that faces the content. Below 64rem
  the rail stands above the content instead.
- **Row:** a 1px hairline under each entry, 8px by 12px padding, flush left,
  and a ledger wash on hover.
- **Current row:** the current mark. The steps rail also washes the row to the
  ledger surface and sets the name at 800.
- **Steps rail:** a mono tabular number in slate leads each row. The check
  badge closes it.
- **Entity rail:** a child field indents 24px.
- **Checks rail:** a 1px hairline box with 12px padding. A 1px hairline
  separates its groups, and all clear prints in a 2px ink box.

### The Form Card

- A 1px hairline box on paper, 12px padding, in an auto-fill grid of columns
  at least 280px wide.
- An empty form takes a 2px box in the advisory tone instead.
- The kicker takes mono at 11px, uppercase at 0.08em, in slate. The step name
  takes weight 800.
- The miniature sits on the ledger ground and draws each entry as a bar. A
  bar's height shows the control's kind, from 8px to 32px.
- The check badge closes the head. The open control is a secondary button at
  the foot.

### The Field Matrix

- A grid in a 1px hairline box, with sticky column and row headers on paper.
- A column header takes the Legend style over the step key in mono.
- A 2px divider sits under the column headers and beside the row headers.
- A cell takes a 1px hairline on its bottom and right edges, and 4px by 8px
  padding. Its focus ring sits inside, at -2px.
- Each flag checkbox takes its own flag color through `accent-color`.
- A step with no view hatches its column in diagonal ledger stripes.

### The Canvas

- **Ground:** the ledger surface inside a 1px hairline box, with a 1px dot
  grid every 20px at full zoom.
- **Step:** a 180 by 60 rectangle on paper with a 1.5px hairline stroke. A
  selected step takes a 2px accent stroke.
- **Step label:** the written face at 13px, two lines at most.
- **Path:** a 1.5px slate stroke. An automatic path draws solid, and a manual
  path draws dashed. A selected path turns accent.
- **Group:** a 1px hairline stroke with no fill. A collapsed group fills with
  paper at 1.5px.
- **Canvas stamp:** a circle of radius 16 around a mono label at 9px. It marks
  the initial step and the terminal step. The terminal one tilts 8 degrees.
- **Focus:** a 2px dashed accent ring around the step.
- **Marquee:** a 1px dashed accent box over the accent at 8%.

The two structural rule weights govern the page. The canvas draws its own
strokes, at 1, 1.5, 2 and 3px.

### The Warning Callout

- Refusal text beside a 3px rule in the advisory tone, with 8px of padding
  before the text.
- It sits in place, next to the value it warns about.

### Screen Furniture

These rows and lists repeat across the admin, app and reporting screens.

- **Filter bar:** a wrapping row of controls, 8px apart, 12px above the
  content, with no rule.
- **Reporting filter bar:** controls 12px apart and aligned at the bottom. Each
  label stacks above its control, and a 1px hairline sits under the row.
- **Load more:** a secondary button 12px under the list.
- **Back link:** a ghost button atop a detail screen, with no leading padding
  and 12px under it.
- **Fact register:** a `<dl>` under a 2px divider. Terms and values stand in
  two columns, with a 1px hairline under each pair.
- **Timeline:** a list at 0.9rem with a 1px hairline under each entry. Its
  meta line takes 0.8rem in slate, and a key takes mono.
- **Row picker:** a whole row as one button, 12px by 8px padding. The name
  sits at the left and the meta at the right, and hover washes the row.
- **Inline row form:** a form inside a table cell. A primary button saves the
  row, and a ghost button cancels.
- **Count pill:** a 1px hairline box around a mono count at 12px.

### The Measuring Rule

Reporting has one chart form. A hairline track carries an accent fill whose
length is the quantity. The fill is a block 0.5rem tall at 65% opacity. The
figure prints beside it in mono with `tabular-nums`. A danger fill switches to
the refusal tone at 80%. The bar carries `aria-hidden`, because the number is
the content.

### Error, Emptiness, Waiting

- A failed request reports where its data would have sat. Never a toast.
- The error banner draws a 2px refusal box with 8px by 12px padding. It holds
  the tilted stamp and an optional retry.
- The boundary fallback draws a 2px divider box on the ledger surface, with
  32px padding. Its stamp prints at 16px beside an icon.
- An empty result never stands in for an error. An empty state says so in
  words, in slate, never as an empty table.
- A waiting state shows one line where the content will appear. No skeleton
  and no spinner.

### Motion

The page holds still. No component declares a transition. One animation
exists. When an author writes in the field catalog, the steps that write
reached flash the accent at 18%. The flash fades out over 1.2s. Under reduced
motion it never runs, and a global rule cuts every animation to 0.01ms.

**The Still Page Rule.** A state changes at once. A new animation counts as a
design change.

## Do's and Don'ts

### Do:

- **Do** keep every radius at `0px`.
- **Do** give a screen exactly one filled primary action.
- **Do** print a machine value in mono. That means an id, a hash, a version, a
  role name, CEL, or a figure in a column.
- **Do** name a state with a stamp in one of the five tones.
- **Do** mark an open, pressed or current item with a selection mark.
- **Do** declare a component's styles with `stylex.create()` beside its
  module.
- **Do** pick a state's compiled style in code. Read the value that also sets
  the DOM attribute, such as `aria-current`.
- **Do** name a literal class `prefix-block-element`, one hyphen per level,
  with a variant as a suffix class.
- **Do** wrap a row's identifying content in a real control.
- **Do** give a row of secondary studio commands the authoring command style.

### Don't:

- **Don't** add a sixth stamp tone.
- **Don't** read a primitive or a hex from a component. Read a role.
- **Don't** read another area's style object. Move a shared motif into
  `shell/`.
- **Don't** turn success green, or a destructive action red.
- **Don't** put a drop shadow on a resting surface, or on a hover state.
- **Don't** draw a structural rule in the accent.
- **Don't** report an error as a toast, or let an empty table stand in for
  one.
- **Don't** size a control from its English label.
- **Don't** turn a state into a class name.
- **Don't** add a literal class outside the `.btn` family. Declare a compiled
  style.
