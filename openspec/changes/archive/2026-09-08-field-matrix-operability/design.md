## Context

`bulkBadgeOn` returns a boolean. Its body is `eligible.length > 0 &&
eligible.every(...)`, so a mixed column and an empty column both return
`false`. `applyBulkToggle` recomputes the same `every(...)` and writes
`on ? default : !default`. A press on a mixed column therefore sets every
cell, and a second press clears every cell. Nothing recovers the mix.

The badge already carries a per-flag pressed style, added by
`stylex-shorthand-repair`. Three named styles exist, one per flag. The
component picks among them from the flag key it holds. A third state fits
that shape without changing it.

The grid's roving model covers `td` cells and the checkboxes inside an
activated cell. Header cells sit outside it. The thirty bulk badges are plain
buttons in `th` elements, so the browser puts each one in the tab order.

`spa-accessibility` already states that a grid is one tab stop and that a cell
takes none of its own. It says nothing about a control a cell contains, which
is the gap this change closes.

## Goals / Non-Goals

**Goals:**

- A mixed column never reads as an empty one.
- An author reads what a press will touch before pressing it.
- The grid is one tab stop, as its own specification already says.
- Nothing in the grid loses density.

**Non-Goals:**

- No undo. The count stands in place of one. A real undo belongs to the draft
  store rather than to one screen.
- No confirmation dialog. An author sweeping a matrix would meet it on every
  mixed press. They would learn to dismiss it.
- No change to what a press writes. The existing requirement already states
  that, and it stays true.
- No sweep of the type ramp or the 3px rules. Those are visual conformance,
  and they travel in their own change.

## Decisions

### 1. Three states read as outline, fill and neutral

The badge takes its three states from the vocabulary the design language
already uses, rather than from a new mark.

| State | Border | Fill | Text |
|---|---|---|---|
| empty | 1px, `colors.border` | none | muted |
| mixed | 1px, the flag's color | none | the flag's color |
| full | 1px, the flag's color | the flag's color | contrast |

Mixed and full share the flag's color and differ by fill alone, which is what
the spec requires. Empty carries the neutral border, so it reads as the odd
one out at a glance.

The alternative was a half-filled badge through a gradient. Two things ruled
it out. A gradient at 28 by 20 pixels reads as a rendering fault rather than a
state. The `background` shorthand it wants is the key
`stylex-shorthand-repair` just banned. A `backgroundImage` longhand would
sidestep the second point and leave the first one standing.

### 2. The count lives in one whole catalog sentence

The badge's title and its accessible name both come from one key carrying two
placeholders. `packages/web/src/i18n/catalogs/studio.ts` holds it. A
translator sees the whole sentence, which is what the localization rule
requires.

The name repeats the title rather than shortening it. A screen reader user
and a pointer user get the same two numbers.

### 3. The badges join the roving model rather than leaving the grid

Each badge takes `tabindex="-1"`. The arrow-key handler extends upward from
the first data row into the header row, and along it.

This design rejects the alternative, which moved the badges into the toolbar
as a menu. A badge belongs to its column. The alignment between a header badge
and the cells under it is a stated requirement.

### 4. Target size takes the spacing route, and measures it first

The badges sit on a `repeat(3, 1.75rem)` track, a 28 pixel pitch, which
already clears the 24 pixel spacing floor. The checkboxes sit on the same
track.

So this may already pass. The task measures it in a browser before changing
anything, and changes nothing if the measurement clears. Growing a checkbox to
24 by 24 would cost the density the grid exists for.

### 5. The empty state distinguishes its two causes

A process with no field is a process to fix. A filter with nothing left to
show is a filter to clear. The two get different words, since the action
differs.

## Risks / Trade-offs

**The mixed state is a new thing to learn.** An author who knows the
two-state badge meets a third look. The blast-radius count carries the
meaning in words, so nobody has to guess the look.

**Extending the roving model touches the grid's keyboard core.** That handler
covers cells and the checkboxes inside an activated cell. A header row is a
third case. The existing keyboard tests guard it.

**Each badge computes its own count.** `eligibleTargetEntries` already runs
once per badge, to decide whether the badge exists at all. The count reuses
that result rather than adding a second pass.

## Migration Plan

Four phases. Each leaves the tree green and each is its own commit.

1. **The badge's three states.** `bulkBadgeOn` gains a sibling returning the
   three-way reading. The write path keeps the boolean it already reads.
2. **The names and the counts.** The catalog gains its keys. The badge's title
   and accessible name carry the column or row and both numbers.
3. **The keyboard.** The badges take `tabindex="-1"` and the arrow handler
   reaches the header row.
4. **The rest.** The empty state, the toggle's pressed style, the gated
   cell's reason, the dash's contrast, and the target-size measurement.

Rollback is per phase. No phase leaves the matrix unusable: the worst case
restores today's behavior, where the badge reads two states.

## Open Questions

- The tab badge for this screen counts open findings while its neighbours
  count entities. The critique named it. It belongs to the tab row rather
  than to the matrix, so it is out of scope here and unowned.
- The grid squeezes rather than scrolls below about 900 pixels. A machine name
  can then split mid-token. That is a layout question for the grid's own width
  model. It needs a decision this change does not carry.
