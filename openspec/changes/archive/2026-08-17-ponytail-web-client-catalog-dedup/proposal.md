## Why

`PONYTAIL-AUDIT.md` groups findings 13, 14, 17, 31 and 33 as one change
against `packages/web` (audit line 331). Finding 31 already belongs to the
open change `ponytail-cleanup-fetch-hooks-and-imports`. The other four
remain. Each is a rule the web package states more than once. No other open
change rewrites those files end to end.

A re-measurement against the tree confirmed the four findings and corrected
five claims inside them. One correction changes the shape of the fix. The
audit routes three shared API types through the engine's exports map. They
are not reachable there. This change records every correction in the audit,
so the next scan does not re-propose what does not hold.

## What Changes

- Add `useFail(onUnauthorized, onError)` to `packages/web/src/shell/` and
  call it from the 55 sites that repeat its rule (finding 13). A 401 logs
  the actor out; anything else becomes a message. The rule stands 57 times
  across 21 files, in three syntactic forms. `TemplatesScreen.tsx:45`
  already wrote the hook by hand and named it `fail`.
- Convert every one of the three forms, not the one the audit counted. The
  audit's finding 13 counts the one-line form alone, which stands 40 times
  in 15 files. A second form runs `{ onUnauthorized(); return; }` over two
  lines and stands 16 times in seven more files. A third runs
  `return onUnauthorized();`, once, at `ProcessesScreen.tsx:217`.
  `design.md` § Decision 1 lists all three and names the two sites that
  stay.
- Add `makeCatalog(area, catalog)` to `packages/web/src/i18n/` and call it
  once from each of `areas/admin/catalog.ts`, `areas/app/catalog.ts`,
  `areas/reporting/catalog.ts` and `shell/catalog.ts` (finding 14). Those
  four `t()` bodies agree exactly, apart from the area string and the
  catalog they read. Each area keeps importing only its own catalog file,
  so the per-area chunking holds.
- Name the catalog key type one way. It is `CatalogKey` in three areas,
  `TranslationKey` in the studio and `ShellKey` in the shell (finding 14).
- Move the `get<T>(path, token)` helper out of
  `areas/reporting/api/client.ts` into `src/api/client.ts` as `getJson<T>`,
  and call it from every area client (finding 17). The body
  `const res = await request(path, token); return (await res.json()) as T;`
  stands 14 times across the four area clients. The reporting area already
  wrote the helper and its comment names the reason.
- Move three endpoint wrappers into `src/api/` (finding 17):
  `getInstanceRecord` (admin, studio), `createInstance` (app, studio) and
  `submitPath` (app, studio). Two areas declare each of the three. Both the
  parameters and the return type agree. `VersionSummary`,
  `InstanceRecordElement` and `InstanceRecordPage` move with them. Those
  three types are byte-identical between `areas/admin/api/types.ts` and
  `areas/studio/api/types.ts`.
- Leave `cancelInstance` (admin, app) and `listVersions` (admin, studio)
  where they are (finding 17). Two areas declare each, and both are too
  short to move. An area imports from its own client, so a hoisted wrapper
  costs a re-export line in each area. After `getJson` lands, each of these
  two bodies is one line. Two re-exports plus one shared declaration is
  three lines to replace two.
- Leave `listProcesses` and `getInstanceView` declared per area, reduced to
  one `getJson` call each (finding 17). Their return types differ per area
  by design. The studio's `ProcessSummary` carries `definitionHash` and the
  admin's does not. The studio's `InstanceView` carries `fields`, `columns`
  and `availablePaths`. The admin's carries `redactedAt`. The audit says to
  leave those two types split, and the wrappers follow the types.
- Merge `describeRecordElement`
  (`areas/studio/screens/playerLogic.ts:5`) and `describeElement`
  (`areas/admin/screens/InstanceScreen.tsx:46`) into one function returning
  `{at, summary}` (finding 33). The admin caller adds its own `detail`.
  The studio copy's comment names `packages/admin`, a package that merged
  away on 2026-07-31. That comment goes with the merge.
- Correct `PONYTAIL-AUDIT.md`. Record findings 13, 14, 17 and 33 as
  resolved. Move the parts that did not hold under "Checked, not flagged".
  `design.md` carries the measurement behind each.

Five claims inside the four findings do not hold as written:

- Finding 14 says the five catalog files carry "a copy-pasted `tFill`".
  There is one `tFill`, in `areas/admin/catalog.ts`, and one `tCount`, in
  `areas/reporting/catalog.ts`. The two bodies differ: `tFill` walks
  `Object.entries(values)` with `replaceAll`, `tCount` runs one `replace`
  on `{n}`. Each has one declaration. Neither is duplication, and this
  change leaves both.
- Finding 17 says four area clients declare `listProcesses`. Three do
  (admin, app, studio) and they agree exactly. The reporting area's is a
  different function. It reads a different route,
  `/reporting/processes`, and unwraps `{processes}` from the response body.
- Finding 17 calls admin's and studio's `getInstanceRecord` byte-identical.
  The two differ by one local name, `query` against `params`. They are the
  same function, so the merge still lands; the audit's wording does not.
- Finding 17 says `InstanceRecordElement`, `InstanceRecordPage` and
  `VersionSummary` "can come from the engine's exports map like
  `HistoryEntry` already does". They cannot, today. `HistoryEntry` reaches
  the web package through the `./schema` entry, which is
  `src/schema/definition.ts`. `VersionSummary` lives in
  `src/engine/definitions.ts`, and `InstanceRecordElement` in
  `src/runtime/api.ts`. The exports map publishes neither file.

  Adding two entries to that map widens the engine package's public surface.
  That is an engine decision, not a `packages/web` refactor. The three types
  move to `packages/web/src/api/types.ts` instead. That file's own header
  rules domain types out. `design.md` § Decision 4 says why these three are
  the exception. This change rewrites the header to say so too.
- Finding 13 proposes `useFail(onUnauthorized, setError, describe)`. That
  signature does not cover `shell/ProfilePage.tsx`. Its two sites answer
  with `setLoadFailed(true)` and `setSaveFailed(true)`. The hook takes the
  failure handler itself, so all three of the tree's else-branch shapes fit.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Every item is an internal refactor inside `packages/web`. The rendered
text stays. The requests sent stay. The failure handling and the exported
behavior of each area stay. Nothing touches the engine, the HTTP wrapper,
the schema or the definition contract.

Marked `skip_specs: true`, the same reasoning
`ponytail-cleanup-fetch-hooks-and-imports` recorded for its own
`packages/web` findings.

## Impact

Code, all under `packages/web/src`:

- New: `shell/useFail.ts`, `i18n/makeCatalog.ts`, `api/record.ts`.
- Rewritten: `areas/{admin,app,reporting}/catalog.ts`, `shell/catalog.ts`,
  `api/client.ts`, `api/types.ts`, the four `areas/*/api/client.ts`,
  `areas/{admin,studio}/api/types.ts`,
  `areas/studio/screens/playerLogic.ts`,
  `areas/admin/screens/InstanceScreen.tsx`.
- Renamed key type: `i18n/catalogs/studio.ts` and `i18n/catalogs/shell.ts`
  declare `TranslationKey` and `ShellKey`. Both become `CatalogKey`. Seven
  files read them. Three are `shell/catalog.ts`, `shell/profileFields.ts`
  and `areas/studio/catalog.ts`. Four are studio files, under `canvas/`,
  `panels/` and `screens/`.
- Touched at the call sites: the 21 files holding the 57 `401` branches.

Outside `packages/web`: `PONYTAIL-AUDIT.md` records what landed and what did
not. `docs/browser-checks.md` gains the refetch-loop check from `design.md`
§ Decision 2.

Tests: `packages/web/test/` holds `i18n-catalog-parity.test.ts`,
`i18n-overrides.test.ts`, `i18n-substitution.test.ts` and
`studio-playerLogic.test.ts`. Each reads a symbol this change moves or
renames. Their assertions stay; their imports move. The `is401` predicate
inside `useFail` gets its own test. The hook's own stability is not testable
here, and `design.md` § Decision 2 says what covers it instead.

Sequencing. Three open changes touch files this one rewrites. Nobody has
applied any of the three:

- `ponytail-web-small-cuts` edits `areas/app/api/client.ts`,
  `areas/reporting/api/client.ts`, `areas/admin/errors.ts` and
  `areas/studio/errors.ts`.
- `ponytail-cleanup-fetch-hooks-and-imports` edits
  `areas/studio/screens/playerLogic.ts` (`seedFormValues`, a different
  function from finding 33's).
- `ponytail-cut-unreachable-code` deletes i18n keys from the catalogs this
  change's `makeCatalog` reads.

This change lands after all three. `design.md` records why that order and
not another.

No dependency changes. No new runtime dependency, none dropped.
