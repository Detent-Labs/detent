## Why

`PONYTAIL-AUDIT.md`'s 2026-08-15 scan carries four small findings: 6, 8, 9
and 10. Each is too small to justify its own OpenSpec change. The audit
itself flags them as ready to ride along together.

They are two near-identical fetch-once hooks and a hand-rolled loop the
standard library already covers. The third is a two-statement wrapper with a
single caller. The fourth is a dynamic import next to a static one in the
same file. None of the four changes behavior. Each removes a small, literal
duplication or indirection.

## What Changes

- Collapse `packages/web/src/areas/studio/panels/shared/useDataLists.ts` and
  `useRegistry.ts`'s identical fetch-once-per-mount pattern (`useState` +
  `useEffect` with a `live` flag, `.then`/`.catch`/cleanup) into one shared
  `useFetchOnce(token, fetcher)` hook; both existing hooks call it.
- Replace `playerLogic.ts`'s `seedFormValues` hand-rolled `for` loop with
  `Object.fromEntries(fields.map((f) => [f.field.id, f.value]))`.
- Leave `processListLogic.ts`'s `templateDraftInput` unchanged. Deleting it
  would drop test coverage with nowhere for it to land. Finding 9 does not
  land in this change.
- Add `listTenants` to the static `tenantByKey` import from `./store.js` in
  `src/tenancy/connections.ts`. Drop the `await import("./store.js")`
  dynamic import in `createTenantConnections`'s default for `listAll`.
  Nothing there defers a load or breaks a cycle.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. All four changes are internal refactors: same inputs, same outputs,
no observable behavior change, no schema or definition-contract touch. Marked
`skip_specs: true`.

## Impact

- `packages/web/src/areas/studio/panels/shared/useDataLists.ts`,
  `useRegistry.ts` (both edited), new `useFetchOnce.ts` alongside them.
- `packages/web/src/areas/studio/screens/playerLogic.ts` (edited, existing
  test kept).
- This change does not touch
  `packages/web/src/areas/studio/screens/processListLogic.ts` or
  `ProcessesScreen.tsx`. `templateDraftInput` and its existing tests in
  `packages/web/test/studio-processListLogic.test.ts` stay as they are.
- `src/tenancy/connections.ts` (one import line).
- No API, schema, or dependency changes. No new files beyond `useFetchOnce.ts`.
