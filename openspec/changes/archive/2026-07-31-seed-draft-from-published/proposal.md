## Why

In the Studio process list, *Create draft* on a published process writes an
empty body. The call is `saveDraft(processId, { body: {}, layout: {},
revision: 0 })`. That is the same call `+ New process` makes, with an existing
id instead of a minted one. The published version is never read.

An author who wants to change v1 lands on a blank canvas. One way out is to
rebuild the process by hand. The other is to discard the draft and copy the
body out of the Versions screen. For a published process, "create a draft"
almost always means "continue from the published version". The current
behavior destroys that starting point.

The seeded body alone is not enough. `VersionsScreen` offers exactly one
draft-versus-version comparison, "Diff draft against base". It reads
`baseVersion` from the draft row. Only `markDraftPublished` writes that
column today. A draft seeded from v1 would therefore carry no base. The
author could not see what they changed until after the next publish.

## What Changes

- Creating a draft for a published process seeds the draft body from the
  latest published version. It no longer writes an empty body.
- The seed drops the content the compile pass injects, so the draft holds the
  authored shape. `process-drafts` already requires that shape.
- The seeded draft declares the version it derives from. `saveDraft` and
  `PUT /drafts/:processId` accept an optional `baseVersion`. It must name a
  published version of that process.
- Creating a draft for a process with no published version stays empty.
- Creating a new process keeps its current behavior. It declares no base
  version.
- The seeded draft carries no layout. The canvas auto-places steps that have
  no recorded position (`autoPlaceSteps`). A seeded process therefore renders
  without one.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: the process list's draft-creation requirement gains the
  seeding rule. Today the spec states only that a published row offers
  creating a draft. It does not say what body that draft starts from.
- `process-drafts`: the save path accepts a caller-declared base version and
  checks that it resolves. Today only the publish path writes that column.
- `process-version-inspection`: the diff compares by canonical JSON, and the
  draft-against-base diff strips the base. Seeding makes that comparison the
  headline action, and it reported the whole field catalog as changed.

## Impact

- `packages/studio/src/screens/processListLogic.ts`: the seed decision, and
  the function that strips the compile-pass content.
- `packages/studio/src/screens/ProcessesScreen.tsx`: `createDraft` reads the
  published body before it writes the draft.
- `src/engine/drafts.ts`: `SaveDraftInput` gains `baseVersion`, and the
  envelope check gains its validation.
- `src/http/studio-routes.ts`: `handleSaveDraft` passes `baseVersion` through.
- `packages/studio/src/api/client.ts`: no change. `getVersionBody` exists.
- `src/schema/canonical-json.ts`: new. `canonicalize` moves out of `hash.ts`
  and into the package's `exports` map. The studio then shares it. `hash.ts`
  imports `node:crypto`, which no browser bundle can take.
- `packages/studio/src/screens/versionDiffLogic.ts`,
  `packages/studio/src/screens/VersionsScreen.tsx`: the diff fixes.
- `src/schema/compile.ts`, `src/engine/definitions.ts`: no change. Publish
  keeps its current semantics.
