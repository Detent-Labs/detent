## Why

The white-label override mechanism ships today for `shell`, `app` and
`studio`. The admin and reporting areas carry no catalog, so every string they
show is a literal in a `.tsx` file. An operator can override neither area's
wording, and neither area answers the German the account picker offers.
ROADMAP stage 13b names this retrofit as the next step.

## What Changes

- Add `i18n/catalogs/admin.ts` and `i18n/catalogs/reporting.ts`, each with an
  `en` and a `de` map, built the way `catalogs/app.ts` already is.
- Add `areas/admin/catalog.ts` and `areas/reporting/catalog.ts`, each exporting
  `t(locale, key)` over `resolveOverride` and its own catalog, the way
  `areas/app/catalog.ts` already does.
- Register both areas in `BUILTIN_CATALOGS` and `OVERRIDABLE_AREAS`, so the
  UI-strings screen offers five areas rather than three.
- Route every operator-facing string in `areas/admin` and `areas/reporting`
  through `t(locale, key)`. Around 171 candidate literals sit in 15 admin
  files. Around 29 sit in 7 reporting files.
- Thread the `locale` prop each area root already receives down to its
  screens. Only `DataListScreen` takes one today.

Machine values stay as they are. The engine matches each one exactly. An id,
a definition hash, a role name, a process key, a CEL source, an outbox status
token. None of them enters a catalog.

No schema change, no API change, no route change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-app`: the area renders its wording from a catalog through
  `t(locale, key)`, in EN and DE, rather than from literals.
- `reporting-app`: the same rule for the reporting area.
- `ui-string-overrides`: `admin` and `reporting` join the set of areas an
  operator can override.

## Impact

- New: `packages/web/src/i18n/catalogs/admin.ts`,
  `packages/web/src/i18n/catalogs/reporting.ts`,
  `packages/web/src/areas/admin/catalog.ts`,
  `packages/web/src/areas/reporting/catalog.ts`.
- Changed: `packages/web/src/i18n/catalogs/index.ts`, and the screens, roots
  and logic modules under `packages/web/src/areas/admin` and
  `packages/web/src/areas/reporting`.
- Also changed: `packages/web/src/areas/reporting/components.tsx`, which holds
  the shared date control, empty state and failure note.
- Tests: a catalog test asserting the `en` and `de` key sets match, per area.
  `packages/web/test/boundaries.test.ts` keeps holding. Neither new catalog
  file imports from an area. Two tests change:
  `admin-uiStringsLogic.test.ts` and `reporting-reportingLogic.test.ts`.
- Docs: `docs/current-state.md` gains a section, `docs/browser-checks.md`
  gains the German walk, and `ROADMAP.md` records the retrofit as landed.
- A browser check on both areas, in both locales. German runs up to 40% longer
  than English. Both areas carry tables whose columns have no slack.
