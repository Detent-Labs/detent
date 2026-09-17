## Context

See `proposal.md` - Why. `StepsRail.tsx` renders each step as a `<li>`. It
holds a `<button>` that selects the step and carries the current-step style,
plus two chevron `<button>`s wired to `onReorder(stepId, neighbourId)`. That
handler swaps two array positions. `EditScreen.tsx`'s `onReorderStep` finds
both steps' indices in `d.workflow.steps` and swaps them. No drag-and-drop
library ships in `packages/web` today; `packages/web/package.json` lists
none.

## Goals / Non-Goals

**Goals:**
- Reorder any step to any position in the rail with a mouse drag.
- Keep the move keyboard-operable, per `spa-accessibility`'s existing
  requirement (see `specs/studio-step-page/spec.md`).
- Reuse `design-language.md`'s existing rule and mark vocabulary for the
  drag and drop-target affordances. Add no new visual language.

**Non-Goals:**
- No cross-rail drag. Steps reorder only within their own rail.
- No multi-row drag or multi-row selection.
- No change to the entity rail, the checks rail, or any other rail's own
  reorder behavior. This change touches `StepsRail.tsx` alone.

## Decisions

### Shape pass (`/impeccable shape`)

Job and audience: a developer or author (`system:author` or
`system:developer`) reorders steps in a draft's steps rail. This is an
Operate-mode task: it rewards finishing the task over persuading anyone of
anything. Outcome: dragging a row to a new position moves that step in
`workflow.steps`. The rail's own numbering is the proof, and it updates at
once.

Selected direction: reuse the existing ruled-register language in
`.claude/rules/design-language.md`'s "Rails" passage. Add no new visual
language.

- **Drag handle, not whole-row drag.** The row's own `<button>` already
  handles click-to-select. Making the whole row draggable would fight that
  click target. A small grip affordance sits at the row's trailing edge, in
  the chevrons' old position. It carries `draggable="true"` and the row's
  `dragstart`/`dragend` handlers. It uses `GripVertical` from `lucide-react`
  at 18px with a 1.75 stroke, the icon rule already in force. It has no
  visible label. Its `aria-label` is `stepsRail.dragHandle`, read as, for
  example, "Reorder Credit check. Alt+Up or Alt+Down moves it."
- **Dragged-row state.** The five design-language rules forbid a shadow, a
  lift and a radius. The dragged row drops to 45% opacity instead, the same
  value the design language already uses for a disabled control. Here it
  reads as "this row is momentarily not where it belongs."
- **Drop-position indicator.** A 3px accent rule stands between the two rows
  nearest the pointer. It reuses the existing "3px current mark" selection
  mark, today drawn on a row's leading edge, turned horizontal between rows.
  It marks a targeted position the way the current mark marks a selected
  one. No new mark class exists. It renders as a `boxShadow`, the same
  mechanism `rowMainCurrent` already uses for its own 3px mark, never as a
  `borderWidth`. `studio-guidedSurfaceStyle.test.ts` fails the whole suite
  if any `border*Width` in `StepsRail.tsx` exceeds 2px, since that file
  scans the rail for the two structural rule weights alone.
- **Keyboard-focused row.** This state reuses the existing 2px accent focus
  ring at 2px offset, the standing focus-visible rule. The existing style
  covers it.

Scope and boundaries: only `StepsRail.tsx`'s row markup, its styles, and its
`Props` shape change. The number column, the label and the issue badge stay
as they are. New spacing uses the `space.sN` tokens `StepsRail.tsx` already
imports, never a raw pixel `gap`. `studio-guidedSurfaceStyle.test.ts` fails
on any `Gap:` value off the 4-point scale. Any border cleared on the grip or
the indicator uses the longhand `borderWidth: 0`. It never uses the
`border: "none"` shorthand StyleX drops silently; that same test bans the
literal shorthand anywhere in the file.

States and ranges: a rail of one step has nothing to reorder. The drag
handle disables there, mirroring the current chevrons' own disabled state at
the list's ends. A rail long enough to scroll relies on the browser's own
`dragover`-driven auto-scroll near the scroll container's edge. No custom
auto-scroll ships unless the browser check proves that insufficient.

### Move-to-index over adjacent-swap

`onReorderStep(stepId, neighbourId)` swaps two array positions. A drag drop
needs to place a row at an arbitrary index instead.

The array math moves into a new, pure, exported function:
`moveTo<T>(list: T[], from: number, to: number): T[]`, in
`packages/web/src/areas/studio/draft/list-ops.ts` beside the existing
`removeAt`/`updateAt`. It clamps `to` into `[0, list.length - 1]`. A
move-earlier at the first row, or a move-later at the last row, is
therefore a no-op there. That is the same boundary refusal the old
chevrons expressed as a disabled button.

<!-- antislop: allow sentence-length -->
<!-- Known linter miscount: the quoted code span's own parentheses and
     semicolon read as sentence punctuation, inflating the count around a
     single quoted line of code. -->
`EditScreen.tsx`'s handler becomes:
`mutate((d) => { if (d.workflow?.steps) d.workflow.steps =
moveTo(d.workflow.steps, from, to); })`. Reassigning `d.workflow.steps`
inside the recipe is safe. `store.tsx`'s reducer runs `structuredClone`
first, then hands the recipe the plain clone. No Immer proxy requires
in-place mutation here. `StepsRail`'s `Props` carries
`onMove(stepId: string,
toIndex: number)` in place of `onReorder`. The keyboard move-earlier and
move-later commands call that same handler, with `currentIndex - 1` and
`currentIndex + 1`. Drag and keyboard drive one code path.

Extracting `moveTo` as a pure function is what makes it unit-testable. The
array math would otherwise sit inline in `EditScreen.tsx`'s closure. This
repository ships no DOM test library.
`studio-draftProvider-chainingFetch.test.ts` confirms that. A `bun:test`
cannot invoke an unexported closure through a rendered interaction.
`moveTo` does not need a DOM: it is a plain array function.

**Alternative considered:** keep `onReorder`'s pairwise-swap shape. Drive
the keyboard fallback from it by treating a drag drop as a sequence of
adjacent swaps. Rejected. A drag from row 1 to row 8 would take seven
swaps. Each one steps visibly through the position in between, instead of
landing at row 8 in one move. Nothing in the domain needs a swap primitive
once move-to-index exists.

### Native HTML5 drag-and-drop over a library

`dragstart`, `dragover` and `drop` on the grip and the `<li>` cover this.
Native browser events pick up a row and track the pointer's row-relative
position, to place the drop indicator. A native `drop` event then reorders
the list. Ponytail's ladder in `CLAUDE.md` puts a native platform feature
ahead of a dependency.
No drag-and-drop library ships in `packages/web` today. This interaction
reorders within one list, with no nesting and no cross-list drag: exactly
what native HTML5 drag-and-drop covers.

**Alternative considered:** `@dnd-kit/core`. Rejected for this scope. It
would become the package's first drag-and-drop dependency, for a single
list that never nests, crosses containers, or virtualizes. Revisit only if
native drag fights the keyboard fallback or the rail's own scroll container
in the browser check.

### Keyboard fallback: a command on the grip, no second visible control

The user's own instruction removes the chevrons themselves: "Die Pfeile zum
verschieben brauchen wir nicht." The keyboard route instead lives on the
grip handle already on the row. A `keydown` handler on the grip answers
`Alt+ArrowUp` and `Alt+ArrowDown`. It calls the same move-to-index handler
the drop uses. It keeps focus on the moved row's grip. It also updates a
visually-hidden `aria-live="polite"` region, naming the row's label and its
new position. This satisfies `spa-accessibility`'s own requirement: the
moving entry keeps keyboard focus, and each move announces its result.

**Alternative considered:** a Home/End-anchored ARIA "reorderable listbox"
pattern. It would give the whole rail a roving `tabindex`, with arrow keys
carrying no modifier. Rejected as more machinery than this list needs. The
rail is already a sequence of independent buttons in the page's own tab
order. A roving-tabindex listbox changes how an author reaches every row,
beyond changing how one row moves. A modifier-gated command on the existing
focusable grip gives the same guarantee with the smaller change.

### Test split: `bun:test` for statics, `docs/browser-checks.md` for interaction

`moveTo`'s array math is the only part of this change a `bun:test` can
observe with no browser, per `development-toolchain`'s split rule. A
`renderToStaticMarkup` assertion can also confirm the grip renders with its
`aria-label`, and that the live region exists with `aria-live="polite"` in
the static markup, the same way `studio-stepsRail.test.tsx` already asserts
the rail's other static structure. Everything else this change adds is a
real browser vendor's own event: a drag landing at an arbitrary index,
`Alt+ArrowUp`/`Alt+ArrowDown` firing and refusing at a boundary, focus
following a move, and the live region's text updating after it. No browser
can observe any of that without running, and this repository ships no DOM
test library. Those checks go into `docs/browser-checks.md` instead, naming
this change.

### Existing test coverage this change must fix

`packages/web/test/studio-stepsRail.test.tsx` renders `StepsRail` with
`onReorder={() => {}}`, and carries a `describe` block asserting the exact
`aria-label="Move earlier"`/`"Move later"` buttons this change deletes.
Both break once `Props` renames to `onMove` and the chevrons disappear.
This same change fixes the file; Verification is the wrong place to
discover that.

## Risks / Trade-offs

- [Native `dragstart` and `dragover` fire no accessible-name announcement of
  their own, unlike a library's built-in live region.] The change ships its
  own live region for both the drag and the keyboard path. Neither route
  depends on native drag's own accessibility layer, since it has none.
- [A grip small enough not to widen the row could miss the 24x24 CSS pixel
  pointer-target spacing `spa-accessibility` requires.] Size the grip's hit
  area to at least 24x24 with padding, independent of the 18px icon inside
  it. That is the same pattern the icon-plus-padding controls elsewhere in
  the rail already use.
- [A browser's default drag-and-drop ghost image looks inconsistent across
  Chrome, Safari and Firefox, the three browsers the project supports.] Set
  a custom `setDragImage` of the row itself. Keep the browser default
  instead if it reads acceptably in the browser check. A custom ghost image
  is not worth building on spec.

## Migration Plan

This changes only `packages/web`'s own component code and its catalog
strings. No data migration applies. Deploying the built bundle is the whole
rollout. Rollback means reverting the commit. No draft or published process
definition changes shape.

## Open Questions

None. The shape, the reorder semantics and the implementation approach are
all decided above.
