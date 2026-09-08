## Context

See `proposal.md`'s Why section. Mechanically, `EntityTabs.tsx`'s
`PanelsRailFieldRow` renders each Fields rail entry as a flex row;
`FieldsTab` is its only caller. The row holds a `railName` span beside a
`railType` span. `railName` carries `flex: 1`, so its `flex-basis` is 0%.
`railType` carries the default `flex: 0 1 auto`, so its basis is its own
content width. Both spans carry `minWidth: 0` and `overflowWrap:
"anywhere"`.

The row sits inside a button with its own `1 1 9rem` basis. That button
already shares the rail's 16rem column with the move-target `<select>`,
which carries `maxWidth: 7rem`. A group child adds a further `paddingLeft`
indent on top.

`DataSourcesTab` renders its own, simpler row inline. It has no
`PanelsRailFieldRow`, no kind label, and no move `<select>`. It does reuse
the identical `railName` span for the data source's key. That span carries
the same `flex: 1`, `minWidth: 0`, and `overflowWrap: "anywhere"`
properties. It therefore shares the same collapse mechanism. It has more
headroom, though, since no sibling competes for the row's width.

`overflow-wrap: anywhere` lets the browser break text at any character. A
zero-basis flex item with `min-width: 0` has no floor under how far it can
shrink. The row's siblings often leave `railName` little or no space. A
long label or a deep indent each trigger this alone. The browser then
wraps the label one character per line. `railType` sits on the
identical mechanism.

This is not a regression from today's `studio-guided-surface` rework.
`git log -L` on `EntityTabs.tsx`'s rail-row block confirms it. The old
`PanelsScreen.tsx` passed this block down byte-for-byte, as
`panelsRailName`/`panelsRailType`, carrying the same properties. The
narrow-rail, long-label combination needed to trigger it just wasn't
exercised.

## Goals / Non-Goals

**Goals:**
- Make the Fields/Data-sources rail entry's label and kind name stay on
  one line, as `studio-app` already requires. This holds for any label or
  kind length, at any indent depth.

**Non-Goals:**
- Widening the rail's 16rem column, or changing its breakpoint behavior.
- `railMove`'s own truncation is out of scope too. It sets
  `textOverflow: "ellipsis"` with no `overflow` or `whiteSpace`, likely a
  no-op in some browsers today. That is a separate, pre-existing gap,
  present in the old `PanelsScreen.tsx` too. It sits outside the "resolved
  label ... kind name" sentence this change targets. This design notes it
  as a follow-up instead of bundling it in here.

## Decisions

**Truncate (`whiteSpace: "nowrap"`, `overflow: "hidden"`,
`textOverflow: "ellipsis"`) rather than give the label more room to
wrap.** One alternative matched this same file's own precedent elsewhere,
`FieldCatalogPanel.tsx`'s `usageListItemLabel`/`optionRowInput` (both
`flex: "1 1 8rem"`). That would give `railName` a real rem-based
flex-basis. It would then wrap onto two or three lines gracefully,
instead of collapsing to one character per line. Rejected.

`studio-app` requires the rail entry to name the field "on one line," full
stop. A gracefully-wrapped two-line label still violates that. So does a
badly-wrapped ten-line one. It would also make every rail row's height
depend on its content. Rows in this list can run to the dozens.
Truncation is the only shape that keeps one line for labels of any
length.

**Give both `railName` and `railType` a real, fixed flex-basis: `4.5rem`
and `3rem`, instead of `railName`'s zero-basis `flex: 1` and `railType`'s
default `0 1 auto`. Keep `minWidth: 0` on both.** This took two measured
passes to get right.

Pass one kept `flex: 1` on `railName` and changed only the wrap property.
The reasoning: `minWidth: 0` was the sole property truncation still
depended on. A real-browser check against a live field disproved that.
The field's resolved label was "Email address (requested address)". Its
kind name was "Email address". `railType` had no `flex` of its own, so it
defaulted to `0 1 auto`.

Its auto-basis equalled its full content width. `railName`'s zero basis,
meanwhile, gave it no claim on the row. The flex shrink algorithm
distributes space in proportion to `basis × shrink`. A zero-basis sibling
absorbs none of it. So the kind name rendered in full. The field's own
name collapsed to a single character before the ellipsis.

Pass two gave `railName` `flex: "1 1 7rem"`. That matches this file's own
precedent for a flexible label beside a sibling, `FieldCatalogPanel.tsx`'s
`usageListItemLabel`/`optionRowInput`. The reasoning: a nonzero basis and
the wrap-vs-truncate choice are independent axes. That fixed the
one-character collapse. A second real-browser check found a new,
opposite-shaped defect, though. This time it measured
`getBoundingClientRect` against `scrollWidth` across all 53 fields on a
live draft, rather than eyeballing one row.

`railType` still had no basis of its own, so its share still tracked its
own content length. `railName`'s new 7rem (112px) basis alone already
exceeds this button's typical measured ~86px combined budget for the two
spans. So the row sits in the flex-shrink branch for nearly every field.
There, a zero-basis or content-tracking kind span still loses out of
proportion to its own tiny need. Even "Date" (4 characters, 27px of
content) rendered as "D…". `railType`'s auto-basis gets pulled down by
the same shrink math that was crushing `railName` a moment ago.

The fix is symmetric: give `railType` a real, fixed (not auto) basis too.
Then a short kind word's claim on the row stops depending on how little
it needs. The final values are `4.5rem` and `3rem`, replacing `7rem` and
auto. These sizes come from the measured ~86px typical combined budget. A
short kind word needs 20-35px, well inside its 3rem (48px) share.
`railName` keeps the larger share, as the row's primary text.

Re-measured after this fix: "Date" and "Text" both come through whole,
with zero truncation. The worst case, "Email address (requested address)", stays
about the same as it was after pass two. That row was already deep in
the shrink branch either way.

**Apply the identical basis pairing to `railType` too, instead of only
widening `railName`.** The same mechanism applies. The same requirement
sentence covers both: "kind name ... SHALL sit beside it," on the label's
one line.

`railType`'s own comment already anticipated a long, wrapped German kind
name, "Mehrfachauswahl", as a known case. The fix handled it first with
the wrong wrap property. It then left `railType` on an auto-basis, which
reintroduced the same starvation pass two just fixed for the name. Both
spans now share one fixed-basis pattern.

**Add a `title` attribute to `railName`, `railType`, and the Data
sources row's name span.** Each one carries its own full text already.
Ellipsis truncation has no built-in recovery path for a sighted mouse
user, though. A screen reader gets
the full accessible name regardless. `text-overflow: ellipsis` never
touches the DOM, so that much is already confirmed. A sighted user
hovering a clipped "Ema…" had no way to read the rest, though.

Clicking in was one option, but that changes the open field. Resizing
the window was the only other option. `title` is the platform-native,
zero-dependency answer instead. It costs one attribute per span already
rendering that exact string.

## Risks / Trade-offs

- [Risk] Truncated text hides the full label from the rail alone. →
  [Mitigation] Selecting the row opens the field's own editor. That
  editor shows the full label in its own input. This is the same
  trade-off `railMove` already makes for group labels in its closed
  `<select>`.
- [Risk] No automated test catches a wrapping regression here again: a
  `renderToStaticMarkup` unit test has no CSS layout to run. This
  project's `stylex` shim also names classes after the literal style
  key. So changing a style leaves no string for a test to catch. →
  [Mitigation] The project already accepts this gap, per `CLAUDE.md`. A
  real-browser check verifies the fix instead, at a narrow viewport with
  a long field label. The two new spec scenarios also make the expected
  behavior explicit for whoever touches this row next.

## Impeccable critique / audit findings

Two isolated sub-agent assessments ran this (`/impeccable critique`),
plus a detector-and-computed-style pass (`/impeccable audit`'s
equivalent evidence). This matches tasks 2.5-2.6's verification steps.
This design applied only some of them below:

- **Applied.** The kind-name legibility defect above, short kind words
  truncating for no reason, matches the basis-recalibration decision
  documented above. This check prompted that decision directly.
- **Applied.** No hover-recovery path existed for truncated text at any
  width. The `title`-attribute decision above fixes that.
- **Disproven.** "No visual or programmatic indicator marks the
  currently open row." Checked directly against the live DOM: the open
  row carries `aria-current="true"`. It also carries a visible `rgb(212,
  43, 17) 3px 0px 0px 0px inset` box-shadow (`railRowCurrent`). Both were
  already present in `PanelsRailFieldRow` before this change. The
  reviewing sub-agent's own query matched a different, unrelated
  `nav[aria-label]` element instead, reporting a false negative from
  that mismatch.
- **Confirmed clean, no action needed.** The CLI detector (`impeccable
  detect`) reports zero findings this change introduces. Its two
  `design-system-font-size` advisories on `EntityTabs.tsx` both predate
  this diff. One sits on an unrelated `railMove`-adjacent style block.
  The other sits on `railType`'s untouched `fontSize`.

  Direct computed-style verification covered all 106 rail name/kind-name
  spans on a real 53-field draft. It confirms one style combination
  applied everywhere this change touches. That combination is
  `overflow: hidden`, `white-space: nowrap`, `text-overflow: ellipsis`.
  No `aria-label` override exists anywhere. The full text stays each
  row's accessible name.
- **Out of scope, left as a follow-up.** Three findings are real, but
  outside this change's scope. None are a regression it introduces:
  1. One example process's "Processing (XAN)" group holds 14 ungrouped
     children, well past the rail's own two-level indentation cap
     concern. That is a content/authoring question, unrelated to the
     rail component itself.
  2. The rail button's accessible name concatenates the label and kind
     name with no separator. The result reads "Personal detailsGroup".
     The move `<select>`'s own accessible name never identifies which
     field it belongs to. Both are pre-existing phrasing gaps in
     `PanelsRailFieldRow`'s markup, unrelated to wrap-vs-truncate.
  3. `railMove`'s own truncation inconsistency, already tracked above
     under Non-Goals.

## Migration Plan

None. This is a client-side rendering change, with no data, schema, or
API impact. It ships with the next `packages/web` build/deploy. It has
no rollback need beyond redeploying the previous bundle.

## Open Questions

None.
