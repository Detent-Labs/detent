---
paths:
  - "packages/web/**"
  - "packages/form-ui/**"
---

# Design language: the register, not the dashboard

Source: `tmp/Detent Design Language.dc.html`. This is the distilled rule set.
Read the source doc for the full visual reference: swatches, type specimens,
and component states. This file and the source doc must change together.

Detent moves a case through explicit states. The interface is the record of
that movement. It uses ruled rows, a stamp that names the case's state, and
machine values printed as machine values. Nothing floats. Nothing carries
decoration. No surface pretends to be a card when it is a row in a register.

## Five rules that decide everything else

1. Alignment and rules organize the page, not shadow, color, or radius.
   Everything sits flush left, including labels inside a wide button.
2. No corner has a radius. `--radius-md` is 0, everywhere, with no exception.
3. The accent is a stamp, not a paint. It marks state and the one primary
   action per screen.
4. A value the engine matches exactly uses the mono face. Prose never does.
5. A component reads a semantic role, never a hex or a ramp step directly.
   Light and dark both follow from the role.

## Color

One accent sits on a light ground. Roles, such as `Unclaimed` and `Booked`,
form the semantic layer that components reference. The ramp steps behind them
are primitives. A component must never touch a primitive directly.

The field matrix's `--color-flag-visible`/`-required`/`-readonly` tokens are
a scoped exception. Each is a single token with no ramp behind it, read
directly by a component. No other component reads any of the three
(`field-matrix-checkbox-colors`).

## Type

Two faces, one rule each:
- **Archivo** carries everything a person writes: headings at weight 800,
  body copy, labels, and button text at weight 400. No other weight appears.
- **Mono** carries everything the engine matches exactly. That includes ids,
  hashes, versions, role names, CEL, and any number that must align in a
  column. The stack is `ui-monospace, "SF Mono", "Cascadia Code", "Roboto
  Mono", monospace`, unchanged from `tokens.css`. It is a semantic signal,
  not decoration. A string uses mono only when you can name the reason.
  Otherwise it uses the body face.

Body copy sits in one measure and never exceeds 68 characters.

## Grid, space and rules

The space scale uses 4-point steps. A gap that misses the scale is a
mistake. Two rule weights exist. Nothing sits between them, and neither ever
softens into a tint.

- 2px divider: between major sections and under a screen heading. The
  structural rule.
- 1px hairline: between rows of a register or table. The ledger rule.

A participant reads, so the reading column stays narrow. An operator scans,
so the tool surface goes wide. Radius is 0 everywhere, on every surface,
with no exception.

## Icons

Lucide icons appear at 18px with a 1.75 stroke and inherit `currentColor`.
An icon never appears alone in place of a label. It sits beside a label, or
it works as decoration you can delete without losing meaning.

## Components

Every component already exists in `packages/web`. This section states how
each one stays in this language.

**The register tab** (`.shell-tab`). One tab shows at a time. The other
three areas live in the account menu. The actor's roles decide which of
those the menu shows.

**The stamp** (`.app-stamp`, `.admin-badge`, `.rep-stamp`). Mono, uppercase,
tracked, with a 2px outline in the current color. Five tones exist and no
sixth: adding one counts as a design change, not a screen decision.

The stamp tilts only where it marks an error, in the error banner or the
boundary fallback. Inside a row or table cell it sits straight: a tilted
column stops reading as a column. Each row carries one stamp. A second fact
belongs in the row's own columns, not in a second badge.

**Stamp or plain text.** The system has one badge form on purpose. The only
question is whether a value earns one.

**Actions.** One primary action appears per screen, filled in the accent.
Every other action stays outlined or plain. Labels sit flush left in any
button wider than its text. A disabled action drops to 45% opacity. Focus
always shows as a 2px accent ring at 2px offset. A destructive action stays
outlined in the accent and never turns red.

**The register row** (`.app-task-list`, `.app-task-row`). Three columns: a
stamp, an identity, and a right-aligned quantity in the mono face, like a
ledger's amount column. The row's identifying content is a real control. The
row itself carries no click handler.

Studio's index rail (`.studio-panels-rail-entry`, `.studio-panels-rail-field`)
follows a plainer version of the same rule. A hairline sits between entries,
content stays flush left, and the mono-faced count or type name sits
right-aligned. It carries no stamp, so the rule holds without the first
column.

**The measuring rule** (`.rep-rule`). Reports' one chart form is a hairline
with an accent fill whose length carries a quantity. The figure prints
beside it in the mono face. The bar carries `aria-hidden`. The number is the
content.

**Fields.** Label sits above control, both flush left, 4px apart. A field
never sits on a filled surface: the border is the field. A focused field
shows a 2px accent border plus the accent focus ring on top. The error list
sits as a sibling of the label. It never nests inside the label.

**Error, emptiness, waiting.** A failed request shows its error where the
data would normally sit. It never shows as a toast, and an empty result
never stands in for an error. An empty state says so in words. It never
shows as an empty table. A waiting state shows one line where the content
will appear, with no skeleton and no spinner.

## Rules for building

**Class names.** Class names follow `prefix-block-element`, one hyphen per
level, with no deeper nesting. A variant becomes a suffix class, such as
`.admin-badge-faulted` or `.rep-rule-fill-danger`. A state never becomes a
class. Style targets the attribute the DOM already carries:
`[aria-current="page"]`, `[aria-expanded="true"]`, `:disabled`,
`:focus-visible`.

An area never styles another area's prefix. Shared motifs move to `shell/`,
or engineers duplicate them on purpose. No component reads a primitive.
Components read roles only.

**Labels and locales.** Every string a person reads comes from a catalog.
EN and DE ship in the shell, app, admin and reporting catalogs, each reached
through `t(locale, key)`. The studio catalog carries English only, and its
`t(key)` takes no locale. German text can be up to 40%
longer than English, and that constrains layout more than it constrains
copy.

No control derives its width from the English label. No stamp takes a fixed
width: a two-line stamp is correct, and a clipped stamp is not. Uppercase
tracking must survive umlauts and ß. Tracked labels stay at 11px or above.

Never assemble a sentence from fragments. Each sentence gets one key, so a
translator sees the whole sentence. The catalog never translates a machine
value: a role name, process id, definition hash, or CEL expression. Each one
always uses the mono face.

The formatter produces a duration, such as `3d 04h`, rather than string
concatenation. Its unit suffixes come from catalog keys. Dates and numbers
use the locale's own formatter. A tabular column stays right-aligned in both
locales.
