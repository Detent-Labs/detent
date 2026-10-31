# Proposal

## Why

The process list prints machine values where an author looks for a name. A
row names its process by key, or by process id while no version exists.
The Draft column reads `saved by user_00a2… at 31/10/2026, 14:02 (rev 4)`.
The Published column reads `v1 · 3f9a0c21b7e4`. An author has to
recognise a process by its slug and a colleague by an account id.

This is finding M9 of `docs/studio-ui-concept.md`, rated important. Finding
c2 concerns the toolbar. It mixes three registers: a filled button, a
tracked uppercase label and the browser's own file input. Principle 2 of that
document keeps a key, an id or a hash behind the Developer view. Change 8 of its cut fixes the list, and it builds on no
other change.

## What Changes

- The Process column prints the process's name, the label in its base
  locale. A draft's own label wins over the published one, since the draft
  carries the newer name. A process with no name reads "Untitled process".
  The name is the row's link: a draft row opens the draft, and a row with
  no draft opens Versions.
- The Open button goes, because the name does its job. A row with no draft
  drops its Versions button for the same reason. A draft row keeps Versions
  when a version exists.
- The Draft column reads "Saved by Demo Superuser, 3 days ago". The person
  is the saving account's display name. The revision leaves the row.
- The Published column reads "v1 · 3 days ago". The hash leaves the row.
- Each row holds a closed Developer view. It prints the key, the process
  id, the draft revision, the full hash and the saving account's id.
- An empty column says so in words: "No draft", "Not published yet".
- Rows sort by name.
- "Import a promoted version" becomes a secondary button that opens the
  file chooser. The native file input stays in the markup, hidden.
- The discard confirmation names the process by its name in place of its id.
- `GET /drafts` gains four fields per draft. Three come from the body:
  `key`, `label` and `baseLocale`. The fourth is
  `updatedByDisplayName`: the saving account's resolved display name, or
  `null` when no local account matches.
  The body still stays out of the response.
- `src/schema/definition.ts` stays as it is. The definition hash and the
  stored draft stay as they are.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: the process list shows names, relative times and the saving
  person. Machine values move into a per-row Developer view, and import
  becomes a secondary button.
- `process-drafts`: the draft listing carries the body's name fields and
  the saving account's display name.

## Impact

- `src/engine/drafts.ts`: `listDrafts` reads `key`, `label` and `baseLocale`
  out of the stored body in SQL. `DraftSummary` gains the three fields.
- `src/auth/users.ts`: `displayNamesForUserIds`, which already resolves a
  list of account ids, gains a second reader. Only its doc comment changes.
- `src/http/studio-routes.ts`: `handleListDrafts` adds
  `updatedByDisplayName` per draft.
- `packages/web/src/areas/studio/api/types.ts`: `DraftSummary` mirrors the
  new fields, and `ProcessSummary` mirrors the `publishedAt` the server
  already sends.
- `packages/web/src/areas/studio/screens/processListLogic.ts`: row names,
  relative time and the name sort. `screens/ProcessesScreen.tsx`: the table,
  the toolbar and the discard text.
- `packages/web/src/i18n/catalogs/studio.ts`: the list's strings.
- Engine tests: `test/drafts.test.ts` and `test/http-studio.test.ts`.
- Web tests under `packages/web/test/`: `studio-processListLogic.test.ts`,
  `studio-processesScreen-createGate.test.tsx` and the new
  `studio-processesScreen-rows.test.tsx`.
- Test fixtures typed against the changed interfaces, in the same folder:
  `studio-subprocessSpec.test.ts`, `studio-subprocessSpecEditor.test.tsx`
  and `studio-promotionImportLogic.test.ts`.
- `e2e/publish.e2e.ts` opens its draft by the Open button today. It moves to
  the name link.
- `docs/decisions.md`: the process list leaves the `confirm()` entry's
  count of prompts in hardcoded English.
- `.claude/rules/ui-glossary.md`: the Developer view row gains the process
  list row.
- `docs/browser-checks.md` gains one entry. `ROADMAP.md` marks change 8 of
  stage 64 shipped.
- No schema, dependency or migration change. `docs/openapi.yaml` excludes
  the draft routes, so it stays as it is.
