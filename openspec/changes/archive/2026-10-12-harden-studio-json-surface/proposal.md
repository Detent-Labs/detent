# Proposal

## Why

The JSON surface is the escape hatch for what no builder expresses. Two
defects make it unreliable. A draft with `collaboration` set on the process
refuses every Apply. A typo in a nested container crashes the whole studio
and loses every unsaved change.

The first case: an author unticks "Comments" in the header bar's `⋮` menu.
That writes `collaboration.comments = false`. They open the JSON surface,
change a label and press Apply. The shape guard answers "unrecognized
top-level field 'collaboration'". The guard lists ten of the eleven keys
`processBody` declares.

The second case: an author types `"steps": {}` where an array belongs and
presses Apply. The guard checks that `workflow` is an object and nothing
deeper. The draft takes the new body. The next paint calls `findIndex` on
an object. The area-level error boundary then unmounts the draft store.

The audit of 2026-10-10 recorded both as E1-1 and E1-5. Its E1-13 explains why
no test noticed. The mirror tests check fixed lists, so a missing key stays
green.

## What Changes

- The load guard accepts `collaboration` as a top-level object.
- The load guard checks every container the studio reads as an array or an
  object, at any depth. One table in `load-guard.ts` lists them.
  The guard refuses a malformed container before `replace()` runs. The
  refusal names the path, for example `workflow.steps`.
- The guard also refuses `null` for a container, as it already does at the
  top level. The studio treats an absent container as empty. The schema admits
  no `null`.
- `load-guard.ts` exports `KNOWN_KEYS`. A test compares it to
  `Object.keys(processBody.shape)`.
- A second test walks the Zod shapes of the body. It finds every array and
  object container at every depth. It fails when the guard's table misses one.
- `studio-sectionsFor.test.ts` gains a test that maps every key of
  `step.shape` to a section or to the masthead. `studio-changeSet.test.ts`
  checks its shape list against the schema.
- The layout does not change. The refusal uses the JSON surface's existing
  inline error region. Only its message text gains nested paths.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-json-view`: two requirements join the spec. A body carrying any
  top-level key that the definition contract declares applies. A malformed
  nested container stops Apply before it replaces the draft.

## Impact

- `packages/web/src/areas/studio/draft/load-guard.ts`: the key set and the
  container table.
- `packages/web/test/`: `studio-load-guard.test.ts`, `studio-sectionsFor.test.ts`,
  `studio-changeSet.test.ts`, the helper `zodContainerPaths.ts`, and a comment
  in `studio-fieldRemoval.test.ts`.
- `openspec/specs/studio-json-view/spec.md`, through the delta spec.
- `docs/decisions.md`: a new open section holds three follow-ups. Archive
  strikes the audit index entry for this change.
- `src/schema/definition.ts`, the engine, the HTTP surface and
  `docs/authoring-guide.md` stay as they are.
