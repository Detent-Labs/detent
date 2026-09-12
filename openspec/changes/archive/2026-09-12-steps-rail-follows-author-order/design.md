## Context

See proposal.md for the motivation. Three facts shape the approach.

The order helper derives the rail's order from the path graph. Three call sites
read it. They are the rail's row list, the process surface's `railOrder`, and
the Forms tab's card rows. That same list feeds the rail's current mark, the
walk's two ends and the step page's fallback step. All four surfaces therefore
move together.

The draft's own `workflow.steps` order is already visible elsewhere. The
engine's reporting queries order their per-step rows by it, in
`src/engine/reporting.ts`'s `orderOf`. The canvas's entry focus falls back to
the first reachable step in it. The serialized definition prints it. An author
who presses a move control writes that order today.

`packages/web/tsconfig.json` sets `noUnusedLocals` and includes its own `test`
directory. `bun run typecheck` reaches it through the workspace filter script.
A dropped call site therefore leaves no import behind.

## Goals / Non-Goals

**Goals:**

- One order across the rail, the walk, the Forms cards and the file.
- A move control that moves its row where an author sees it.
- One ordering left in the studio, with the helper retired.

**Non-Goals:**

- Layout, spacing and colour in the rail. Nothing there changes.
- A sort control offering both orders. The owner weighed that variant and
  refused the state it adds.
- The five other rail findings in `docs/decisions.md`. RAIL-1 alone closes
  here.
- The reachability set. The canvas bar's report reads it, and it stays.
- `docs/roadmap-history.md` records what stage 62 shipped, so its reachability
  sentence stays as written.

## Decisions

**The rail reads the draft's array directly.** No helper stands in between. The
alternative was a wrapper returning that same array. A wrapper states no rule
of its own. A later reader would ask what it decides.

**One list serves the rail and the walk.** The process surface builds it once
and hands it on. The current mark, the walk's two ends and the fallback step
follow the rail. Letting the walk keep the graph order would put Next on a
different step than the row below.

**The Forms cards keep following the rail.** Their row builder orders by the
same list. The spec already pins the cards to the rail's order. The card order
therefore moves with the rail rather than against it.

**The order helper goes and the reachability set stays.** The first loses every
consumer. The second keeps one, the canvas bar's reachability report. Its test
file keeps the `reachableStepIds` block, with that block's first case narrowed.
The comparison against the order helper's terminal group goes with the helper.

**The order requirement owns the move control's effect.** The reorder
requirement keeps the controls' presence and their two disabled ends. Where a
press lands is an ordering fact, so it stands with the order.

**Two deltas remove and add instead.** The old walk gives one scenario its
name. The validator matches scenario names character for character, in strict
mode. The other requirement names the walk in its own header. A REMOVED plus
ADDED pair states both changes cleanly.

**The canvas bar's requirement takes a MODIFIED block.** Its header names no
order. The delta keeps that header and rewrites one sentence. Its sibling in
the same capability names the walk in its header, which a MODIFIED block cannot
reword.

**The move control's press is a browser check.** This package ships no DOM test
library, and `renderToStaticMarkup` fires no event. The unit cases assert what
the rail renders: both controls per row, and the two disabled ends. The press
and its effect run in the browser check `docs/browser-checks.md` holds.

**The mockup replaces the shape step.** No layout changes, so that step has
nothing to decide. The owner picked the behaviour from four rendered variants.
That page is the decision record. The detector still runs after every write
under `packages/web`. The critique and the audit still run at the browser
check.

## Risks / Trade-offs

**A draft whose paths come last reads in creation order.** An author may add
ten steps before drawing a path. The rail then shows them in the order the
author added them. Mitigation: the move controls work, so one sort sticks.

**The rail's number changes meaning.** It named distance from the start step.
It now names a place in the definition. Mitigation: the spec states the new
meaning, and `docs/current-state.md` follows here. The flow reading stays one
tab away, on the canvas.

**A new delta file starts its prose count at zero.** Every antislop finding in
these files reads as a rise. Mitigation: measure each file before its commit.

## Migration Plan

No data migrates. No definition, no stored row and no route changes. A
published version and a running instance read exactly as before. The change
ships with the next web build. A rollback is a revert of its commit range.

## Open Questions

None.
