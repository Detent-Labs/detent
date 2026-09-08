## Context

See `proposal.md` - Why. Mechanically: `EntityTabs.tsx`'s `PanelsRailFieldRow`
(used only by `FieldsTab`) renders each Fields rail entry as a flex row
holding a `railName` span (`flex: 1` → `flex-basis: 0%`) beside a `railType`
span (default `flex: 0 1 auto` → basis is its own content width), both with
`minWidth: 0` and `overflowWrap: "anywhere"`, inside a button whose own basis
(`1 1 9rem`) already shares the rail's 16rem column with the move-target
`<select>` (`maxWidth: 7rem`) and, for a group child, a further `paddingLeft`
indent.

`DataSourcesTab` renders its own, simpler row inline (no `PanelsRailFieldRow`,
no kind label, no move `<select>`) but reuses the identical `railName` span
for the data source's key — same `flex: 1`/`minWidth: 0`/`overflowWrap:
"anywhere"` properties, so it shares the same collapse mechanism, just with
more headroom since it has no sibling competing for the row's width.

`overflow-wrap: anywhere` lets the browser break text at any character, and a
zero-basis flex item with `min-width: 0` has no floor under how far it can
shrink. When the row's siblings leave `railName` little or no space — the
common case once a label is long and/or the row is indented — the browser
satisfies both constraints by wrapping the label one character per line
rather than giving it a wider column or letting it overflow. `railType` sits
on the identical mechanism.

This is not a regression from today's `studio-guided-surface` rework:
`git log -L` on `EntityTabs.tsx`'s rail-row block shows it was carried over
byte-for-byte from the old `PanelsScreen.tsx`'s `panelsRailName`/
`panelsRailType`, which had the same properties. The narrow-rail,
long-label combination needed to trigger it just wasn't exercised.

## Goals / Non-Goals

**Goals:**
- Make the Fields/Data-sources rail entry's label and kind name actually stay
  on one line, as `studio-app` already requires, for any label/kind length
  and at any indent depth.

**Non-Goals:**
- Widening the rail's 16rem column, or changing its breakpoint behavior.
- `railMove`'s own truncation: it sets `textOverflow: "ellipsis"` with no
  `overflow`/`whiteSpace`, which is likely a no-op in some browsers today.
  That is a separate, pre-existing gap (present in the old `PanelsScreen.tsx`
  too) outside the "resolved label ... kind name" sentence this change
  targets, and is left as a follow-up rather than bundled in here.

## Decisions

**Truncate (`whiteSpace: "nowrap"`, `overflow: "hidden"`,
`textOverflow: "ellipsis"`) rather than give the label more room to wrap.**
The alternative considered was matching this same file's own precedent
elsewhere (`FieldCatalogPanel.tsx`'s `usageListItemLabel`/`optionRowInput`,
both `flex: "1 1 8rem"`) — give `railName` a real rem-based flex-basis so it
wraps onto two or three lines gracefully instead of collapsing to one
character per line. Rejected: `studio-app` requires the rail entry to name
the field "on one line," full stop, and a gracefully-wrapped two-line label
still violates that as much as a badly-wrapped ten-line one does. It would
also make every rail row's height depend on its content, in a list that can
run to dozens of rows. Truncation is the only shape that keeps one line for
labels of any length.

**Give both `railName` and `railType` a real, fixed flex-basis — `4.5rem`
and `3rem` — instead of `railName`'s zero-basis `flex: 1` and `railType`'s
default `0 1 auto`; keep `minWidth: 0` on both.** Went through two measured
passes, not one:

Pass one kept `flex: 1` on `railName` and changed only the wrap property,
reasoning `minWidth: 0` was the sole property truncation still depended on.
A real-browser check against a live field ("Email address (requested
address)", kind name "Email address") disproved that: `railType` had no
`flex` of its own, so it defaulted to `0 1 auto` and its auto-basis equalled
its full content width, while `railName`'s zero basis gave it no claim on
the row. The flex shrink algorithm distributes space in proportion to
`basis × shrink`, so a zero-basis sibling absorbs none of it — the kind
name rendered in full and the field's own name collapsed to a single
character before the ellipsis.

Pass two gave `railName` `flex: "1 1 7rem"`, matching this file's own
precedent for a flexible label beside a sibling (`FieldCatalogPanel.tsx`'s
`usageListItemLabel`/`optionRowInput`, both `flex: "1 1 8rem"`), reasoning
that a nonzero basis and the wrap-vs-truncate choice are independent axes.
That fixed the one-character collapse, but a second real-browser check
(this time measuring `getBoundingClientRect` against `scrollWidth` across
all 53 fields on a live draft, not eyeballing one row) found a new,
opposite-shaped defect: `railType` still had no basis of its own, so its
share still tracked its own content length. `railName`'s new 7rem
(112px) basis alone already exceeds this button's typical measured ~86px
combined budget for the two spans, so the row is in the flex-shrink branch
for nearly every field — and there, a **zero-basis or content-tracking**
kind span still loses out of proportion to its own tiny need: even
"Date" (4 characters, 27px of content) rendered as "D…", clipped by
`railType`'s auto-basis being pulled down by the same shrink math that
was crushing `railName` a moment ago.

The fix is symmetric: give `railType` a real, *fixed* (not auto) basis
too, so a short kind word's claim on the row stops depending on how
little it actually needs. `4.5rem`/`3rem`, not `7rem`/auto: sized off the
measured ~86px typical combined budget so a short kind word (needing
20-35px) fits inside its 3rem (48px) share without shrinking at all in
the common case, while `railName` keeps the larger share as the row's
primary text. Re-measured after this change: "Date" and "Text" render
with zero truncation; the worst case ("Email address (requested
address)") is materially unchanged from pass two, since that row was
already deep in the shrink branch either way.

**Apply the identical basis pairing to `railType`, not just widen
`railName`.** Same mechanism, and the same requirement sentence covers
both ("kind name ... SHALL sit beside it," on the label's one line).
`railType`'s own comment already anticipated a long, wrapped German kind
name ("Mehrfachauswahl") as a known case — handled first with the wrong
wrap property, then left on an auto-basis that reintroduced the same
starvation pass two just fixed for the name. Both spans now share one
fixed-basis pattern.

**Add a `title` attribute to `railName`, `railType`, and the Data
sources row's own name span, carrying the same full text the visible
label truncates.** Ellipsis truncation has no built-in recovery path for
a sighted mouse user — a screen reader gets the full accessible name
regardless (confirmed: `text-overflow: ellipsis` never touches the DOM),
but a sighted user hovering a clipped "Ema…" had no way to read the rest
short of clicking in (which changes the open field) or resizing the
window. `title` is the platform-native, zero-dependency answer, and it
costs one attribute per span already rendering that exact string.

## Risks / Trade-offs

- [Risk] Truncated text hides the full label from the rail alone. →
  [Mitigation] Selecting the row opens the field's own editor, which shows
  the full label in its own input; this is the same trade-off `railMove`
  already makes for group labels in its closed `<select>`.
- [Risk] No automated test catches a wrapping regression here again: a
  `renderToStaticMarkup` unit test runs no CSS layout, and this project's
  `stylex` shim names classes after the literal style key, so changing a
  style's property values changes no string in the rendered HTML for a test
  to assert against. → [Mitigation] This matches a gap the project already
  accepts on purpose (`CLAUDE.md`'s "Four defect classes ... have no gate";
  `docs/browser-checks.md`). The fix is verified with a real-browser check
  at a narrow viewport and a long field label instead, and the two new spec
  scenarios make the expected behavior explicit for whoever touches this
  row next.

## Impeccable critique / audit findings

Run against the entity rail with two isolated sub-agent assessments
(`/impeccable critique`) plus a detector-and-computed-style pass
(`/impeccable audit`'s equivalent evidence), per this task's verification
tasks 2.5-2.6. Triaged, not all applied:

- **Applied.** The kind-name legibility defect above (short kind words
  truncating for no reason) — this is the basis-recalibration decision
  documented above, prompted directly by this check.
- **Applied.** No hover-recovery path for truncated text at any width —
  the `title`-attribute decision above.
- **Disproven, not applied.** "No visual or programmatic indicator marks
  the currently open row." Checked directly against the live DOM: the
  open row carries `aria-current="true"` and a visible
  `rgb(212, 43, 17) 3px 0px 0px 0px inset` box-shadow
  (`railRowCurrent`) — both already present in `PanelsRailFieldRow`
  before this change. The reviewing sub-agent's own query matched a
  different, unrelated `nav[aria-label]` element and reported a false
  negative from it.
- **Confirmed clean, no action needed.** The CLI detector
  (`impeccable detect`) reports zero findings this change introduces —
  its two `design-system-font-size` advisories on `EntityTabs.tsx` both
  predate this diff (one on an unrelated `railMove`-adjacent style block,
  one on `railType`'s untouched `fontSize`). Direct computed-style
  verification across all 106 rail name/kind-name spans on a real
  53-field draft confirms exactly one style combination
  (`overflow: hidden`, `white-space: nowrap`, `text-overflow: ellipsis`)
  applied everywhere this change touches, with no `aria-label` override
  anywhere — the full text stays each row's accessible name.
- **Out of scope, left as a follow-up, not applied.** Three findings are
  real but outside what "make the rail entry stay on one line" covers,
  and none are a regression this change introduces: (1) one example
  process's "Processing (XAN)" group holds 14 ungrouped children, well
  past the rail's own two-level indentation cap concern — a content/
  authoring question, not a rail-component defect; (2) the rail button's
  accessible name concatenates the label and kind name with no
  separator (e.g. "Personal detailsGroup"), and the move `<select>`'s
  own accessible name never identifies which field it belongs to — both
  pre-existing phrasing gaps in `PanelsRailFieldRow`'s markup, unrelated
  to wrap-vs-truncate; (3) `railMove`'s own truncation inconsistency,
  already tracked above under Non-Goals.

## Migration Plan

None. A client-side rendering change with no data, schema, or API surface;
it ships with the next `packages/web` build/deploy and needs no rollback
beyond redeploying the previous bundle.

## Open Questions

None.
