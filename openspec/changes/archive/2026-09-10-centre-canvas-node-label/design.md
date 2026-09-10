## Context

See proposal.md for the motivation. The mechanism is one style entry in
`CanvasView.tsx`. A `<foreignObject>` 60 units tall holds two nested divs. The
outer box is a flex container that resolves `height: 100%` against that rect.
The inner div is the clamped label, `display: -webkit-box` with
`-webkit-line-clamp: 2`.

The outer box today reads `alignItems: "flex-start"` with `paddingTop: 20`. A
13px face on this stack lays out at 19.5 per line. One line therefore occupies
20 to 39.5, and two lines occupy 20 to 59.

Three consumers assert the current rule: the `studio-canvas` spec, a
source-reading test case, and a manual browser check.

## Goals / Non-Goals

**Goals:**

- A label block sits centred between the node's top and bottom edges, at one
  line and at two.
- The clamp, the ellipsis and the hover title keep working untouched.

**Non-Goals:**

- No change to node size, node width, handle clearance or the rename overlay.
- No change to the guard labels or to any other `<foreignObject>` on the
  canvas.

## Decisions

### Centre through the flex container

Replace `alignItems: "flex-start"` with `alignItems: "center"` and drop
`paddingTop`. The flex container then centres whatever the clamp produced,
with no line count to read.

Two lines measure 39 in a 60-unit box, so they move to 10.5 and close at 49.5.
One line measures 19.5 and lands at 20.25, a quarter unit from where it draws
today. That quarter unit is below what a reader can see. A row of one-line
labels keeps the alignment it has.

Alternative: keep the top alignment and compute the padding from the rendered
line count. The component already measures itself for the hover title, so the
number is reachable. Rejected. It buys nothing over one declaration and adds a
second reason for the node to re-render.

Alternative: split the 20 into equal top and bottom padding. Rejected. That
binds the arithmetic to the font's line height, which the centring reads for
itself.

### Express the spec change as a removal and an addition

The delta renames one scenario. A MODIFIED requirement replaces its whole
block. The validator rejects a block that drops a scenario the live spec still
holds. Renaming the requirement does not help either. That check follows a
rename back to the old block and compares the scenarios anyway.

So the delta removes the requirement and adds a replacement, named for the
centring. Measured: `openspec validate` rejects the MODIFIED form and accepts
this one.

One consequence for the archive step. Archive appends the added requirement
rather than restoring its position between the header-bar requirement and the
inline-rename one. Move it back by hand after the sync.

### Keep the height budget as a test, minus the padding term

The source test today asserts `20 + 2 * 19.5 <= NODE_HEIGHT`. Drop the 20 and
keep the rest. The clamp still needs two lines to fit inside the node. That
case catches a node height cut below 39.

## Risks / Trade-offs

A two-line label no longer shares its first line with a one-line neighbour.
That was the deliberate rule this change reverses, and the owner ranks the
in-node placement higher.

The clamp could behave differently as a centred flex item than as a topped
one. Nothing in `align-items` touches the item's own formatting context, so
this is unlikely. The browser check the verification gate demands reads it
either way.

## Migration Plan

No deploy step and no data step. One style declaration carries the change, and
reverting that declaration restores the old rule. No published definition, no
stored instance and no persisted row moves.

The archive step has one manual step, named under Decisions above. Move the
re-added requirement back to its old position in the live spec.

## Open Questions

None.
