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
  stamp-refusal:
    backgroundColor: "{colors.refusal-700}"
    textColor: "{colors.paper-50}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    padding: "2px 7px"
  register-tab:
    backgroundColor: "{colors.stamp-600}"
    textColor: "{colors.paper-50}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    padding: "4px 14.4px 4px 8px"
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
the engine matches exactly takes the mono face. That split is a signal, not
decoration.

**Key Characteristics:**

- Zero radius, everywhere, with no exception.
- Two rule weights, and nothing between them.
- One accent, used as a stamp rather than as a paint.
- Machine values in mono, prose in the written face.
- Flush-left alignment, including inside a wide button.

## Colors

One accent sits on a near-white paper ground. Both schemes ship. The dark
scheme swaps the primitives and keeps every semantic role in place.

### Primary

- **Docket Red** (`#d42b11` light, `#ff563c` dark): the state stamp, and the
  one filled action per screen. It also draws the focus ring, the required
  marker, and the fill in a measuring rule. It marks. It never grounds a
  surface. The light value is a darkened vermilion. It is cut to the point
  that clears 4.5:1 at 11px.

### Secondary

- **Refusal** (`#ae1800` light, `#ff9783` dark): the error tone. It marks a
  `faulted` instance, a dead letter, an overdue timer and a field error. It
  fills the one filled stamp form, and it outlines the error banner.

### Tertiary

- **Flag Blue** (`#1450b8` light, `#6fa8ff` dark): the visible flag in the
  studio field matrix.
- **Flag Amber** (`#7a4d00` light, `#d4a017` dark): the required flag.
- **Flag Violet** (`#6b2fa0` light, `#b98aff` dark): the read-only flag.

Those three are the one place a component reads a color token directly. Each
has a single consumer and no ramp behind it.

### Neutral

- **Paper** (`#f3f2f2` light, `#201e1d` dark): the page ground, and a field's
  own background.
- **Ledger** (`#eae9e9` light, `#2d2b2b` dark): the header band, the boundary
  fallback, and a row's hover wash.
- **Ink** (`#201e1d` light, `#f3f2f2` dark): body text, and a settled stamp.
- **Slate** (`#605d5d` light, `#9b9797` dark): a label, a section heading, an
  empty state, a hint.
- **Hairline** (`#d7d3d3` light, `#444141` dark): the 1px ledger rule between
  rows, and a field border.
- **Divider**: ink at 40%, mixed to transparent. It draws the 2px structural
  rule and a secondary button's border.

### Named Rules

**The Stamp Rule.** The accent marks state and one primary action per screen.
It never becomes the ground under content.

**The Five Tones Rule.** A stamp has five tones and no sixth. Adding one is a
design change, not a screen decision.

**The Never Green Rule.** A settled case prints in ink. Success never turns
green. A destructive action stays outlined in the accent and never turns red.

**The Role Rule.** A component reads a semantic role, never a ramp step and
never a hex. The three flag tokens are the only exception.

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
  under 68 characters.
- **Button** (800, 14px): every action label.
- **Label** (400, 11px, uppercase, 0.1em, slate): a field label, a table
  header, a term in the profile register.
- **Mono** (600, 11px, uppercase, 0.08em): a stamp, an id, a hash, a version.
  Also a role name, CEL, and any column of figures.

### Named Rules

**The Machine Face Rule.** A string takes mono only when you can name the
reason. Otherwise it takes the written face.

**The Tracking Floor Rule.** A tracked label stays at 11px or above. Its
uppercase tracking must survive umlauts and eszett.

## Layout

The screen is one centered column. The shell caps it at 46rem, reporting at
60rem, and the studio canvas runs wider. A participant reads, so the reading
column stays narrow. An operator scans, so the tool surface goes wide.

Spacing runs on a 4-point scale: 4, 8, 12, 16, 24 and 32px. A gap that misses
the scale is a mistake.

Two rule weights exist. A 2px divider separates major sections and sits under
a screen heading. A 1px hairline separates rows of a register or a table.
Nothing sits between the two weights. Neither one softens into a tint.

The header is a flex row. Below 30rem it wraps and the nav takes a row of its
own. The profile register drops from two columns to one at the same point.

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
  the account menu popover and the dialog.
- **shadow-lg** (`0 12px 32px color-mix(in srgb, var(--color-text) 22%, transparent)`):
  a deeper top-layer surface.

Both derive from the current scheme's ink, so they stay correct in the dark
scheme. Depth on the page itself comes from three things only. The 2px
structural rule, the 1px ledger hairline, and one muted surface.

### Named Rules

**The Escape Hatch Rule.** A shadow marks an element that left the page. On
the page there is no shadow, at rest or on hover.

## Shapes

No corner has a radius. All three radius tokens are `0px`, and the third
exists only so a component never hard-codes the zero.

The border is the form language. A field is a 1px box. A stamp is a 2px
outline in `currentcolor`. An error banner is a 2px box in the refusal tone. A
canvas group is a 1px stroke with no fill, so the grid stays visible through
it.

One shape breaks the rectangle. The register tab cuts its trailing edge with
`clip-path: polygon(0 0, 100% 0, calc(100% - 0.4rem) 100%, 0 100%)`. It reads
as a divider tab slotted into a ledger, never as a pill.

### Named Rules

**The Zero Radius Rule.** Every corner is square. No size, no state and no
surface earns a curve.

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
  rides alongside secondary.
- **Disabled:** 45% opacity and `cursor: not-allowed`.
- **Focus:** a 2px accent outline at 2px offset, on every focusable thing.
- A label sits flush left in any button wider than its own text.

### The Stamp

- **Shape:** a 2px `currentcolor` outline, 2px by 7px padding, mono at 11px,
  weight 600, uppercase, tracked 0.08em.
- **Five tones:** open (accent), settled (ink), dormant (`#726e6e` light,
  neutral-500 dark), refusal (filled), and case (accent, on a task screen).
- **Tilt:** minus 2 degrees only where the stamp marks an error, in the banner
  or the boundary fallback. In a row or a cell it sits straight.
- One stamp per row. A second fact belongs in the row's own column.

### The Register Row

- Three columns: a stamp, an identity, and a right-aligned quantity in mono,
  like a ledger's amount column.
- A 1px hairline under each row, 8px of vertical padding.
- Hover washes the row to the ledger surface.
- The identifying content is a real `<button>`. The row itself carries no
  click handler.

### Inputs / Fields

- Label above control, both flush left, 4px apart.
- The label takes 11px uppercase at 0.1em, in slate.
- The control takes a 1px hairline border, the paper ground, 8px padding and
  14px text. The border is the field; no fill stands behind it.
- **Focus:** the border turns accent and the 2px ring sits on top at 0 offset.
- A required marker prints in the accent.
- Errors list in mono at 12px in the refusal tone. The list is a sibling of
  the label and never nests inside it.
- A checkbox or radio drops the border and takes `accent-color`.
- A note is not a field. It has no box, and takes a 2px left rule instead.

### Tables

- Header cell: 11px uppercase at 0.06em in slate, left aligned, with the 2px
  divider under it.
- Body cell: a 1px hairline under it, top aligned, 8px padding.

### Navigation

- The register tab names the open area: mono, 11px, tracked 0.14em, accent
  fill, paper text, trailing edge clipped.
- One tab shows at a time. The other three areas live in the account menu,
  and the actor's roles decide which of them appear.
- The current nav entry styles on `[aria-current="page"]` with a 7% ink wash.
  It never styles on a class.

### The Measuring Rule

Reporting has one chart form. A hairline carries an accent fill whose length
is the quantity. The figure prints beside it in mono with `tabular-nums`. A
danger fill switches to the refusal tone. The bar carries `aria-hidden`,
because the number is the content.

### Error, Emptiness, Waiting

- A failed request reports where its data would have sat. Never a toast.
- An empty result never stands in for an error. An empty state says so in
  words, never as an empty table.
- A waiting state shows one line where the content will appear. No skeleton
  and no spinner.

## Do's and Don'ts

### Do:

- **Do** keep every radius at `0px`.
- **Do** give a screen exactly one filled primary action.
- **Do** print a machine value in mono. That means an id, a hash, a version, a
  role name, CEL, or a figure in a column.
- **Do** name a state with a stamp in one of the five tones.
- **Do** style a state from the attribute the DOM already carries:
  `[aria-current="page"]`, `[aria-expanded="true"]`, `:disabled`,
  `:focus-visible`.
- **Do** name a class `prefix-block-element`, one hyphen per level, with a
  variant as a suffix class.
- **Do** wrap a row's identifying content in a real control.

### Don't:

- **Don't** add a sixth stamp tone.
- **Don't** read a primitive or a hex from a component. Read a role.
- **Don't** style another area's prefix. Move a shared motif into `shell/`.
- **Don't** turn success green, or a destructive action red.
- **Don't** put a shadow on a resting surface, or on a hover state.
- **Don't** report an error as a toast, or let an empty table stand in for
  one.
- **Don't** size a control from its English label.
- **Don't** turn a state into a class name.
