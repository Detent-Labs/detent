## 1. Schema

- [x] 1.1 Add `data_lists` and `data_list_values` to `initSchema` in `src/engine/store.ts`, with the `ON DELETE CASCADE` reference
- [x] 1.2 Test that both relations exist after `initSchema`, and that a second run raises nothing
- [x] 1.3 Test that deleting a `data_lists` row takes its values with it

## 2. The db.list handler

- [x] 2.1 Add `heldValues?: string[]` to `DataSourceContext` in `src/engine/registry.ts`
- [x] 2.2 Add `MAX_DATA_LIST_VALUES` (500) beside the handler
- [x] 2.3 Give `createDefaultDataSourceRegistry` a `db: SQL = sql` parameter in `src/engine/host.ts`, and thread it from `src/http/server.ts`; `scripts/seed.ts` keeps the default
- [x] 2.4 Register `"db.list"` with a `configSchema` of `{ listKey }`, bounded by `MAX_KEY_LENGTH`
- [x] 2.5 Implement `resolve`: one `SELECT` filtered by `active OR value = ANY(heldValues)`, ordered by `sort_order` then `value`, reading `MAX_DATA_LIST_VALUES + 1` rows
- [x] 2.6 Throw a plain `Error` naming the `listKey` when the row count passes the bound
- [x] 2.7 Throw a plain `Error` naming the `listKey` when `data_lists` holds no such row
- [x] 2.8 Test the four resolve cases: an active value, an inactive value nobody holds, an inactive value `heldValues` names, and the ordering
- [x] 2.9 Test the two canary errors, one per cause
- [x] 2.10 Test that the `"static"` handler ignores `heldValues`

## 3. Runtime resolution

- [x] 3.1 In `resolveFields` (`src/runtime/api.ts`), collect the values the instance holds for the field and pass them as `heldValues`
- [x] 3.2 Extend the memo key from `DataSourceId` to `DataSourceId` plus those values, sorted
- [x] 3.3 Test that a `select` contributes one held value and a `multiselect` contributes its whole array
- [x] 3.4 Test that two fields sharing a data source resolve once when their held values match, and twice when they differ
- [x] 3.5 Test that a retired value the instance holds survives a resubmission of the unchanged step, with `optionValuesValid` untouched

## 4. Publish-time validation

- [x] 4.1 Confirm `checkDataSourceRegistry` covers `"db.list"` with no change, since it validates type and config alone
- [x] 4.2 Test that a body naming a `listKey` with no row publishes
- [x] 4.3 Test that a body whose `"db.list"` config carries no `listKey` fails the publish

## 5. Role and routes

- [x] 5.1 Add `DATALISTS_ROLE` to `src/auth/authorize.ts`
- [x] 5.2 Extend the reserved-role export test to the sixth constant
- [x] 5.3 Test that the new role implies none of the others, and that none of them implies it
- [x] 5.4 Add handlers for the overview, creation, detail, and metadata routes in `src/http/admin-routes.ts`
- [x] 5.5 Add `PUT /admin/data-lists/:listKey/values`, replacing the set, deactivating what the request omits, reactivating what it names
- [x] 5.6 Reject a value set over `MAX_DATA_LIST_VALUES` or naming one value twice, writing nothing
- [x] 5.7 Add `DELETE /admin/data-lists/:listKey`, refusing when a published body references the key
- [x] 5.8 Make `GET /admin/data-lists/:listKey` report the referencing processes from `definitions`
- [x] 5.9 Register the six routes in `src/http/server.ts`
- [x] 5.10 Test the write rules: omission deactivates, a returning value reactivates, and no row ever disappears
- [x] 5.11 Test the delete guard, both directions
- [x] 5.12 Test the role gate on every route, including a developer who reads but cannot write

## 6. Studio picker

- [x] 6.1 Make `DataSourcesPanel` offer the server's `listKey` values for a `"db.list"` data source
- [x] 6.2 Warn, never fail, when a draft names a key the server does not report
- [x] 6.3 Test that the warning leaves publishing possible

## 7. Shell area gate

- [x] 7.1 Make `REQUIRED_ROLE` in `packages/web/src/shell/areas.ts` carry a readonly role array per area, with `admin` holding `system:admin` and `system:datalists`
- [x] 7.2 Make `mayEnter` admit an actor holding any role of that area's set. An empty set still means "a session is enough"
- [x] 7.3 Test that `system:datalists` alone enters `/admin`, that it enters no other gated area, and that `landingArea` still prefers a gated area
- [x] 7.4 Test that the area switcher lists the admin area for a `system:datalists` actor

## 8. Admin screens

- [x] 8.1 Run `/frontend-design:frontend-design` and the Vercel skills before writing either screen, per CLAUDE.md
- [x] 8.2 Add `dataListsLogic.ts` with the logic that needs no React: duplicate values, the size bound, empty labels
- [x] 8.3 Add the six calls to `packages/web/src/areas/admin/api/client.ts` with their types in `api/types.ts`
- [x] 8.4 Add `DataListsScreen.tsx`, the overview
- [x] 8.5 Add `DataListScreen.tsx`: label, description, the value table, and the usage report
- [x] 8.6 Mark an inactive value as inactive rather than hiding it
- [x] 8.7 Add both routes to `routing.ts` (the `Route` union, `matchRoute`, `routePath`) and the navigation entry in `root.tsx`
- [x] 8.8 Gate both screens on `system:datalists`, and the operations screens on `system:admin`, reusing the area's empty state for a missing role
- [x] 8.9 Test `dataListsLogic.ts`
- [x] 8.10 Test `matchRoute` and `routePath` for both new routes

## 9. Documentation

- [x] 9.1 Describe the `"db.list"` type in `docs/authoring-guide.md`, beside the existing data source material
- [x] 9.2 Record the new subsystem in `docs/current-state.md`
- [x] 9.3 Narrow the CLAUDE.md "second data-source type" entry to an I/O-backed type that leaves the database
- [x] 9.4 Keep that entry's timeout question open, and name `"db.list"` as the type that shipped
- [x] 9.5 Record in `docs/current-state.md` that the admin area now admits two roles

## 10. Verification

- [x] 10.1 Run the full suite in the devcontainer with `DATABASE_URL` set
- [x] 10.2 Read the skip count of that run, not the pass count alone
- [x] 10.3 Run `bun run typecheck`
