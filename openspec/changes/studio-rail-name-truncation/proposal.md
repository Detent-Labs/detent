## Why

`studio-app` already requires a Fields rail entry to name its field "by its
resolved label alone, on one line." The kind name sits beside it. The entity
rail's implementation, `EntityTabs.tsx`, lets that label and kind name wrap
at any character instead. It never stays on the one line the requirement
describes.

The rail's column is 16rem wide, narrower still for an indented group child.
Inside it, a longer label collapses to a single character per line instead
of staying readable. That is a visible defect. It is also a direct
violation of the live requirement.

## What Changes

- `EntityTabs.tsx`'s `railName` and `railType` styles switch from
  unlimited-wrap (`overflowWrap: "anywhere"`) to single-line truncation:
  `whiteSpace: "nowrap"`, `overflow: "hidden"`, `textOverflow: "ellipsis"`.
  Each now sits on a real, fixed `flex-basis` in place of `railName`'s zero
  basis and `railType`'s content-tracking one. The label and the kind name
  stay on the one line the requirement already describes. Neither one
  starves the other under a narrow rail column.
- The same two spans, plus the Data sources row's own name span, gain a
  `title` attribute carrying their full text. A sighted user can then
  recover a truncated value on hover.
- `studio-app`'s existing "Fields rail entry" requirement gains three
  scenarios anchoring this. A field name too long for the rail's width
  truncates instead of wrapping. So does a long kind name, and so does a
  long Data sources key. The fix touches the one `railName` style element
  both tabs' rows share.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-app`: the Fields rail entry requirement gains three scenarios. One
  covers a long field name, one a long kind name, one a long Data sources
  key. Each one states that the rail stays on one line and truncates rather
  than wraps.

## Impact

- `packages/web/src/areas/studio/panels/EntityTabs.tsx` is the only code
  file touched: two `stylex` property blocks (`railName`, `railType`) and a
  `title` attribute added at the three sites that render them.
- No API, schema, or persisted-data impact. A rendering fix confined to the
  Fields and Data sources tabs' entity rail.
