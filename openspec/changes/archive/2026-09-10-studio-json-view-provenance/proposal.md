## Why

`openspec/specs/studio-json-view/spec.md` opens with a Purpose paragraph that
names three things the tree no longer has under those names.

`packages/editor/src/draft/load-guard.ts` sits at
`packages/web/src/areas/studio/draft/load-guard.ts` today. The file survived
the move of the editor package into `packages/web`. Only the spec's path did
not follow. `ProcessHeader` is `ProcessHeaderBar`
(`packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx`). The glossary
retired the panels screen and names the ten tab bodies together "the
structure surface".

The 2026-09-09 documentation audit found the first and called it cosmetic.
Verification found the other two in the same paragraph. Correcting one name
and leaving two would leave the paragraph half true, so this change corrects
all three.

## What Changes

- The Purpose paragraph names the guard's real path, `ProcessHeaderBar`, and
  the structure surface.
- No `SHALL` clause changes. No scenario changes. Two scenarios still say
  "Panels", at `:79` and `:134`; `design.md` says why they stay.

## Capabilities

### Modified Capabilities

None. Every line this change touches is narrative prose in the Purpose
section, so `.openspec.yaml` carries `skip_specs: true`. That follows the
test the archived `2026-09-10-doc-drift-sweep` change applied to the same
class of work.

## Impact

- One file: `openspec/specs/studio-json-view/spec.md`.
- That file carries an armed prose ratchet. It exits 1 at the linter with 40
  findings today. Every printed line counts, and the tip must not exceed 40.
- No code, no test, no other document. One other file names the old path:
  the archived `studio-json-view` change (`design.md:28,139,216`,
  `tasks.md:3`). `docs/current-state.md:2327-2330` still says "Canvas and
  Panels" and `ProcessHeader` in its account of that change and names the
  guard's new path at `:2343`. Both record history and stay as they are.
