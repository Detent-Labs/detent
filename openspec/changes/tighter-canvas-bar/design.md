## Context

`packages/web/src/areas/studio/canvas/CanvasBar.tsx` renders the canvas bar.
Three facts in it drive this change.

- The bar's style sets `minHeight: BAR_MIN_HEIGHT`, which is 5.5rem. Its
  comment names the tallest child: the group name field, whose label floats
  above the input. The spec scenario "The bar holds its height
  across a selection" keeps that height fixed.
- `MENU_KINDS` lists `task`, `subprocess` and `end`. Its comment argues that
  the menu names all three kinds, so no kind reaches the author through the
  shortcut alone. The base requirement says the menu lists all three kinds.
  Its own scenario's title reads "The menu holds the other two kinds".
- One condition, `selectedStepIds.length > 1`, gates the count, the Remove
  control and the group controls together.

The numbers come from `tokens.css` and `global.css`. A `.btn` sets 14px text
at a 1.5 line height, 8px block padding and a 1px border. That makes it 39px
tall.

The bar adds 8px of padding above and below, plus a 1px hairline under it. The process surface puts a 12px gap between the tab row and the bar. The
bar therefore stands 88px tall, with 36px from the tab row to Add step and
24px below it. The walk in `docs/browser-checks.md` records the 88px as
measured.

The function `EditScreen.deleteSelection` already takes a set of any size out
of the draft. It moves `workflow.initialStep` to the first remaining step
when the set held it.

## Shape brief

`/impeccable shape` ran on the canvas bar. The discovery came from the
owner's screenshots and a mockup of three heights, both on 2026-09-11.

- **Job.** An author edits a process graph. The bar holds the add controls and
  the selection's own actions. It should cost the canvas as little height as
  it can.
- **Outcome.** The canvas starts one control row under the tab row. A single
  selected step leaves the draft from the canvas.
- **Direction.** The bar stays a ruled register row, flush left, with a
  hairline under it. The one departure is the group name's label, beside its
  input.
- **States.** Nothing selected, one step reached or unconnected, several
  steps, and a set matching one group. Each measures 56px.
- **Boundaries.** No new control and no new color. The steps rail's foot, the
  step page and the menu's disclosure behaviour stay as they are.

## Goals / Non-Goals

**Goals:**

- The bar stands one control row tall in every selection state.
- The caret menu lists only the two kinds Add step does not add.
- One selected step shows the Remove control.

**Non-Goals:**

- Moving the group controls or the count to a single selected step. A count
  of one says nothing, and a group of one step draws no box.
- A confirmation before Remove. The multi-step control and the step page's
  own control commit at once today.
- Changing the steps rail's foot, which keeps its three add controls.

## Decisions

### One control row, with the label beside the field

The bar drops `BAR_MIN_HEIGHT` and its `minHeight`. Add step stands in every
state, so the row never falls under one control's height. The group name
field becomes a flex row: the label, 8px of gap, then the input. The label
keeps its 11px uppercase slate style and loses its absolute position.

The input takes the button's type: 14px at a 1.5 line height. Otherwise it
inherits the body's 15px at the platform's normal line height. That could
draw it taller than 39px on some system font and grow the group state.

The owner chose this on 2026-09-11 from the mockup. `DESIGN.md` states "Label
above control" for fields. A field inside a toolbar row becomes the one
exception, in `DESIGN.md` and in `.claude/rules/design-language.md` alike.

Considered: a 72px bar that keeps the label above. It keeps the rule. It saves
only 16px, though, and leaves the label about 1px of clearance.

### The menu lists the other two kinds

`MENU_KINDS` holds `subprocess` and `end`. Add step stays the press and drag
source for a step someone works. The drag ghost still names that kind.

Considered: keeping all three, as the old comment argued. That argument
concerned discoverability. The Add step label and the steps rail's foot
already cover it. The owner flagged the duplicate entry.

### The Remove control shows for one selected step

The Remove control renders while the selection holds one step or more, and
calls the same `onDeleteSelection`. The count and the group controls keep
their more-than-one condition.

One step reads a new `canvas.selectionRemoveOne` key, "Remove step". Several
keep `canvas.selectionRemove`, "Remove steps". Two keys follow the design
language's rule that each label gets one key, never an assembled plural.

Considered: one neutral "Remove" label for every size. It would drop the
number the label carries today.

### Markup in a test, layout in the walk

`studio-canvasBar.test.tsx` already renders the bar to static markup. It pins
the menu's two entries and the Remove label per selection size. Height and
label position are layout, which static markup cannot compute. The browser
walk measures them, per `development-toolchain`'s "A browser check lands as an
assertion or as a checklist entry".

## Risks / Trade-offs

- [A system font draws the input taller than a button] → The input takes the
  button's 14px type and 1.5 line height. The walk measures the group state.
- [The group state's row grows about 90px wider] → The bar already scrolls
  sideways in a narrow window. The walk checks one narrow window.
- [A single step leaves the draft on one press] → The step page's own control
  acts the same way today. So does the multi-step control. The checks rail
  reports any path left pointing at the step.
- [The full design reference lives in `tmp/`, which git does not track] → This
  change cannot carry `tmp/Detent Design Language.dc.html`. The finish message
  names it for the owner.

## Migration Plan

Nothing migrates. The change touches no data and no definition contract. The
next build ships it, and a rollback reverts its commits.

## Open Questions

None.
