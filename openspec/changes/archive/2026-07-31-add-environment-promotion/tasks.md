## 1. Pure logic modules

- [x] 1.1 Add `packages/studio/src/screens/promotionExportLogic.ts`: build the
      `{processId, version, definitionHash, body}` payload and a filename from
      a `processId`, a `VersionSummary` and a resolved body. Pass the compiled
      body through unchanged, and mark that with a `ponytail:` comment naming
      `compileProcessBody`'s idempotent branch, so nobody later reaches for
      `stripCompiledContent` the way `seededDraftInput` does.
- [x] 1.2 Add `packages/studio/src/screens/promotionImportLogic.ts`: parse file
      text, check for a string `processId` and an object `body`, and return
      either the checked pair plus preview fields (`key`, `label`, source
      `version`, source `definitionHash`) or an error message. Resolve `label`
      through the body's `baseLocale` with the existing
      `draft/localized-text.ts` helper.
- [x] 1.3 Add a key-collision check to `promotionImportLogic.ts`: given the
      already-loaded process list, report a warning when a different
      `processId` in the target holds the incoming `key`. Never block.
- [x] 1.4 Add `packages/studio/test/promotionExportLogic.test.ts`: payload
      shape and filename, including a `key` that needs escaping. Assert the
      payload's `body` is the input body, unstripped, cancel sink included.
- [x] 1.5 Add `packages/studio/test/promotionImportLogic.test.ts`: a valid
      exported file, malformed JSON, a missing `processId`, a missing `body`, a
      non-object `body`, and a file whose round trip through
      `promotionExportLogic` parses back unchanged. Cover a multi-locale
      `label`.
- [x] 1.6 Cover the key-collision check in the same test file: a colliding
      `key` under a different `processId`, the same `key` under the same
      `processId` (a re-promotion, no warning), and a free `key`.

## 2. API client

- [x] 2.1 Add `publishProcess(processId, body, token)` to
      `packages/studio/src/api/client.ts`, calling `POST /processes` with
      `{processId, body}` and returning the existing `PublishResult` type.
      Route errors through `StudioClientError` like every sibling function.

## 3. Export on the Versions screen

- [x] 3.0 Before touching any component, run the design skills the repo
      mandates for `packages/studio` work: `/frontend-design:frontend-design`
      for visual direction, plus `web-design-guidelines`,
      `vercel-react-best-practices` and `vercel-composition-patterns`. Both new
      surfaces are UI: an action per version row, and an import flow with a
      preview and a warning state.
- [x] 3.1 Add an Export action per published version row in
      `packages/studio/src/screens/VersionsScreen.tsx`. Resolve the body with
      the existing `getVersionBody`, build the payload with
      `promotionExportLogic`, and download it with `Blob` plus
      `URL.createObjectURL`.
- [x] 3.2 Revoke the object URL after the download starts.
- [x] 3.3 Report a failed body fetch inline, using the screen's existing error
      state, not a thrown error.

## 4. Import on the process list screen

- [x] 4.1 Add an Import action to
      `packages/studio/src/screens/ProcessesScreen.tsx`, using a native
      `<input type="file" accept="application/json">` plus `FileReader`.
- [x] 4.2 Run the file text through `promotionImportLogic`. Show the returned
      error inline and send no request when the guard rejects the file.
- [x] 4.3 Show the preview (`key`, `label`, source `version`, source
      `definitionHash`) and publish only after an explicit confirm.
- [x] 4.4 Show the key-collision warning in the preview when task 1.3 reports
      one, without blocking the confirm.
- [x] 4.5 Call `publishProcess` on confirm and report the resulting version and
      hash the same way the existing Publish action reports its result.
- [x] 4.6 Show the server's message unchanged when publish fails, covering the
      cross-process, authorization and validation cases.
- [x] 4.7 Refresh the process list after a successful import so the promoted
      process appears without a manual reload.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` and the full `bun test` suite with
      `DATABASE_URL` set. Check the skip count, not only the pass count.
- [x] 5.2 Verify end to end against a running stack: export a published version,
      truncate or point at a second database, import the file, and confirm the
      target holds the same `processId` and `definitionHash`.
- [x] 5.3 Verify the no-op path: import the same file again and confirm the
      target mints no new version.
- [x] 5.4 Verify the cross-process path: import `subprocess-loan-parent` before
      its child and confirm the screen shows the validation error.
- [x] 5.5 Update `ROADMAP.md` stage 18 and `docs/current-state.md` with an
      Environment promotion entry.
