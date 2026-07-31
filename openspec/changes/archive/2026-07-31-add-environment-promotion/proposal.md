## Why

Version numbers are environment-local, and `definitionHash` is the only
identity that crosses an environment boundary. Studio has no export or import
path. Moving a published definition from staging to production is a manual
rebuild. A developer re-authors the whole process in the target Studio.

## What Changes

- Studio's Versions screen gains an Export action. It downloads the selected
  published version as a `.json` file containing `{processId, version,
  definitionHash, body}`.
- The exported `body` is the compiled body the source stores, unchanged. Import
  sends it back unchanged. `publishBody` already treats an already-compiled
  body as a no-op. The target therefore recomputes the source's own hash.
- Studio's process list screen gains an Import action. It reads such a file
  with a native `<input type="file">`, checks the file shape client-side,
  shows a preview, and publishes on confirm.
- The preview warns when the target already holds a different process under the
  incoming `key`. Nothing enforces key uniqueness, and no one can delete a
  published process. The warning does not block, since that state can be
  intentional.
- Import calls the existing `POST /processes { processId, body }` route with
  the source environment's exact `processId`. A subprocess reference inside a
  promoted body therefore stays valid once a developer promotes the child
  first.
- No engine change, no new HTTP route, no schema change, no new dependency.
  Export uses `Blob` plus `URL.createObjectURL`; import uses `FileReader`.
- No new role. Export needs `system:developer`, which Studio access already
  requires. Import needs `system:developer` plus `system:publish`, the same
  pair the existing Publish action needs.
- Studio's client learns the six publish-time rejections. It collapsed all six
  into a generic server error before. A located, fixable error therefore read
  as "the server hit an error". The existing Publish action gains the same
  detail.

## Capabilities

### New Capabilities
- `environment-promotion`: exporting a published process version as a file.
  Importing that file into another environment publishes it there under the
  source `processId`.

### Modified Capabilities

None. Export and import are new actions on two existing screens. No existing
requirement changes.

## Impact

- `packages/studio`: the Versions screen and the process list screen. Two new
  pure logic modules cover the export payload and the import file guard.
- `packages/studio/src/api/client.ts`, `errors.ts` and `api/types.ts`: two new
  client error variants for the publish-time rejections.
- No change to `src/`, `openspec/specs/studio-publish`, or any existing test
  fixture.
- Promotion order stays manual and child-first. `scripts/seed.ts` already
  follows that order. A parent published before its subprocess child still
  fails the existing `validateCrossProcess` check.
