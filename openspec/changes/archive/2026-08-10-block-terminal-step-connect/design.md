## Context

`resolveDropGesture` (`packages/web/src/areas/studio/canvas/dropGesture.ts`)
resolves a connect-handle drag release into `connect-to-step`,
`create-step-and-connect`, or `rejected`. It runs `checkConnection`
(trigger consistency) and `hitTestNode` (does the drop land on a step).
`CanvasView.tsx` calls it from `onHandlePointerUp`. On `rejected` it
calls `showRejection`, the same inline message component every other
canvas rejection already uses.

`PathsPanel.tsx`'s "add path" button (`addPath`, line 39) carries the
same gap through the inspector. It already disables when
`steps.length === 0` (line 142). It carries no `terminal` prop and no
terminal-aware condition.

`StepsPanel.tsx` renders the paths section unconditionally. Its
`sections` array always includes `"paths"`. It never suppresses that
section for a terminal step. See `proposal.md` for why both the canvas
and the inspector need the same treatment.

## Goals / Non-Goals

**Goals:**
- A drag from a terminal step's connect handle never produces a path,
  regardless of where it lands.
- The rejection reuses the existing `showRejection` inline message, so
  the terminal case reads like every other rejected gesture.
- The connect handle looks non-interactive on a terminal step before
  the drag starts.
- `PathsPanel`'s "add path" control never adds a path to a terminal
  step.

**Non-Goals:**
- No change to `src/schema/definition.ts` or any publish-time check.
  The schema already rejects this combination. This change only stops
  the studio UI from producing it.
- No change to `PathsPanel`'s remove-path or edit-path actions. Once
  "add path" carries a guard, a terminal step carries zero paths by
  construction. Those actions find nothing to operate on for that
  step.

## Decisions

**Reject inside `resolveDropGesture`, before `checkConnection` and
`hitTestNode` run.** The function gains a `sourceTerminal: boolean =
false` parameter, appended after the existing four. It returns `{
kind: "rejected", reason }` immediately when that parameter is `true`.
The default keeps every existing call untouched. The five calls in
`studio-canvas-dropGesture.test.ts` that predate this change stay
correct without editing, since they all mean a non-terminal source.
Only `CanvasView.tsx` and the new terminal-focused test cases pass
`true` explicitly.

Alternative considered: check `step.terminal` only in
`CanvasView.tsx`'s `onHandlePointerUp`, before calling
`resolveDropGesture` at all. Rejected because `dropGesture.ts` already
owns every other reason a drop can fail. `studio-canvas-dropGesture.test.ts`
also tests the function directly, without mounting the canvas. Splitting
the terminal check into the caller would leave that one rejection
reason untestable at that level.

**Let the drag gesture start and render; reject only at release.** The
connect handle keeps calling `setConnectDrag` on `pointerdown`. This
holds regardless of `step.terminal`, the same as today.

Alternative considered: skip `setConnectDrag` entirely in
`onHandlePointerDown` when the source is terminal, so no drag line ever
renders. Rejected for consistency with an existing case. A
trigger-inconsistent drag, one starting from a step whose paths are
already all-automatic, already renders the drag line. It rejects only
on release. A terminal source should not get an earlier cutoff for the
same kind of author mistake.

**Visual affordance is a CSS state on the existing handle, not a
disabled or hidden element.**

`CanvasView.tsx` adds a modifier class to the handle circle when the
step carries `terminal: true`. The class name is
`canvas-connect-handle-terminal`.

`app.css` styles that class distinctly from `.canvas-connect-handle`'s
default fill and cursor. The fill becomes `var(--color-text-muted)`,
the same token `.canvas-node-key` already uses two rules above it in
`app.css`. The cursor becomes `not-allowed`. Reusing that token, rather
than a new color value, follows a design language rule. State is a
semantic role, not an ad hoc color.

The handle stays mounted and still starts a drag, per the decision
above. Only its appearance and eventual outcome change.

**`PathsPanel` takes a `terminal` prop; `StepsPanel` passes
`step.terminal`.** `PathsPanel`'s "add path" button already disables on
`steps.length === 0` (line 142). The fix extends that same condition to
`disabled={steps.length === 0 || terminal}`, rather than introducing a
parallel mechanism.

No new test file backs this. The existing `steps.length === 0`
condition next to it carries no dedicated test either. `PathsPanel` has
no component-rendering test today.

<!-- antislop: allow passive-voice -->
`studio-canvas`'s "Canvas interaction logic is tested as pure
functions" requirement is quoted verbatim from the base spec. It names
five pure computations with `bun:test` coverage. A JSX `disabled`
attribute on an existing button is not a sixth. Introducing a
component-testing setup for one boolean condition would add
infrastructure this change does not need. This mirrors an existing
gap. It does not close it.

## Risks / Trade-offs

[A terminal step becomes non-terminal mid-drag: another panel action
sets `step.terminal` to false while a drag is in flight] → Not
reachable. The studio is single-user-per-draft on one screen.
`onHandlePointerDown` captures the pointer, so no panel action can
interleave with an in-progress drag.

[The muted handle reads as fully disabled, not just terminal-specific] →
Release still shows the inline reason. A trigger-inconsistent drag
already works this way.

## Migration Plan

None. This is a client-only behavior change in `packages/web`, shipped
with the next deploy of that bundle. No data migration, no API change,
no rollback beyond reverting the commit.

## Open Questions

None. Every decision above is final for this change.
