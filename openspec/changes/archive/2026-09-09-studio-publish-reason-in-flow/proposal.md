## Why

The reason under the Publish control renders in the wrong place. Its span is
out of flow, pinned to the button's own trailing edge. The header bar carries
a 2px bottom border below that button, and the span crosses it. Measured at
1440px: the span runs from y 142 to y 158.5, and the border occupies y 150 to
152. The uppercase cap band runs y 146 to 154. The structural rule strikes
the sentence at mid-cap height. Below that rule, the line reads as a caption
of the tab row rather than of the button above it.

The placement went out of flow for a measured reason. The action cluster is
right-aligned behind `marginLeft: auto`. A line in flow beside Publish moved
the button 167px the moment a blocker appeared.

That reason belongs to the space beside the cluster. Inside it, the pinned
trailing edge absorbs the line's whole width. Measured across thirteen widths
from 1440 to 375, with the line rendered. Publish holds its right edge 69px
from the viewport's, at every one of them.

## What Changes

- The reason moves in flow, into the action cluster itself, ahead of its
  controls. The cluster is right-aligned behind an auto-margin, so it grows
  leftward and every control holds its place.
- Both reasons keep their text and their 11px uppercase register. The tones
  stay too: refusal for the blocked draft, muted for the absent permission.
- The Publish control stops wrapping itself in a `role="group"`. The reason
  no longer sits beside the button. An `aria-describedby` carries the whole
  binding by id.
- The reason renders from its own component, `PublishReasonLine`, beside the
  control's own.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-publish`: the requirement "Publish states a blocked draft's reason
  before the click" fixes the text beneath the control today. It changes to
  place the text on the header row instead, and it takes the
  permission-denied reason's placement with it.

## Impact

- `packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx`: the
  `publishGate` and `publishReason` styles, the `trailingCluster`
  auto-margin, and `PublishNavControl`'s wrapper. It gains
  `PublishReasonLine`.
- `packages/web/test/studio-processHeaderBar-publishGate.test.tsx`: the cases
  that read the reason out of the control's own markup.
- `docs/browser-checks.md`: the entry "Publish's pre-click blocked reason",
  whose pass condition reads a red line beneath the button today.
- No engine change, no API change, no catalog change.
