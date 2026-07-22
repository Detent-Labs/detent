## 1. Import parsing

- [x] 1.1 In `packages/editor/src/draft/io.ts`, extract the existing
      wrapper-detection used by `parseChildProcessJson` (checks for a
      top-level `definition` key) into a small shared helper so both it and
      the new import parser use one unwrap rule.
- [x] 1.2 Add `stripReservedCancelIdentity(body: ProcessBody): ProcessBody`
      (or fold into the import parser) that removes the step matching
      `CANCEL_SINK_STEP_ID` from `workflow.steps` and, if `contract` is
      present, removes `RESERVED_CANCEL_OUTCOME` from `contract.outcomes`.
      No-op when neither is present.
- [x] 1.3 Add `parseImportedProcessJson(text: string): Draft` in `io.ts`:
      `JSON.parse` → unwrap (1.1) → `processBody.parse` (strict) → strip
      (1.2) → return as `Draft`. Throws the underlying `ZodError` /
      `SyntaxError` on failure (FileToolbar's existing `describeError`
      already renders `Error.message`).

## 2. File I/O wiring

- [x] 2.1 In `packages/editor/src/draft/file-io.ts`, add
      `importProcessViaPicker(importFileDescription: string): Promise<Draft>`
      (File System Access path, `.json` accept type) and
      `importProcessFromFile(file: File): Promise<Draft>` (fallback `<input
      type=file>` path), mirroring `loadDraftViaPicker` /
      `loadDraftFromFile` but calling `parseImportedProcessJson`.

## 3. UI

- [x] 3.1 In `packages/editor/src/panels/FileToolbar.tsx`, add an "Import
      process" button (and a second hidden file input for the
      non-FileSystemAccess fallback) wired to `replace()`, following the
      same `run()` error-handling pattern as Load draft.
- [x] 3.2 Add locale strings in `packages/editor/src/i18n/catalog.ts`:
      `fileToolbar.import`, `fileToolbar.importFileDescription`.

## 4. Tests

- [x] 4.1 In `packages/editor/test/file-io.test.ts`, add coverage for
      `parseImportedProcessJson`: a `DefinitionVersion`-wrapped body loads
      correctly (e.g. adapted from `examples/expense-approval.json`), a raw
      `ProcessBody` loads correctly, and a genuinely invalid file (fails
      `processBody.parse`) throws.
- [x] 4.2 Add a test asserting the cancel-sink strip: import a `ProcessBody`
      whose `workflow.steps` includes a step with `id: CANCEL_SINK_STEP_ID`
      (and, for the contracted case, `RESERVED_CANCEL_OUTCOME` in
      `contract.outcomes`) and assert both are absent from the resulting
      Draft.
- [x] 4.3 Add a test asserting a stripped/imported Draft passes
      `exportProcessBody` (round-trips through `authoredProcessBody`
      without throwing on the reserved identity).

## 5. Verification

- [x] 5.1 `bun test` (full suite) and `bun run typecheck` in
      `packages/editor`, both clean.
      Verified: `bun test` — 59 pass, 0 fail (100 expect() calls) across 8
      files; `bun run typecheck` — clean.
- [x] 5.2 Manually import `examples/expense-approval.json` in the running
      editor (`bun run dev`) and confirm the workspace populates (process
      key/label, fields, steps) instead of staying blank; confirm "Load
      draft" still rejects the same file with its existing error.
      Verified via playwright-cli against the live dev server: Import
      process populated key `expense_approval`, label "Expense Approval",
      all 4 fields, all 6 steps (capture/review/book/booked/rejected/
      booking_error), and the contract (inputFields, outputFields, outcomes
      booked/rejected) — Export process JSON went from disabled to enabled
      (clean validation), no "[zod]" issues remained. "Load draft" on the
      same file still shows the load-guard error listing every unrecognized
      top-level key (processId, version, definitionHash, status,
      compatibility, publishedAt, definition) — unaffected by Import.
