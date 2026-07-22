## Why

The editor's "Load draft" is intentionally strict: it round-trips only
previously-saved `.draft.json` files and (as of the load-guard fix in this
session) correctly rejects anything shaped differently, per the
`editor-draft-io` spec's "not shaped like a process body at all" scenario.
That strictness means an author cannot open an existing, real process —
`examples/expense-approval.json`, or any file exported from the engine's
definition store — for editing: those are published `DefinitionVersion`
wrappers (`{ processId, version, definitionHash, status, ..., definition:
{...} }`), a different shape than a Draft, and the load guard now correctly
refuses them instead of silently producing a blank editor. There is
currently no supported path from "an existing process" to "an editable
Draft" at all.

## What Changes

- Add an **Import process** action to the editor's File panel, alongside
  Save/Load draft and Export, that accepts either a published
  `DefinitionVersion` wrapper (unwraps `.definition`) or a raw `ProcessBody`
  and converts it into a Draft loaded into the workspace.
- Reuse the existing unwrap pattern already used for subprocess-child files
  (`parseChildProcessJson` in `packages/editor/src/draft/io.ts`), which
  parses through the real `processBody` Zod schema rather than the relaxed
  load-guard, so an imported file is validated strictly at the boundary.
- The imported Draft is a plain in-memory Draft from that point on — no
  provenance (source file, prior `processId`/`version`/`definitionHash`) is
  retained; a subsequent Export produces a fresh, unpublished
  `AuthoredProcessBody`. Re-publishing under the same `processId` remains an
  explicit, separate, engine-side action outside the editor.
- No change to "Load draft" — it keeps its current strict, Draft-only
  contract and error behavior.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `editor-draft-io`: adds an Import requirement — accepting a
  `DefinitionVersion`-wrapped or raw `ProcessBody` file and converting it to
  a Draft — distinct from the existing strict Draft load/save requirement.

## Impact

- `packages/editor/src/draft/file-io.ts`: new `importProcessFile` (or
  similar) alongside `loadDraftFromFile`/`loadDraftViaPicker`.
- `packages/editor/src/draft/io.ts`: reuses/extends
  `parseChildProcessJson`'s unwrap-and-validate logic as the import parser.
- `packages/editor/src/panels/FileToolbar.tsx`: new "Import process" button
  and (non-FileSystemAccess) file input, wired to `replace()`.
- `packages/editor/src/i18n/catalog.ts`: new locale strings for the action,
  its file-picker description, and its error path.
- Test: `packages/editor/test/file-io.test.ts` gains import coverage
  (wrapped file, raw-body file, and a genuinely invalid file still
  rejected).
- No engine (`src/`) changes; no schema changes.
