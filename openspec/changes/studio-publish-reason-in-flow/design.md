## Context

See `proposal.md`, section Why. Commit `9657ac72` built the out-of-flow
placement for the permission reason. The change `studio-checks-signal-reach`
(archived 2026-09-09) put the blocked reason in the same span.

The owner reported the placement on a screenshot of the blocked case. A
first try hid the blocked reason and left the permission reason where it was.
An Impeccable critique measured that result and refuted the premise under it.
This document records the refutation, because it is the reason the placement
moved instead.

That premise counted three signals carrying the blocked fact to the eye. Only
one does. The `draftIncomplete` banner renders on `!validation.zodValid`
(`EditScreen.tsx:772`), while `blocked` is `checksDotState(...) === "blocker"`
(`ProcessHeaderBar.tsx:695`). A CEL blocker leaves the body Zod-valid, so the
banner never renders for it. The confirmation dialog states the fact after
the click, which is the moment the pre-click reason exists to precede.

That leaves the Checks tab count. Its row is `flexWrap: nowrap` with
`overflowX: auto`, and Checks is the tenth of ten tabs. Measured at a 900px
viewport: the row's scroll width is 933 against 876 of client width. The
count's right edge at 945 sits past the row's own at 888. Below roughly 957px
the one remaining signal is off screen.

## Goals / Non-Goals

**Goals:**

- The reason reads on the header bar's own row, beside the state it explains.
- The header bar's 2px bottom border stays whole.
- No control moves, at any width, in either reason state.
- Both reasons share one place and one register, and part on tone alone.

**Non-Goals:**

- A new register, size or color for either reason. Both keep the 11px
  uppercase label treatment they have.
- The catalog strings. Naming the repair in the text ("see Checks") is a
  copy change with its own worth. It is not this change's subject.
- The action cluster's own composition. The accent spent twice in it, and the
  bare `⋮` icon, both predate this change and both stay.

## Decisions

### 1. In flow, as the action cluster's own leading item

The out-of-flow placement existed to keep Publish still. That constraint is
real and it stays satisfied, by a cheaper mechanism.

The cluster carries `marginLeft: auto`, which pins its trailing edge to the
row's. Content added at its head therefore grows the cluster leftward into
free space the margin was spending. Every control in it holds its place.

The 167px shift the old comment records came from a line placed BESIDE the
cluster. There the line eats the same free space, and the whole cluster moves
by the line's own width.

Measured on the implemented result, across thirteen widths from 1440 to 375,
in both reason states. Publish holds its right edge 69px from the viewport's,
at every one of them.

**Alternative considered:** place the line ahead of the cluster and move the
auto-margin onto it. Built first, then measured and rejected. It holds while
both land on one flex line. When the row wraps, the cluster has no margin
left. It then strands at the row's leading edge, and Publish moved from
x 1129 to x 191. Nine of thirteen widths broke, 1200 through 375.

**Alternative considered:** hide the blocked reason and keep the permission
reason where it is. Rejected on the measurements in Context. It removes the
only pre-click signal, and below 957px it leaves the screen stating nothing.

**Alternative considered:** move the reason to `EditScreen.tsx`'s
`draftIncomplete` banner. Rejected. It parts the text from the control it
describes, and that banner answers a different condition.

### 2. The gate's wrapper goes, and `aria-describedby` carries the binding

`PublishNavControl` wrapped its button and the reason in a `role="group"`
with `position: relative`. The relative position anchored the absolute span,
and the group named the pair as one concept.

Neither survives the move. The reason renders elsewhere in the row, so the
wrapper would hold one child and anchor nothing. A screen reader announces an
unnamed `role="group"` as a boundary with no name. That is noise rather than
structure.

The binding was never positional. An `aria-describedby` is an id reference,
and `PUBLISH_REASON_ID` is the one constant both sides read. So the control
returns its button alone, and `PublishReasonLine` renders the reason from its
own place in the row.

**Alternative considered:** keep the wrapper and return a fragment from
`PublishNavControl`. Rejected. A fragment's children land where the component
sits, which is between Discard draft and Publish. The reason belongs at the
cluster's head, ahead of every control it speaks for.

### 3. Both components read `publishAvailability` themselves

The control and the line each call `publishAvailability(canPublish, blocked)`.
Nothing else reads the gate.

The function is pure over two booleans the header bar already holds. A
threaded prop would let the button's reason and the line's reason drift. The
id reference between them only works while they agree.

## Risks / Trade-offs

**The header row gains a ninth item.** → It carries eight status items
before the actions already. The row wraps cleanly at 900px and at 500px, with
the reason rendered.

**The reason's `whiteSpace: nowrap` has no reflow.** → It held a fixed right
anchor before, under the same nowrap. In flow it belongs to a wrapping row
instead. A longer string wraps that row rather than running off its edge. An
overridden UI string is the case that makes this reachable.

**A test read the reason out of the control's markup.** → Those cases
render both components now. They compare across the two. One case asserts the
id reference between them. The split cannot silently break the binding.

## Migration Plan

Nothing to migrate. The change edits rendering alone. It writes no state and
reads no stored row. The change leaves `ProcessBody`, `definitionHash` and
every pinned instance untouched.

Rollback is the revert of one commit. A stale browser tab keeps the old
placement until its next load, and the text it shows stays true.

## Open Questions

None. The placement was the change's whole subject, and the owner decided it
against two rendered screens and the measurements above.
