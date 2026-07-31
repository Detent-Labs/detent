## 1. Invert the compile pass

- [x] 1.1 In `packages/studio/src/draft/`, add a function that removes the
  compile-pass content from a published body: the step with
  `CANCEL_SINK_STEP_ID`, and `RESERVED_CANCEL_OUTCOME` from
  `contract.outcomes`. It removes nothing else and mutates no input.
- [x] 1.2 Note beside it that it inverts `compile.ts::compileProcessBody`,
  and that task 1.3 is the check that keeps the two in step.
- [x] 1.3 Add a round-trip test over every definition in `examples/`. For
  each one, `strip(compileProcessBody(authored))` equals
  `authoredProcessBody.parse(authored)`. Cover the contracted child example,
  which is the only one that exercises the outcome half.
- [x] 1.4 Confirm the stripped body passes `draft/validation.ts`, so a
  seeded draft reports no error the published version did not carry.

## 2. Accept a declared base version on save

- [x] 2.1 In `src/engine/drafts.ts`, add an optional `baseVersion` to
  `SaveDraftInput`. A save carrying it writes `base_version`. A save omitting
  it leaves the column as it stands.
- [x] 2.2 In the same envelope check that validates `revision`, reject a
  `baseVersion` that is present and not a positive integer, with
  `RequestShapeError`.
- [x] 2.3 Reject a `baseVersion` that names no published version of that
  process, with the same error. One `SELECT` against `definitions` on the
  same `db` handle.
- [x] 2.4 In `src/http/studio-routes.ts`, pass `baseVersion` from the `PUT`
  envelope into `saveDraft`.
- [x] 2.5 In `test/`, cover five cases. A save that stamps a base version.
  A save without the field, which preserves it. An unresolvable version. A
  malformed version. A publish that still stamps its own.

## 3. Seed the draft in the process list

- [x] 3.1 In `packages/studio/src/screens/processListLogic.ts`, add a
  function that maps a `ProcessRow` to the version to seed from. It maps a
  row with no published version to nothing.
- [x] 3.2 In `packages/studio/test/processListLogic.test.ts`, cover a
  published row, a draft-only row, and a row with neither.
- [x] 3.3 In `packages/studio/src/screens/ProcessesScreen.tsx`, have
  `createDraft` take the seed version. A seed version makes it read the body
  through `getVersionBody`, strip it, and send it as `body` with
  `baseVersion`. It keeps `layout: {}` and `revision: 0`.
- [x] 3.4 Keep `newProcess` on the empty path. It passes no seed version and
  no base version.
- [x] 3.5 When `getVersionBody` rejects, report the error through the
  screen's existing error state and skip the `saveDraft` call. Keep the 401
  path routed to `onUnauthorized`.
- [x] 3.6 In `packages/studio/src/api/client.ts`, add `baseVersion` to
  `saveDraft`'s request shape.

## 4. Verify

- [x] 4.1 `bun run typecheck` and `bun test` with `DATABASE_URL` set, inside
  the devcontainer. Check the skip count, not only the pass count.
- [x] 4.2 In the running Studio, create a draft for a seeded example process.
  Confirm the canvas renders its steps and live validation reports nothing.
- [x] 4.3 On the Versions screen for that process, confirm "Diff draft
  against base" is active and names the seeded version.
- [x] 4.4 Publish the untouched seeded draft. Confirm it returns the version
  it came from and adds no version row.
- [x] 4.5 Create a draft for a never-published process. Confirm the canvas
  stays empty. Discard both drafts afterwards.

## 5. Make the base diff agree with the definition hash

- [x] 5.1 Move `canonicalize` out of `src/schema/hash.ts` into
  `src/schema/canonical-json.ts`. Add that module to the package's `exports`
  map. `hash.ts` imports it and keeps `node:crypto` out of the browser path.
- [x] 5.2 In `versionDiffLogic.ts`, compare leaves with `canonicalize`
  instead of `JSON.stringify`, so key order stops reading as a change.
- [x] 5.3 Cover four cases. Key order inside an array is no change. Key order
  at the root is no change. A real value difference still is. Array element
  order still is.
- [x] 5.4 In `VersionsScreen.tsx`, strip the base body before the
  draft-against-base diff, with `stripCompiledContent`.
- [x] 5.5 In the running Studio, seed a draft and diff it against its base.
  Confirm "No differences". Change one label and confirm the diff reports
  that change alone.

## 6. Close the verification findings

- [x] 6.1 Move `stripCompiledContent` to `src/schema/strip-compiled.ts`,
  beside the compile pass it inverts, and into the `exports` map. Its
  round-trip test moves to `test/`. The studio keeps only the assertion that
  its own validator accepts a stripped body.
- [x] 6.2 Extract `seededDraftInput(seedVersion, readBody)` into
  `processListLogic.ts`. `ProcessesScreen.createDraft` calls it. Cover the
  empty branch, the seeded branch, and a rejecting `readBody`.
- [x] 6.3 Cover the base diff in `versionDiffLogic.test.ts`. An unmodified
  seeded draft reports nothing. A changed one reports the change alone. The
  unstripped base would report the sink.
- [x] 6.4 Cover `baseVersion` at the route in `test/http-studio.test.ts`. It
  round-trips through `PUT` and `GET`. A malformed one is 400. An
  unresolvable one is 400.
- [x] 6.5 Bring `docs/current-state.md` up to date. Correct the diff and
  process-list passages, add `baseVersion` to the envelope description, and
  append an entry for this change.
