## Why

`studio-app` already requires that a Fields rail entry name its field "by its
resolved label alone, on one line," with the kind name sitting beside it. The
entity rail's implementation (`EntityTabs.tsx`) lets that label and kind name
wrap at any character instead of staying on the one line the requirement
describes. In the rail's 16rem column — narrower still for an indented group
child — a longer label collapses to a single character per line instead of
staying readable, which is a visible defect and a direct violation of the
live requirement.

## What Changes

- `EntityTabs.tsx`'s `railName` and `railType` styles switch from
  unlimited-wrap (`overflowWrap: "anywhere"`) to single-line truncation
  (`whiteSpace: "nowrap"`, `overflow: "hidden"`, `textOverflow: "ellipsis"`),
  each on a real, fixed `flex-basis` instead of `railName`'s zero basis and
  `railType`'s content-tracking one, so the label and the kind name stay on
  the one line the requirement already describes, and neither one starves
  the other under a narrow rail column.
- The same two spans, plus the Data sources row's own name span, gain a
  `title` attribute carrying their full text, so a sighted user can recover
  a truncated value on hover.
- `studio-app`'s existing "Fields rail entry" requirement gains three
  scenarios anchoring this: a field name too long for the rail's width
  truncates instead of wrapping, so does a long kind name, and so does a
  long Data sources key — the fix touches the one `railName` style element
  both tabs' rows share.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-app`: the Fields rail entry requirement gains scenarios for a long
  field name, a long kind name and a long Data sources key, stating each
  stays on one line and truncates rather than wrapping.

## Impact

- `packages/web/src/areas/studio/panels/EntityTabs.tsx` — the only code file
  touched: two `stylex` property blocks (`railName`, `railType`) and a
  `title` attribute added at the three sites that render them.
- No API, schema, or persisted-data impact. A rendering fix confined to the
  Fields and Data sources tabs' entity rail.
