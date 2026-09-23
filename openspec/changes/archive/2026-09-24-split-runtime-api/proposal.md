# Proposal

## Why

`src/runtime/api.ts` holds 2,789 lines and 76 exports on 2026-09-23. It is the
largest source file in the repository. The 2026-08-18 code review recorded it
as ARCH-1 at 2,673 lines, and the file has grown since. A reviewer who reads
one operation must carry the whole file. Two agents that change it at the same
time contend for one file. The review names the fix: split the file into
sibling modules and keep `api.ts` as the one import surface.

## What Changes

- Move the body of `src/runtime/api.ts` into sibling modules under
  `src/runtime/`, one module per domain: shared internals, field resolution
  and submission checks, the instance lifecycle, claims, queries, reports, the
  instance record, visibility, comments and attachments.
- Keep `src/runtime/api.ts` as a re-export barrel. It exports the same value
  and type names as before, and it has no function body. None of the 24 files
  that import it change.
- Move code without a change to it. No signature, error, message or SQL
  statement changes.
- Add one sentence to the Purpose of `openspec/specs/runtime-api/spec.md`. It
  states that a spec citation of `src/runtime/api.ts` names the layer as a
  whole. Nine spec citations then stay true without a requirement delta.
- Sweep `docs/current-state.md`, `docs/decisions.md` and `CLAUDE.md` for
  passages that name a moved symbol by file or by line number. Close ARCH-1 in
  `docs/decisions.md`.

Out of scope: `CanvasView.tsx`, `FormEditorScreen.tsx`, `store.ts`,
`compile.ts` and `src/schema/definition.ts`. A file-size limit stays a habit
and gets no gate.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. No behavior changes, so the change sets `skip_specs: true`. The one spec
change is to the `runtime-api` Purpose section, which a delta cannot carry.

## Impact

- Code: `src/runtime/api.ts` and about ten new files beside it. No import site
  changes.
- APIs: none. The HTTP surface, `docs/openapi.yaml` and the package exports
  map stay the same. The exports map does not publish `src/runtime/`.
- Tests: none change. The full `bun test` run with `DATABASE_URL` set is the
  evidence that behavior did not move.
- Docs: `docs/current-state.md`, `docs/decisions.md`, `CLAUDE.md`,
  `README.md`, `ROADMAP.md`, `docs/roadmap-history.md` and the `runtime-api`
  spec Purpose.
