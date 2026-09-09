## Context

See proposal.md for motivation. The node is an SVG `<g>` 180 by 60 units. It
draws the label at baseline `y=24`. It draws the key at baseline `y=44`. The
inline rename field is a `<foreignObject>` at `y=14`, 22 units tall. That box
covers the label line and nothing else.

Two of those three numbers exist to stack two lines. Dropping one line leaves
them wrong rather than merely unused.

## Goals / Non-Goals

**Goals:**

- One drawn line in the node body, sitting where the eye expects it.
- The rename field opening over that line, wherever it now sits.

**Non-Goals:**

- Resizing the node. Four consumers read `NODE_WIDTH` and `NODE_HEIGHT` from
  `geometry.ts`: the layout engine, the connect handle, the focus ring and
  every stored `x`/`y` in a draft's layout. A height change would move every
  saved node.
- Changing the accessible name, the stamps, or the subprocess double rule.

## Decisions

Centre the label at `y=34`, rather than leaving it at `y=24`. The node is 60
tall, so its middle is 30. An SVG `<text>` sits on its baseline. A 13px body
face carries roughly 4.5 units below its centre. Baseline 34 puts the glyphs'
optical middle on the node's middle.

Leaving the label at 24 would read as a line that lost its partner. That is the
state this change removes.

Alternative considered: `dominant-baseline="middle"` at `y=30`. Rejected.
Engines render that property inconsistently for a mixed-script string. The
canvas also positions every other text element by an explicit baseline.

Move the rename field to `y=19`. The field is 22 tall. Starting it at 19
centres its box on 30, the middle the label now uses. Without the move the
field opens 5 units above the text it replaces. The node then twitches on every
double-click.

Delete the `nodeKey` style entry rather than leaving it unused. A style entry
no render site reads still type-checks. Nothing but a reader catches it. Three
other entries in the same sheet use `fonts.mono`, so the font import stays
either way.

## Risks / Trade-offs

The key becomes invisible on the canvas. Mitigation: it stays in the node's
accessible name, in the inspector, and in the JSON view. An author reading keys
is already in one of those three places.

A node whose label resolves to nothing draws its key in the label's own face.
That is 13px body, rather than 11px mono. Mitigation: none needed. Both the
fallback and its style predate this change. The change removes the mono line
and introduces no second face.

## Migration Plan

Nothing to migrate. The change draws a node differently and stores nothing new.
No definition, no draft layout and no published body carries the key line. No
row moves.

Rollback is the revert of one commit.

## Open Questions

None.
