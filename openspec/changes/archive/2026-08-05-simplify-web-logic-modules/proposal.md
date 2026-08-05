## Why

Ponytail audit findings 7, 8, 9, 11, 12, 13, 16, 17 and 18. All nine sit in
`packages/web`. One change carries them because they share a build, a test run
and a browser check.

Two of them come from one convention applied past its use. The studio-app spec
asks the studio to extract its testable logic from its components. Three files
now hold an expression that carries no logic.

`publishGateLogic.ts` is 13 lines, 9 of them comment, wrapping one
`JSON.stringify` comparison. `draftToolbarState.ts` is 39 lines, 30 of them
comment, wrapping one `structuredClone`. Its action union has two kinds whose
reducer branches are identical, and the file says so.

The rest are smaller. A one-line spread with its own exported type and unit
test. A submit button that restates what `required` gives free. A fallback
chain the catalog's own type makes unreachable.

Four more. An inline storage guard written twice beside the helper that
already does it. A flag two sites write and nothing reads. A module-level
mutable counter for a React list key. An alias for a constant, kept so two
return sites read differently.

## What Changes

- Collapse `savedBodyReducer`'s two-kind action union to the `Draft` it
  carries. Both branches were the same expression.
- Move `isDirty` into `draftToolbarState.ts` and delete `publishGateLogic.ts`.
  Both state one invariant: the body the server last confirmed.
- Inline `selectVersion` at its two call sites in `VersionsScreen.tsx`. Keep
  `VersionSelection`, `canDiff` and `diffJson`.
- Give `LoginScreen`'s two inputs `required` and cut the submit button's gate
  to `disabled={loading}`. **This is the one user-visible change.**
- Cut `t()`'s `?? catalog.en[key] ?? key` tail in both catalogs. The catalog
  type gives every locale every key, so neither fallback can run.
- Export `browserStorage()` from `session.ts` and call it twice from
  `App.tsx`, which writes the same guard inline instead.
- Delete `Operand.freeText` from `conditionLogic.ts`. Its named consumer
  branches on `celType` and `options`, never on the flag.
- Replace `migrationPlanLogic.ts`'s module-level `rowCounter` with
  `crypto.randomUUID()`, the convention `draft/ids.ts::mintId` already sets.
- Delete `fieldValidationLogic.ts`'s `EVERY_KEY` alias and return `ALL_KEYS`
  at both sites.

This change drops audit finding 10. The audit says `Intl.RelativeTimeFormat`
covers `waitingLabel`'s minute, hour and day buckets. It does not.

The current output is `"5m"`, `"3h"`, `"2d"` and `"just now"`. Five tests pin
those strings. `Intl.RelativeTimeFormat` has no style that renders `"5m"`. Its
narrow style renders `"5 min. ago"`. Adopting it would change what a
participant reads. It would also drop four catalog keys in two locales and
rewrite five tests. That is a redesign of the inbox's waiting badge, not a
standard-library substitution.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `spa-accessibility`: a form states a required field natively, rather than
  through a submit button that goes disabled and gives no reason.

The other eight findings get no requirement. Each is a single-file
simplification with no user-visible behavior. The specs naming those screens
already state what the screens do.

## Impact

- `packages/web/src/areas/studio/screens/draftToolbarState.ts` gains
  `isDirty`. `publishGateLogic.ts` goes.
- `packages/web/src/areas/studio/panels/DraftToolbar.tsx`. One import, one
  dispatch shape.
- `packages/web/src/areas/studio/screens/versionDiffLogic.ts` and
  `VersionsScreen.tsx`.
- `packages/web/src/shell/LoginScreen.tsx`, `session.ts`, `App.tsx` and
  `catalog.ts`.
- `packages/web/src/areas/app/catalog.ts`.
- `packages/web/src/areas/studio/panels/shared/conditionLogic.ts` and
  `fieldValidationLogic.ts`.
- `packages/web/src/areas/studio/screens/migrationPlanLogic.ts`.
- `packages/web/test/studio-publishGateLogic.test.ts`,
  `studio-draftToolbarState.test.ts`, `studio-dataListKeysLogic.test.ts`,
  `studio-versionDiffLogic.test.ts` and `studio-conditionLogic.test.ts`.
- `openspec/specs/spa-accessibility/spec.md`. One new requirement.
- `docs/current-state.md`. One new section.
- No engine change. No route change. No JSON definition change.
