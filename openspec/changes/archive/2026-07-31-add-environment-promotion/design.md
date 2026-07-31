## Context

See `proposal.md` for motivation, and
`docs/superpowers/specs/2026-07-30-environment-promotion-design.md` for the
approved design this change implements. This document records only what a
source review added on top of it.

Five facts from the current code shape the work.

- `POST /processes` (`src/http/routes.ts::handlePublish`) accepts
  `{ processId: string, body: ProcessBody }` and needs `PUBLISH_ROLE` alone.
  It runs the whole existing publish chain: registry check, CEL check,
  cross-process validation, hash-idempotent no-op.
- `GET /processes/:processId/versions/:version` resolves a version's compiled
  body. `packages/studio/src/api/client.ts::getVersionBody` already calls it,
  for the Versions screen diff.
- `client.ts` has no function for `POST /processes`. `publishDraft` targets
  `POST /drafts/:processId/publish`, a different route that publishes the
  persisted draft server-side and never accepts a body. Import cannot reuse it.
- `publishBody` always calls `compileProcessBody`
  (`src/engine/definitions.ts:193`). That pass takes an idempotent early return
  for an already-compiled body (`src/schema/compile.ts:710`).
- The `definitions` table has the primary key `(process_id, version)`. A
  process `key` lives inside the jsonb body and carries no unique constraint.

## Goals / Non-Goals

**Goals:**

- One new `client.ts` function for `POST /processes`. Two new `ClientError`
  variants join it, for a reason implementation uncovered. See "Studio's
  client learns the publish-time rejections" below.
- Export and import logic in pure modules, testable without a DOM. This matches
  `studio-app`'s existing requirement: Studio's testable logic sits outside its
  components.
- Reuse `getVersionBody`, unchanged, as the export data source.

**Non-Goals:**

- Everything the approved design lists under Non-goals stays out. That covers a
  network push and dependency bundling. It also covers promoting drafts, plans,
  users or instances, and a cross-database diff.
- No engine change, no new route, no schema change, no new dependency.

## Decisions

### Export ships the compiled body verbatim, and import never strips it

`getVersionBody` returns the compiled body. Export writes it into the file
unchanged, and import sends it to `POST /processes` unchanged.

This is safe. `compileProcessBody` returns an already-compiled body untouched.

Two engine tests guard that no-op. One asserts it directly, in
`test/compile-validation.test.ts`. The other lives in `test/validate.test.ts`.
It covers the same path under the name this feature creates: a body
"round-tripped out of the definition store".

The target therefore recomputes the same `definitionHash` the source held.
That equality is the whole point of promotion. A contracted child keeps its
compiled contract hash too. A parent's `contractRef` still resolves once a
developer promotes the child.

**Do not call `stripCompiledContent` on this path.** One function above where
the import action lands, `processListLogic.ts::seededDraftInput` does call it.
The temptation to copy that line is real. Its reason does not apply here. A draft must be authored-shape. The panels and
`authoredProcessBody` both reject the injected cancel sink. An import publishes
instead of editing, so it needs no such conversion.

Stripping would not corrupt anything. Strip and compile are inverses, guarded
by `test/strip-compiled.test.ts`, so the hash would come out the same. It is an
extra step with its own error surface and no gain.

### The preview warns about a colliding process key

Nothing enforces a unique process `key`. An import whose `key` matches an
unrelated process already in the target therefore succeeds. Two processes then
share one key, and nothing can delete either.

The approved design dismisses a `processId` collision, correctly: ids are
UUIDv4. A `key` collision is a different and realistic case. A developer
re-authors the process by hand in production, and a promotion from staging
arrives later.

The import preview therefore warns when the target already holds a process with
this `key` under a different `processId`. It does not block, since the state
can be intentional, and only the developer knows.

This costs no request. The process list screen already holds the target's
processes in state, so the check reads data the screen loaded anyway. It is
not the cross-database diff the approved design rules out. That would compare
against a *remote* environment's state.

### Studio's client learns the publish-time rejections

Found by driving a rejected import through the running stack, not by reading
code. `src/http/errors.ts` maps six publish-time error classes to 422. Each
carries located detail. `client.ts::parseErrorBody` handled none of them. All six fell
through its `default` into `internal`. `errors.ts::describeError` then showed
"The server hit an error. Try again." for an error the server had already
located exactly.

Two new `ClientError` variants close it. `publish-validation` carries the
normalized `{loc, message}` issues that five of the six raise.
`cross-process-validation` carries the sixth's own message.

`describeError` shows both. That is the one place it reads server text, against
its own standing rule. The rule's reason does not hold here. These strings come
from the publish chain's validators. They address a developer, and they name a
location in a body that same developer supplied.

This is not promotion-specific. The existing Publish action hit the identical
wall, and gains the same detail. The spec requires it either way. An import
cannot surface "the error the server returned" while the client discards it.

### The dialog owns its own error

A refused publish shows inside the `<dialog>`, not on the screen behind it.
`showModal()` puts the dialog in the browser's top layer. The browser dims
everything behind it and takes it out of reach. The first implementation put
the message there anyway. The browser check found it: the dialog stayed open
and reported nothing.

The dialog stays open after a refusal. The reason then sits beside the file it
describes, and the developer can cancel or retry. A file the client-side guard
rejects opens no dialog at all, so its message stays on the screen.

### Import lives on the process list, export on the Versions screen

Export addresses one published version, so it belongs beside the version row
that identifies it. Import addresses no process the target already knows.
The target environment may hold no version of the incoming process at all,
which is the normal first-promotion case. So import belongs on the process
list screen, next to the existing "new process" action.

### The exported file carries four keys, the import sends two

The file holds `{processId, version, definitionHash, body}`. Import sends only
`processId` and `body`. `version` and `definitionHash` describe the source
environment, which counts versions in its own database. They exist for two
readers: a developer opening the file, and the import preview naming the
source. The alternative, exporting `{processId, body}` alone, loses the only
evidence of where the file came from.

### Import reads `key` and `label` from the body for the preview

The preview shows the incoming `key` and `label`. Both live inside `body`, so
the import module reads two fields from an already-parsed object. It does not
parse `body` against `ProcessBody`. Studio ships no client-side schema
validation for it today, and keeps `DraftRecord.body` opaque for the same
reason. The server validates on publish. A body that fails there surfaces
through the existing HTTP error mapping.

`label` is a `LocalizedText` map, not a string. The preview resolves it through
the body's own `baseLocale`, with Studio's existing `draft/localized-text.ts`
helper. Rendering the raw value would put an object into JSX.

### Two pure modules, no shared "promotion" module

`screens/promotionExportLogic.ts` builds the export payload and the filename.
It takes a `processId`, a `VersionSummary` and a resolved body.
`screens/promotionImportLogic.ts` parses file text. It returns either a checked
`{processId, body}` pair plus preview fields, or an error message. The two
share no state and run on opposite sides of a boundary. One module holding
both would only pair two unrelated functions.

This split matches the naming and shape of the existing
`publishGateLogic.ts`, `versionDiffLogic.ts` and `migrationPlanLogic.ts`.

### The download uses `Blob` plus `URL.createObjectURL`

Both are native browser APIs. The repo adds no file-saving dependency for one
button. The component revokes the object URL after the click. The blob
therefore does not stay held for the life of the page.

## Risks / Trade-offs

- A developer imports a file into the wrong environment → The preview names the
  process `key`, its `label` and the source version first. The developer must
  then confirm. A wrong import mints a real version that nothing can delete.
  The confirm step is the only guard. The existing Publish action relies on
  that same guard.
- A hand-edited file carries a body that no longer matches its stated
  `definitionHash` → The target recomputes the hash on publish. It never trusts
  the file's value. The mismatch shows in the result the screen reports.
- A developer promotes a parent before its subprocess child → The existing
  `validateCrossProcess` check rejects the publish. Studio shows the server's
  message. A hand-authored publish already produces the same error.
  Promotion order stays the developer's job.
- The client-side guard passes a file the server then rejects → Intended. The
  guard checks the file's shape, never the definition contract. Splitting
  validation across both sides would duplicate the contract in the browser.
- A developer confirms past the key-collision warning → The target then holds
  two processes under one `key`. Nothing can delete either one. The warning is
  the only guard, by the decision above. The engine has never enforced key
  uniqueness, so this change neither adds nor closes that gap.
- An implementer strips the compiled body out of habit → The result still
  publishes to the same hash. No test would fail. Only the decision above, and
  its `ponytail:` comment in the export module, keep the extra step out.

## Migration Plan

No migration. No stored data changes shape, and no schema changes.

One existing behavior does change. The publish-time rejections now reach the
developer with their located detail. That holds on the existing Publish action
as much as on import. A developer who published before this change and reads the new
message sees more, never less.

Rollback comes in two independent parts, not one. Deleting the export and
import actions removes promotion; nothing else depends on them. The error
mapping stands on its own and would stay. The Publish action it also serves
predates this change.
