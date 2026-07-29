<!-- antislop: allow-file all -->

## REMOVED Requirements

### Requirement: Draft can be saved to and loaded from a file

**Reason**: `packages/editor` is deleted. File-based draft persistence has no
counterpart in `packages/studio` by design — the `process-drafts` capability
(server-persisted drafts, already shipped in `studio-shell-and-drafts`) is
the replacement mechanism, not a like-for-like file-based one.

**Migration**: Use the `process-drafts` capability's `GET`/`PUT
/drafts/:processId` routes.

### Requirement: An existing process file can be imported as an editable Draft

**Reason**: `packages/editor` is deleted along with its file-based import
path.

**Migration**: None. `process-drafts` has no file-import operation; a
process authored outside Studio has no supported migration path into a
draft today, unchanged from before this deletion.

### Requirement: Export produces a validated authored ProcessBody

**Reason**: `packages/editor` is deleted along with its file-export path.

**Migration**: Publishing through `process-drafts`'s
`POST /drafts/:processId/publish` already produces a validated,
`authoredProcessBody`-shaped result server-side; a validated file export was
never the only path to a published version and is not replaced one-for-one.
