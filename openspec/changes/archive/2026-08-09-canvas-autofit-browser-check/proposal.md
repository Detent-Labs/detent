## Why

`openspec/specs/studio-canvas/spec.md` already carries "The canvas centers
the graph automatically the first time a draft's steps render." The shipped
implementation violated it. Panzoom's own constructor defers
`pan(startX, startY)` to a `setTimeout` with a default of `(0, 0)`. That
raced the auto-fit effect's synchronous pan and silently reset the graph to
the top-left corner one tick after mount.

Fixed in `packages/web/src/areas/studio/canvas/CanvasView.tsx`. It now
computes the fit before constructing `Panzoom` and passes it as
`startScale`/`startX`/`startY`. The deferred call then lands on the same
values already showing, instead of racing them. Typechecked, full-suite
tested, and reproduced then re-verified in a real browser.

That fix carries no requirement-text change. The spec already described the
correct behavior. Only the implementation was wrong.

But the defect shipped with no manual browser-check entry on record. A
`bun:test` assertion cannot observe this requirement. It needs a real
Panzoom instance racing its own internal timer against real
`getBBox()`/`clientWidth`, and `packages/web/test/` assumes no DOM at all.
`development-toolchain`'s "A browser check lands as an assertion or as a
checklist entry" requirement names `docs/browser-checks.md` for this class
of check. Recording it closes the gap that let this regression through
unnoticed.

## What Changes

- Add a `docs/browser-checks.md` entry for "the canvas centers on open, with
  no author action." Name the repro steps, the pass condition, and why
  `studio-canvas-fit.test.ts` cannot see this defect.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. No requirement text changes. The `studio-canvas` requirement this
check verifies already reads correctly. This change only records a manual
verification step. `.openspec.yaml` sets `skip_specs: true`.

## Impact

- `docs/browser-checks.md`: one new section.
- No code, schema, or spec-requirement changes. The code fix this check
  verifies already shipped as a trivial one-file fix outside this change.
