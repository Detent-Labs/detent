---
paths:
  - "packages/web/**"
  - "packages/form-ui/**"
  - "DESIGN.md"
---

# Design language: the register, not the dashboard

`DESIGN.md` holds the token and value authority. `tmp/Detent Design
Language.dc.html` is an untracked visual reference that may lag it. Its
stamp swatch still shows `#ec3013`, the color `tokens.css:26` replaced
with `#d42b11`. This file states the prose rules. Its facts must match
`DESIGN.md`.

Detent moves a case through explicit states. The interface is the record of
that movement. It uses ruled rows, a stamp that names the case's state, and
machine values printed as machine values. Nothing floats. Nothing carries
decoration. No box pretends to be a card when it is a row in a register.

## Five rules that decide everything else

1. Alignment and rules organize the page, not shadow, color, or radius.
   Everything sits flush left, including labels inside a wide button.
2. No box has a radius. `--radius-md` is 0 on every box. Only the canvas's
   SVG geometry curves.
3. The accent is a stamp, not a paint. It marks state and the one primary
   action per screen.
4. A value the engine matches exactly uses the mono face. Prose never does.
5. A component reads a semantic role, never a hex or a ramp step directly.
   Light and dark both follow from the role.

## Color

One accent sits on a light ground. Roles, such as `--color-accent`,
`--color-text-muted` and `--color-dormant`, form the semantic layer that
components reference. The ramp steps behind them are primitives. A
component must never touch a primitive directly.

The dormant tone reads `--color-dormant` (`colors.dormant` in the token
module), backed by the `--dormant-500` primitive. The advisory tone reads
`--color-advisory` (`colors.advisory`), backed by the `--advisory-500`
primitive. It draws a rule or a border, and never a stamp.

`--color-accent-on-muted` marks accent text or a mark on the ledger ground,
or on a hover wash.

The field matrix's `--color-flag-visible`/`-required`/`-readonly` tokens are
a scoped exception. Each is a single token with no ramp behind it, read
directly by a component. No other component reads any of the three
(`field-matrix-checkbox-colors`).

No role reads green. A success confirmation prints in ink, the plain text
color.

A few components still read a primitive directly instead of a role.
`docs/decisions.md` tracks each site, and none is precedent.

## Type

Two faces, one rule each:
- **The written face** carries everything a person writes. It takes two
  weights, 800 and 400. The stack is `system-ui, sans-serif`, from
  `tokens.css`. Archivo is the intended face and does not ship yet; see
  `docs/decisions.md` for that deferral.
- **Mono** carries everything the engine matches exactly. That includes ids,
  hashes, versions, role names, CEL, and any number that must align in a
  column. The stack is `--font-mono` (`fonts.mono` in the token module). It
  is a semantic signal. A string uses mono only when you can name the
  reason. Otherwise it uses the body face.

Mono takes 600 on a stamp and on the check badge. A machine value in
running text takes the size around it. `docs/decisions.md` lists ten
off-spec weight sites, and none is precedent.

Body copy sits in one measure and never exceeds 68 characters.

## Grid, space and rules

The space scale uses 4-point steps. A gap that misses the scale is a
mistake. Two rule weights exist, 2px and 1px. Nothing sits between them,
and neither softens into a tint. See `DESIGN.md`'s Layout section for the
divider and hairline detail, and its Shapes section for the open and
current marks.

A dashed border means not there yet. It marks an incomplete condition, an
unresolved migration mapping, or a conditionally visible form card.

A participant reads, so the reading column stays narrow. An operator scans,
so the operator's screens go wide. `--layout-cap-narrow` (61rem) and
`--layout-cap-wide` (80rem) hold those two widths. Radius is 0 on every
box. The canvas's SVG geometry is the one exception: its stamps, handles
and path corners curve.

## Icons

Lucide icons appear at 18px with a 1.75 stroke and inherit `currentColor`.
An icon never appears alone in place of a label. It sits beside a label, or
it works as decoration you can remove without losing meaning. An icon may
stand in for a secondary word beside a label. That word stays its tooltip,
and it stays part of the accessible name.

## Components

Every component already exists in `packages/web`. This section states how
each one stays in this language.

**The register tab**, `Chrome.tsx`'s compiled style. One tab shows at a
time. The other three areas live in the account menu. The actor's roles
decide which of those the menu shows.

**The stamp.** Every area compiles its own `stamp` style. `app`'s
`InvolvedScreen.tsx` and `StartedScreen.tsx` key it off a `stampTone`
lookup on the value it marks. `admin`'s `InstancesScreen.tsx` keys its own
style, named `badge`, off a `badgeTone` lookup. `reporting`'s
`components.tsx` compiles a `stamp` style too.

Mono, uppercase, tracked, with a 2px border in the current color. Five
tones exist and no sixth. Adding one counts as a design change, and a
single screen never decides it.

The stamp tilts only where it marks an error, in the error banner or the
boundary fallback. Inside a row or table cell it sits straight: a tilted
column stops reading as a column. Each row carries one stamp. A second fact
belongs in the row's own columns.

**Stamp or plain text.** The system has one stamp form on purpose. The only
question is whether a value earns one. The check badge counts open check
results and names no state. It shows only above zero.

**Elevation.** `shadow-md` sits on the account menu (`Chrome.tsx`) and
`shadow-lg` on a dialog, in the top layer only. On the page, `box-shadow`
draws inset lines only. They are the selection mark, the steps rail's
drop-position line and the field matrix's flagged-cell ring. None lifts a
box.

**Actions.** One primary action appears per screen, filled in the accent.
Every other action stays outlined or plain. Labels sit flush left in any
button wider than its text. A disabled action drops to 45% opacity.

Focus always shows as a 2px accent ring at 2px offset, from
`--focus-ring-width`, `--focus-ring-offset` and their sum
`--focus-ring-reach`. See `DESIGN.md`'s Buttons section for the field,
grid-cell and scroll-box detail. A scroll box in the studio area keeps a
gap at least the ring's reach (`spa-accessibility`). A destructive action
stays outlined in the accent and never turns red.

The authoring command is a studio ghost button in slate, mono at 11px. A
form card's open control and the form tab strip's controls take it. So do
the change list's commands, the form editor's move controls and a placed
field's own remove control. A group card's `Remove ({count})` control
stays exempt. See `DESIGN.md`'s Buttons section for the hover and press
detail.

**The register row**, each app-area screen's own `taskList`/`taskRow`
style pair (`TasksScreen.tsx` and its siblings). Three columns: a stamp,
an identity, and a right-aligned quantity in the mono face, like a
ledger's amount column. The row's identifying content is a real control. The
row itself has no click handler.

Studio's entity rail (`EntityTabs.tsx`'s `railRow`/`railName` styles)
follows a plainer version of the same rule. A hairline sits between
entries, and content stays flush left. It has no stamp, so the rule holds
without the first column. A field row leads with its kind icon. The current
row takes the current mark.

The steps rail in `StepsRail.tsx` adds two columns. A mono number leads, and
the check badge closes. That badge is a 2px box around a mono count. It
prints in refusal for a blocker, and in slate for an advisory result.

A grip, `GripVertical` at 18px, sits at the row's trailing edge. See
`DESIGN.md`'s Steps rail entry for the drag, drop-mark and keyboard detail.

**The warning callout.** Refusal text sits beside a 3px rule in the
advisory role. See `DESIGN.md`'s Warning Callout section for the padding
and placement detail.

**The measuring rule**, `reporting/components.tsx`'s `DurationRule`. See
`DESIGN.md`'s Measuring Rule section for its shape and ARIA detail.

**Fields.** Label sits above control, 4px apart. The error list sits as a
sibling of the label and never nests inside it. The studio select
(`panels/PathsPanel.tsx`) is the one `<select>` that drops its UA chevron;
every other keeps its own. See `DESIGN.md`'s Inputs / Fields section for
the toolbar exception and the rest of the detail.

**Error, emptiness, waiting.** A failed request shows its error where the
data would sit, never as a toast. An empty state says so in words. It
never shows as an empty table. A waiting state shows one line where the
content will appear, with no skeleton and no spinner. See `DESIGN.md`'s
Error, Emptiness, Waiting section for the banner and boundary-fallback
detail.

**Motion.** No component declares a transition. The field catalog's usage
tint is the one animation. A new one counts as a design change.

## Rules for building

**Component styles compile.** Every component in `packages/web` and
`packages/form-ui` declares its styles as a typed `stylex.create()`
object. Each one sits beside its own module, per `web-styling`'s
styling model. A compiled class hashes, so no rule in this section
applies to it. No doc anywhere should cite one of these classes by
name; it changes on the next build.

A DOM state never drives a hand-written selector in a compiled component
style. Style picks among named compiled styles in code instead. That code
still reads the same attribute the DOM already carries, for anyone else who
needs it: `[aria-current="page"]`, `[aria-expanded="true"]`, `:disabled`,
`:focus-visible`. The `.btn` family and `global.css` stay hand-written CSS
and keep DOM-state selectors directly.

An area never reads another area's style object. Shared motifs move to
`shell/`, or engineers duplicate them on purpose. No component reads a
primitive. Components read roles only. A few components still read a
primitive directly; `docs/decisions.md` tracks each one, and none is
precedent.

**Class names, for the few that stay literal.** One family never
compiles.

It lives in `tokens.css`: `.btn`, `.btn-primary`, `.btn-secondary`,
`.btn-ghost`, `.btn-destructive`, `.app-back`. Over 200 call sites across
every area made per-call-site compilation counterproductive. This
family stays shared on purpose (`web-styling`'s "A shared class stays
literal until its last consumer migrates"). It follows
`prefix-block-element`, one hyphen per level, with no deeper nesting: a
variant becomes a suffix class.

Three other literal exceptions exist: `canvas-node`, `panzoom-exclude`
and `.studio-dialog`. `web-styling` pins each to its own non-styling
reason. Those reasons are a keyboard-focus selector, a pan-library
contract, and a `::backdrop` the compiler cannot reach. Neither of the
first two has a rule in any stylesheet; only `.studio-dialog::backdrop`
does, in `shell/global.css`.

That sheet also holds `.shell` and `.shell > *`, the shell's own flex
frame, plus one `prefers-reduced-motion` block. `web-styling` counts these
four as its literal survivors. Some literal class names still appear in
markup with no rule behind them, such as `app-tasks`, `issue-list` and
`empty`. A new component adds none.

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

`formatDuration` prints one unit with at most one decimal, for example
`3.2 d` (`reporting/screens/reportingLogic.ts:92-104`). Its unit suffixes
come from catalog keys. Dates and numbers use the locale's own formatter. A
tabular column stays right-aligned in both locales.
