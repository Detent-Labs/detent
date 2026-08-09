## Context

`docs/browser-checks.md` records manual checks in one format. Each entry
carries a `###` heading, a `Source: <change-name> taskN.N` line, and repro
steps. It also carries a pass condition, and a note on why `bun:test`
cannot see the defect. Every existing entry follows it. See proposal.md
for why this entry is missing. See proposal.md too for what it must
cover.

## Goals / Non-Goals

**Goals:**
- Add one entry to `docs/browser-checks.md`, in the file's existing format,
  for the canvas's auto-centering-on-open behavior.

**Non-Goals:**
- No code change. The fix already shipped outside this change.
- No spec-requirement change. `openspec/specs/studio-canvas/spec.md`
  already reads correctly.

## Decisions

Place the new section directly after "Studio canvas: 'Fit to view' frames
every step" in `docs/browser-checks.md`. Both cover the same `CanvasView`
component and the same `studio-canvas-fit.test.ts` blind spot. Keeping them
adjacent reads as one family of checks, not two unrelated ones.

Cite `Source: canvas-autofit-browser-check task 1.1`, matching every other
entry's `Source: <change-name> taskN.N` line. The alternative, an entry with
no `Source:` line, would break the one pattern this file has held without
exception.

## Risks / Trade-offs

The entry documents a check performed once, this session, not an automated
gate. A future change to `CanvasView`'s Panzoom construction could
reintroduce the race with no test to catch it. Mitigation: the entry names
the exact mechanism, Panzoom's own deferred `pan(startX, startY)` call. A
future reader who breaks it again has the diagnosis on hand, not just a
screenshot.

## Migration Plan

None. This is a documentation-only addition with no deploy step.

## Open Questions

None.
