## Context

See proposal.md for motivation.

This file is the design of record for ROADMAP stage 36. It does not sit under
`docs/superpowers/specs/`. Git ignores that path. Stage 24 already lost a
design there.

The direction came from a `/frontend-design:frontend-design` session on
2026-08-14. That session put three directions to the user: a rail-only rework,
this routed screen, and a canvas drawer. The user took the routed screen.

What stands today. `panels/EditPanelsModal.tsx` is 170 lines. It holds one
native `<dialog>` at `min(72rem, 92vw)` by `88vh`. A 16rem rail sits on the
left, and one view fills the rest. `EditScreen.tsx` holds `openPanel` in
`useState`. An effect calls `showModal()` or `close()` as that state moves.

The three panels behind it are small. `FieldCatalogPanel` is 230 lines,
`DataSourcesPanel` 103, `ContractPanel` 111. None of them moves here.

`studio-form-editor` answered this question once already. Stage 27e took the
form editor out of a `<dialog>`. It now sits on
`/processes/:id/edit/form/:stepId`, as an optional `formStepId` on the `edit`
route.

## Goals / Non-Goals

**Goals:**

- The checks rail stays visible while an author edits what it reports on.
- A view has an address. A reload and the Back control both behave.
- One routing shape for both sub-states of the edit screen.

**Non-Goals:**

- The three panels keep their internals. The queue file sizes that on its own.
- No schema work, no API work, no engine work.
- No new capability. Three existing ones take deltas.

## Decisions

**The route carries an optional field, not a sibling route.** `Route`'s `edit`
entry gains `panel?: PanelView`, beside the `formStepId?` already there. The
path reads `/processes/:id/edit/panels/:view`.

`routing.ts` states the reason already. A form-editor path is a sub-state of
`edit`, "not a sibling top-level route". The panels screen is the same kind of
thing. A sibling route would need its own way back to the canvas, and the
`edit` route has one.

`matchRoute` tries the panels pattern before the plain edit pattern. That is
what it does for the form pattern. An unrecognized `:view` falls through to the
plain edit route, so a typo lands on the canvas.

An earlier pass reasoned to the opposite answer. Its comment sits in
`EditScreen.tsx` today. It held that a modal always opening fresh from its own
link needs no shareable link. That reasoning stands on its own.

What beats it is the checks rail. An author who cannot see the rail cannot fix
what it reports, and a screen is what frees the column. The comment goes with
the state it explains.

**The screen fills its well.** The dialog took `max-height: 88vh`. No such rule
survives the move. `.studio-canvas-layout` carries `flex: 1 1 auto` with a
`min-height` floor. The panels screen stands in the same well, so it takes the
same rule.

Item 1 shipped a whole pass because this screen did not fill vertically. Its
browser check found that a flex item with auto inline margins shrink-wraps.
That is why the browser walk reads a tall window and a short one.

**All three views stay mounted, and the screen hides two.** The roadmap fixes
this property. Its reason survives the move. `ContractPanel` holds a half-typed
outcome name in its own `useState`. `DataSourcesPanel` fetches list keys on
mount.

So the screen renders all three and toggles visibility. The modal instead wrote
`openView === "fields" && <FieldCatalogPanel />`, which mounts and unmounts.

The `hidden` attribute does the toggling. The browser keeps the subtree.
Assistive technology skips it. Neither needs CSS of ours.

The alternative was lifting each panel's state into the draft store. That
reaches three files this work otherwise leaves alone. It buys nothing `hidden`
does not.

**The checks rail renders its full grouped list.** `ChecksRail` renders that
list today, when the canvas carries no selection. The panels screen has no
selection and no inspector. It therefore takes the same state, with no new
prop.

The collapsed one-line summary stays where it is. `studio-checks-rail` ties it
to a selection taking the third column. That condition never holds here.

**The dialog chrome goes, and the promise stays.** The modal's header named the
open view. Its footer held Close, and the sentence saying Close keeps every
edit. A screen needs neither bar. The view's own heading names it, and the edit
screen's toolbar sits above.

The promise still needs stating. `studio-app` requires that leaving never read
as a cancel. It moves to a note beside the back-to-canvas control. An author
about to leave reads it there.

**Back to the canvas takes the control the studio already uses.** That is the
`btn btn-ghost studio-back` button. `FormEditorScreen` renders one. The edit
screen renders three more beside it. One back affordance beats a second shape
for the same act.

The screen spends no primary action on it. The edit screen already spends its
one primary on Publish. The browser's own Back reaches the same place through
the route.

## Risks / Trade-offs

- The canvas goes while an author edits the catalog -> `FormEditorScreen`
  already makes that trade, and the design session took it knowingly. It is
  what frees a column for the checks rail.
- A deep link names a view of a draft that fails to load -> the edit screen
  already handles that error. The panel field decides what renders once the
  draft arrives. It does not decide whether it arrives.
- Three panels mounted at once cost three renders per draft write -> they cost
  that today. The modal mounts for the life of the screen. The panels inside
  it re-render on every `useDraft()` write.
- A stale glossary term outlives the work -> `.claude/rules/ui-glossary.md`
  fixes "edit panels modal" as the one name for this thing. The term moves in
  the same commit.

## Migration Plan

No data moves, and no route breaks. `/processes/:id/edit` keeps its meaning.
The new path is additive.

A bookmark cannot go stale. No panel path existed to bookmark, because the
modal was never addressable.

Rollback is a code revert. A reverted build meeting a panels path falls through
to the plain edit match. It lands on the canvas rather than failing.

## Open Questions

- Should the three canvas-rail links mark the open view once an author returns
  from the panels screen? They mark nothing today. The modal was never a place
  one returned from. The answer changes no requirement here, since the screen's
  own rail carries `aria-current`. It is worth taking after an author has used
  the screen once.
