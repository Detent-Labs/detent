## Context

See `proposal.md` for the motivation. Three facts about today's code shape the
approach.

The panels screen is already a sub-state of the `edit` route, not a sibling
screen. The screen component renders the panels screen for a route carrying a
panel name. It renders the form editor for a route carrying a step id. So the
tab row formalizes a nesting that already stands.

The panels screen keeps all six of its views mounted at once and hides five.
The live spec states the reason. A view keeps its own half-typed values across
a switch, an outcome name among them. Unmounting would lose them.

The plain-language layer is half-built. Field kinds already read through
`fieldKindLabel`. That function reads the catalog on every call, so a
deployment override reaches the word. Comparison operators already read as
words through `OP_WORDS`. Path triggers, the "Only when" heading and the CEL
disclosure all stand.

What still speaks the contract is a short list. It holds the performed-by
control, the terminal badge, the assignment strategy, the ISO-8601 timer and
the raw subprocess id.

## Goals / Non-Goals

**Goals:**

- One surface component owns the tab row, the ten bodies and the routing.
- Every section body the configuration pane holds today survives, reparented.
- The vocabulary layer follows the pattern `fieldKindLabel` already sets.
- No shell change. The studio passes its own controls through the `nav` prop.

**Non-Goals:**

- No new canvas gesture, and no gesture taken away.
- No token change. The design's own accent does not arrive here.
- No engine change, no HTTP change, no definition contract change.
- No rename inside the draft model. `performedBy` keeps its name in
  `draft/performedBy.ts`, and `guard` keeps its name in the condition input.
  Only the words those two controls print change.
- No change to how a field matrix cell works. Its three flag checkboxes stay.

## Decisions

### One surface component, not a tab row on each of two screens

`EditScreen` and `PanelsScreen` collapse into one component that owns the tab
row and picks a body. The alternative was a tab row on each screen, with the
two screens kept. That keeps the boundary this change exists to remove, and it
leaves two places to hold the same tab list.

### Every tab body stays mounted, and nine hide

The panels screen's own rule carries over to all ten tabs. A body keeps its
half-typed values across a tab switch. Mounting only the open tab was the
alternative. It loses those values on every switch.

The field matrix is the heavy body. It already pays this cost among the six,
so the cost does not rise with the move.

### The step page reparents the section bodies it does not rewrite

The configuration pane's sections are already separate components with tested
logic. The step page drops the collapse chrome and the runtime ordering, then
lays the same bodies in two columns. Rewriting each section was the
alternative, and it throws away logic that already passes its tests.

The runtime order goes because a two-column layout cannot carry it. Runtime
order reads down one column. An author reading two columns reads neither
order, so the page groups by subject instead.

### The vocabulary layer is a function per concept, never a record

Each concept gets a function that reads `t()` on every call, the way
`fieldKindLabel` does. A record built at module load freezes the words before
the override store answers, so `ui-string-overrides` would never reach them.
The existing module documents that reason, and this layer inherits it.

A registered strategy the curated table does not name falls back to its
registry type in the mono face. That mirrors `fieldKindWord`'s own fallback
for a triple the curated table misses.

### The old panel routes map onto their tabs

`edit/panels/:view` maps onto `edit/:tab` for all six view names. Nothing is
deployed, so no bookmark is at risk outside a session. The mapping still costs
one lookup table and keeps an open tab alive across the change.

### Styles compile, and the tokens stay the repo's

Every new component authors typed style objects, per `web-styling`. They read
their tokens from `packages/form-ui/src/tokens.stylex.ts`. Under
`areas/studio` 34 files already import that token module. A 35th file imports
the StyleX package alone and reads no token. Those are two counts of two
different things, so neither one stands for the other.

The design's inline styles are a reference, never a paste. The design's accent
`#ec3013` does not arrive here. The repo's `--stamp-600` is the same hue,
darkened to clear 4.5:1 at the sizes this accent takes. Archivo stays
deferred, per `docs/decisions.md`.

### The area nav carries one Checks control for every tab

Today two collapsed summaries exist, one in the ribbon bar and one docked on
the panels screen. Both sites go. One control in the area nav stands on every
tab, and pressing it opens the Checks tab. A per-tab dock was the alternative,
and it puts the same fact in ten places.

### The step page weights its leading column and rules the gutter

The two columns do not divide evenly. The leading column takes about three
fifths of the page. It carries Path to and Assignment, the pair an author
reads first and changes most. Each of those holds a list plus a control under
it. The trailing column holds four narrower sections, so it takes the rest.

A 1px hairline stands in the gutter, the full height of the section register.
This design language carries two rule weights and no third. The 2px divider
already separates the sections down each column. The hairline is the ledger
rule, so the gutter borrows no new weight.

Even columns with no gutter rule were the alternative, and the prototype draws
them. Under horizontal rules alone the two columns read as one ragged table. A
row on the left lines up with an unrelated row on the right, and the eye joins
the two. Below 64rem the page falls to one column and the gutter rule goes.

### The form card is a bordered plate

The Forms tab lays its cards in a grid that reflows, on a 280px minimum track.
Each card takes a 1px hairline box, a zero radius and no shadow. It carries no
shadow on hover either. Its kicker, its label and its count all sit flush
left. The miniature sits on the one muted surface, inset from the card's edge.

The elevated card the grid pattern usually brings was the alternative. This
design language states that nothing floats, and that no surface pretends to be
a card. A shadow here would mark the Forms tab as the one screen that left the
page.

An empty form marks itself with a 2px accent box in place of the hairline.
That box carries the advisory color the spec already names. The border weight
carries the whole difference, so the card needs no fill and no tint.

## Risks / Trade-offs

**The canvas and the step page no longer stand together.**

The ribbon carried both at once. A press on a node selects that step. The
author stays on the canvas, so a shift-click can still build a set. Enter on a
focused node opens the Steps tab on it. The tab holds whatever the canvas last
selected. The steps rail keeps the graph order.

**Ten tabs overflow a narrow window.**

The row scrolls sideways on its own. It never wraps, and it keeps one line.

**Two columns are too narrow under 64rem.**

The step page falls to one column at the breakpoint the bench already uses.

**A wide reword breaks a test asserting on a literal string.**

The catalog keys carry the words. A test asserts on a key's value instead.

**The step page is one large component.**

Each section stays its own component. The page holds the layout alone.

## Migration Plan

Four phases, each one green before the next starts.

1. The vocabulary layer, on today's screens. It ships alone and is visible at
   once.
2. The surface component and the tab row, wrapping today's bodies. The canvas
   becomes a tab and the panels views become tabs.
3. The step page and the steps rail, replacing the bench.
4. The Forms tab and the form editor's participant preview.

Rollback is per phase. Phase 1 is a catalog revert. Phases 2 to 4 each land
behind their own commit, and no phase leaves the studio unusable.

## Open Questions

**Does the JSON surface belong in the address?**

Every tab stands in the address at `edit/:tab`. The JSON surface does not.
Today `EditScreen` holds it in local component state, on line 311. A reload
therefore drops it, and the Canvas tab opens in its place. An author who
bookmarks the JSON surface gets Canvas back.

Settling this question changes no requirement, which is what makes it
deferrable. The overflow menu already opens the surface, and `studio-json-view`
states no address for it. Either answer leaves both specs as they stand. So the
question waits until somebody asks for the bookmark.
