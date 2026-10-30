# Proposal

## Why

A new process opens on four Zod lines. The empty choice seeds the body
`{ baseLocale: "en" }` and nothing else. The header then prints four lines
of the form `zod Invalid input: expected string, received undefined`, and a
refusal-colored banner stands above them. After the author names the
process, `expected array, received undefined` stays, and no place goes with
it.

This is finding B2 of `docs/studio-ui-concept.md`, rated important. It
breaks principle 6 there, which says a new process starts clean. Change 1 of that document's cut fixes it first, because it costs the least
and every new author meets it.

## What Changes

- The empty choice seeds every list in place and empty: `key: ""`,
  `label: {}`, `baseLocale: "en"`, `fields: []` and `workflow.steps: []`.
  Measured against `validateStructure`, this leaves one Zod issue: the
  missing `workflow.initialStep`.
- A draft with no step is in a start state. That one issue
  leaves the issue list. The Checks count reads 0. The checks rail shows one
  sentence that names where to add the first step, and no group.
- Publish renders unavailable in the start state. The reason "Publish needs
  a first step" uses the muted tone the permission reason already uses. The
  permission reason wins when both apply.
- After the first step, an unnamed process gets the issue
  `missing baseLocale ('en') entry` at `label`. It now reads as a sentence
  at the name in the header bar, with no source label beside it. It still
  counts as a blocker.
- The structural banner stands only for a Zod issue outside those two
  gaps. A fresh draft and an unnamed draft show none.
- `src/schema/definition.ts` stays as it is. Nothing changes the engine.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: the empty choice seeds every list empty. Today's body
  declares the base locale alone.
- `studio-checks-rail`: a draft with no step shows a start state in place of
  its groups. An unnamed process's issue reads as a sentence at its place.
- `studio-process-tabs`: the structural banner ignores the two start gaps.
- `studio-publish`: Publish renders unavailable on a draft with no step, and
  names that reason.

## Impact

- `packages/web/src/areas/studio/screens/processListLogic.ts`: the seeded
  body.
- `packages/web/src/areas/studio/draft/validation.ts` and a new pure helper
  beside it: start-state recognition and the name sentence. The file
  `draft/issues.ts` gains the `plain` marker on `EditorIssue`.
- `draft/checksRail.ts`: the Checks count stays uncolored in the start
  state.
- `panels/shared/IssueList.tsx`, `panels/ChecksRail.tsx`,
  `screens/EditScreen.tsx`, `panels/ProcessHeaderBar.tsx` and
  `screens/draftToolbarState.ts`: banner gate, rail start state, Publish
  reason, no source label for a sentence issue.
- `packages/web/src/i18n/catalogs/studio.ts`: three new sentences.
- Tests under `packages/web/test/`. Two code comments go stale. The one in
  `draft/chainingFetch.ts` quotes the old empty body. The one in
  `packages/web/test/studio-processesScreen-createGate.test.tsx` quotes the
  removed requirement's name.
- `docs/authoring-guide.md` gains one sentence on the empty start, and
  `docs/browser-checks.md` one entry.
- `docs/decisions.md`: FIELDS-8 notes the part this change closes. `ROADMAP.md` marks change 1 of stage
  64 shipped.
- No API, schema, dependency or engine change. A draft stored before this
  change keeps its old body; nothing deployed needs it filled.
