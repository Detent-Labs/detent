## Context

See `proposal.md` - Why. Both changes live in one file,
`packages/web/src/areas/studio/screens/FormEditorScreen.tsx`:

- `formCardMoves` (style at line 380) has two consumers. The field card's
  row (JSX at lines 1214-1223) renders three `<button className="btn
  btn-secondary">` elements: Move up, Move down, plain Remove. The group's
  own row, inside its `<legend>` (JSX at lines 1136-1146), renders the same
  Move up/Move down plus a `Remove ({count})` that additionally carries
  `btn-destructive` - the cascading, multi-entry removal a group's Remove
  performs. `.btn`/`.btn-secondary` (`shell/tokens.css`) are 14px, weight
  800, bordered, and carry no `min-width: 0` override, so as flex siblings
  they never shrink below their own content width.
- `formCardKey` (lines 354-359) is `flex: 1; min-width: 0; overflow-wrap:
  anywhere`, so once `formCardMoves` has taken its fixed share of a narrow
  card, the entire remaining deficit lands on the key, and `anywhere` lets
  the browser break it at any character.
- `panels/FormsTab.tsx`'s `openControl` style (lines 268-287) is the
  project's one existing "authoring command" stylex block: mono, 11px,
  `colors.textMuted` turning to `colors.text` on hover/active, transparent
  background turning to `colors.surfaceMuted` on hover and a 14% ink
  color-mix on active. `DESIGN.md` (491-493) and `web-styling`'s own
  requirement already generalize this to "a row of secondary studio
  commands"; `formCardMoves` is such a row that was never migrated.
- The approved mockup
  (https://claude.ai/artifact/UqpN9oGDETZFbGwex1jTst) renders both changes
  together against the project's own tokens and confirms the visual result.

## Goals / Non-Goals

**Goals:**
- Give `formCardKey` back the width `formCardMoves` was consuming.
- Make the key's wrap point land after a `_`, not at an arbitrary character,
  even on a card too narrow for the width fix alone to fully rescue.
- Reuse the existing authoring-command stylex shape rather than declaring a
  new visual pattern.
- Restyle Move up/Move down/Remove consistently at both of
  `formCardMoves`' consumers, so the field card's row and the group's own
  row don't end up looking like two different components on one screen.

**Non-Goals:**
- No change to `formCardNotePreview` (free-text notes wrap as prose today
  and keep doing so).
- No change to the card's overall flex/grid structure, the group's
  two-column layout, or the 80rem preview breakpoint (`studio-form-editor`'s
  existing three-column requirement) - this change is scoped to the two
  style/render sites named above.
- No change to `formCardMoves`' behavior (move up/down, remove still fire
  the same handlers) - style only.
- No change to the group's `Remove ({count})` button - it keeps
  `.btn.btn-secondary.btn-destructive` unchanged (see Decisions).
- No change to the group legend's own key/name text (`formGroupLegendName`)
  - it has no `overflowWrap` set today and isn't exhibiting the
  character-wrap bug; extending the underscore-break fix there is future
  work, not this change (see Risks / Trade-offs).

## Decisions

**Migrate both `formCardMoves` consumers' Move up/Move down, and only the
field card's plain Remove - not the group's `Remove ({count})`.** The group's
Remove already carries `btn-destructive` on top of `btn-secondary`, a
deliberate accent-outlined warning for a cascading, multi-entry removal
(`design.md`'s alternative would be to invent a destructive authoring-command
variant; rejected, since `DESIGN.md` defines Destructive and Authoring
command as separate treatments and no other control in the codebase combines
them - inventing one here, for one button, is the kind of new visual pattern
this change's own goal says to avoid). Leaving that one button as
`.btn.btn-secondary.btn-destructive` keeps its warning cue intact while
every other control in both rows gets the smaller, consistent treatment.

**Reuse `FormsTab.tsx`'s `openControl` shape rather than exporting it.**
`design-language.md` already permits a deliberate duplicate over an export
that would tie a Forms tab restyle to the form editor's own file
(`FormsTab.tsx:257-259` states this precedent for the same style). This
change follows the same call: a second `stylex.create()` block in
`FormEditorScreen.tsx`, copying `openControl`'s values, not a shared import.
Block padding uses 8px (`DESIGN.md:657-658`'s "elsewhere" default), not the
Forms-tab foot's 4px exception.

**`overflow-wrap: break-word` plus `<wbr>`, not `overflow-wrap: normal`
plus `<wbr>`.** A key's grammar (`FieldDef.key`,
`/^[a-z_][a-z0-9_]*$/`) permits an underscore-free key, or one whose longest
underscore-delimited run is still wider than the card. `normal` would let
such a run overflow the card uncontained; `break-word` keeps `<wbr>` as the
preferred break (browsers exhaust normal break opportunities - including
`<wbr>` - before forcing a mid-run break) while still forcing a break inside
an oversized run as a last resort, so the key never overflows its card. This
is the behavior the two spec scenarios describe. `overflow-wrap: anywhere`
is rejected because, unlike `break-word`, it also lets flex/grid shrink the
box below what a real break allows, which is the layout-sizing half of
today's bug.

**Render the key with a small pure helper, not a regex replace on a JSX
string.** A helper (e.g. `renderFieldKey(key: string): ReactNode[]`)
splitting on `_` and rejoining with a literal `_` immediately followed by a
`<wbr />` element is a few lines, needs no new dependency, and is the
smallest unit a test can call directly. It applies only where `isField` is
true (the existing `cardLabel`/`formCardKey` branch); `formCardNotePreview`
keeps rendering its plain string.

**No change to `formCardBody`/`formCardKey`'s existing `flex: 1; min-width:
0`.** The width fix comes entirely from shrinking `formCardMoves`; the flex
model that lets the key absorb whatever width remains is correct today and
stays.

## Risks / Trade-offs

- [Shrinking the move/remove row's hit target] -> `openControl`'s existing
  `min-height: 24` already meets WCAG 2.5.8's minimum target size; this
  change carries that same floor into the new block, unchanged from the
  Forms-tab precedent already shipped.
- [An existing snapshot/DOM test asserting `.btn.btn-secondary` on these
  three buttons] -> `studio-formEditor-groupCanvas.test.tsx` is named in
  `proposal.md` - Impact; a task updates its assertions alongside the
  component change rather than after.
- [A key with two adjacent underscores, e.g. `a__b`] -> splitting on `_` and
  rejoining with `_` + `<wbr/>` reproduces the original string exactly
  (an empty segment between the two underscores renders as an empty text
  node), so no character is lost.
- [A group's own key/name (`formGroupLegendName`, rendered by the same
  `labelFor()` helper) is the same kind of underscore identifier, and today
  has no `overflowWrap` set at all - a long-enough group key in a narrow
  enough fieldset could overflow rather than wrap] -> out of scope: the
  group's row is much wider than a single field card's, and no example or
  test draft currently reproduces the overflow. Left for a follow-up if a
  real group key is ever reported doing it.

## Migration Plan

Both sites are presentational; no data, schema, or API changes. Ship as one
PR. No feature flag - the old `.btn.btn-secondary` row and the
`overflow-wrap: anywhere` key have no other caller, and no stored data
depends on either.

## Open Questions

None - both decisions above are settled by existing precedent in this repo
(`FormsTab.tsx`'s `openControl`, `DESIGN.md`'s authoring-command spec).

## Addendum: a second starving flex item, found by the browser check

Tasks 1 and 2 shipped, reviewed clean, full suite green - and the live
browser check (task 3.3) still showed `full_name` wrapping one character
per line, worse than the original bug. `formCardMoves` was never the only
non-shrinking sibling in `formCardBody`'s row: `formCardMarks` (the
required/span marks) and `formMachineMark` (the type label) also carry no
`minWidth: 0` and no `flex` override, so - like the old `formCardMoves` -
they take their full natural width and never yield. `formCardKey`'s
`flex: 1` shorthand resolves to `flex-basis: 0%`, so the flex algorithm
gives marks and type their complete preferred size FIRST and hands the key
only whatever is left over. Measured live at 1440px width on
`full_name`: `formCardBody` content width 144px, `formCardMarks` 74.9px,
`formMachineMark` 38.67px, leaving `formCardKey` 14.4px after two 8px
gaps - one character wide.

Shrinking `formCardMoves` alone fixed one starving sibling and exposed the
other; both existed before this change; only the first was visible in the
original bug report because the buttons were consuming even more of the
row.

First attempt, disproven live: changing `formCardKey`'s `flex: 1` to
`flex: "auto"` was implemented and reasoned through as above, then tested
in a real rebuilt/restarted browser session rather than trusted on theory
alone. It made no measurable difference - the key's rendered width was
14.59375px both before and after the change, to the pixel. The theory was
wrong about the mechanism: `formCardMarks` ("required 1/2") and
`formMachineMark` (the type label, e.g. "string") are each, in effect, a
single unbreakable run with no internal wrap opportunity below their own
current rendered width - "required" is one word, "string" is one word,
and neither carries `minWidth: 0`, so each one's CSS automatic minimum
size (its shrink floor) equals its own full natural width. Under the
flexbox shrink algorithm, an item that cannot shrink below its floor is
clamped there and removed from the flexible pool entirely, regardless of
its OWN flex-basis or any sibling's. Both marks and type hit that floor
immediately, so they always claim their full natural width no matter what
`formCardKey`'s flex-basis is - the "priority" framing above was the wrong
diagnosis; the real constraint is that two of the three siblings are
incompressible, not that one of them was mis-prioritized.

Actual fix: add `flexWrap: "wrap"` to `formCardBody`. `formCardKey` keeps
the first attempt's `flex: "auto"` rather than reverting to `flex: 1` -
moot either way once wrapping is in play (both give the key the same
final size once marks/type stop competing for its line at all), and
reverting it back would be pure extra churn with no behavioral effect. A
too-narrow row now drops `formCardMarks` and `formMachineMark` to a second
line
inside the same card, instead of leaving them on the first line and
crushing the key to make room. A card with enough width keeps all three on
one line exactly as it does today - wrapping only engages when the line
genuinely does not fit, which a roomy card never triggers.
`renderFieldKey`'s underscore-only break point still applies exactly as
before, for the width that still forces the key itself to wrap (a card
narrower than the key's own natural width, independent of what marks/type
do). No change to `formCardMarks`'s or `formMachineMark`'s own styles -
letting them reflow onto their own line is the fix; shrinking their text
is not needed and was never the goal.

Spike-tested live before writing the source change, the same way the
first attempt's failure was caught: patched `flexWrap: "wrap"` onto the
running page's own DOM (via the browser's devtools, no rebuild) for
`full_name`'s card alone first, then for all four visible cards at once.
Single-card result: the key rendered on its own fully unwrapped line, but
the card grew to 308px tall - traced to the untouched `email_address`
sibling in the same CSS grid row still exhibiting the old
one-character-per-line bug, so the grid row's own auto-height (set by its
tallest cell) stretched the patched card along with it, not a flaw in the
fix. Confirmed by patching all four visible cards together: every one
rendered its key on one unwrapped line, "required 1/2 string" (or "1/2
string") wrapped cleanly to a second line beneath it, and every card's
height dropped to a normal, consistent size. A fifth, still-unpatched
card below the fold kept wrapping character by character throughout,
which is the expected control case, not a regression.
