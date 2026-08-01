## 1. Schema

- [ ] 1.1 Add `data_lists` and `data_list_values` to `initSchema` in `src/engine/store.ts`, with the `ON DELETE CASCADE` reference
- [ ] 1.2 Test that both relations exist after `initSchema`, and that a second run raises nothing
- [ ] 1.3 Test that deleting a `data_lists` row takes its values with it

## 2. The db.list handler

- [ ] 2.1 Add `heldValues?: string[]` to `DataSourceContext` in `src/engine/registry.ts`
- [ ] 2.2 Add `MAX_DATA_LIST_VALUES` (500) beside the handler
- [ ] 2.3 Give `createDefaultDataSourceRegistry` a `db: SQL = sql` parameter in `src/engine/host.ts`, and thread it from `src/http/server.ts`; `scripts/seed.ts` keeps the default
- [ ] 2.4 Register `"db.list"` with a `configSchema` of `{ listKey }`, bounded by `MAX_KEY_LENGTH`
- [ ] 2.5 Implement `resolve`: one `SELECT` filtered by `active OR value = ANY(heldValues)`, ordered by `sort_order` then `value`, reading `MAX_DATA_LIST_VALUES + 1` rows
- [ ] 2.6 Throw a plain `Error` naming the `listKey` when the row count passes the bound
- [ ] 2.7 Throw a plain `Error` naming the `listKey` when `data_lists` holds no such row
- [ ] 2.8 Test the four resolve cases: an active value, an inactive value nobody holds, an inactive value `heldValues` names, and the ordering
- [ ] 2.9 Test the two canary errors, one per cause
- [ ] 2.10 Test that the `"static"` handler ignores `heldValues`

## 3. Runtime resolution

- [ ] 3.1 In `resolveFields` (`src/runtime/api.ts`), collect the values the instance holds for the field and pass them as `heldValues`
- [ ] 3.2 Extend the memo key from `DataSourceId` to `DataSourceId` plus those values, sorted
- [ ] 3.3 Test that a `select` contributes one held value and a `multiselect` contributes its whole array
- [ ] 3.4 Test that two fields sharing a data source resolve once when their held values match, and twice when they differ
- [ ] 3.5 Test that a retired value the instance holds survives a resubmission of the unchanged step, with `optionValuesValid` untouched

## 4. Publish-time validation

- [ ] 4.1 Confirm `checkDataSourceRegistry` covers `"db.list"` with no change, since it validates type and config alone
- [ ] 4.2 Test that a body naming a `listKey` with no row publishes
- [ ] 4.3 Test that a body whose `"db.list"` config carries no `listKey` fails the publish

## 5. Role and routes

- [ ] 5.1 Add `DATALISTS_ROLE` to `src/auth/authorize.ts`
- [ ] 5.2 Extend the reserved-role export test to the sixth constant
- [ ] 5.3 Test that the new role implies none of the others, and that none of them implies it
- [ ] 5.4 Add handlers for the overview, creation, detail, and metadata routes in `src/http/admin-routes.ts`
- [ ] 5.5 Add `PUT /admin/data-lists/:listKey/values`, replacing the set, deactivating what the request omits, reactivating what it names
- [ ] 5.6 Reject a value set over `MAX_DATA_LIST_VALUES` or naming one value twice, writing nothing
- [ ] 5.7 Add `DELETE /admin/data-lists/:listKey`, refusing when a published body references the key
- [ ] 5.8 Make `GET /admin/data-lists/:listKey` report the referencing processes from `definitions`
- [ ] 5.9 Register the six routes in `src/http/server.ts`
- [ ] 5.10 Test the write rules: omission deactivates, a returning value reactivates, and no row ever disappears
- [ ] 5.11 Test the delete guard, both directions
- [ ] 5.12 Test the role gate on every route, including a developer who reads but cannot write

## 6. Studio picker

- [ ] 6.1 Make `DataSourcesPanel` offer the server's `listKey` values for a `"db.list"` data source
- [ ] 6.2 Warn, never fail, when a draft names a key the server does not report
- [ ] 6.3 Test that the warning leaves publishing possible

## 7. Shell area gate

- [ ] 7.1 Make `REQUIRED_ROLE` in `packages/web/src/shell/areas.ts` carry a readonly role array per area, with `admin` holding `system:admin` and `system:datalists`
- [ ] 7.2 Make `mayEnter` admit an actor holding any role of that area's set. An empty set still means "a session is enough"
- [ ] 7.3 Test that `system:datalists` alone enters `/admin`, that it enters no other gated area, and that `landingArea` still prefers a gated area
- [ ] 7.4 Test that the area switcher lists the admin area for a `system:datalists` actor

## 8. Admin screens

- [ ] 8.1 Run `/frontend-design:frontend-design` and the Vercel skills before writing either screen, per CLAUDE.md
- [ ] 8.2 Add `dataListsLogic.ts` with the logic that needs no React: duplicate values, the size bound, empty labels
- [ ] 8.3 Add the six calls to `packages/web/src/areas/admin/api/client.ts` with their types in `api/types.ts`
- [ ] 8.4 Add `DataListsScreen.tsx`, the overview
- [ ] 8.5 Add `DataListScreen.tsx`: label, description, the value table, and the usage report
- [ ] 8.6 Mark an inactive value as inactive rather than hiding it
- [ ] 8.7 Add both routes to `routing.ts` (the `Route` union, `matchRoute`, `routePath`) and the navigation entry in `root.tsx`
- [ ] 8.8 Gate both screens on `system:datalists`, and the operations screens on `system:admin`, reusing the area's empty state for a missing role
- [ ] 8.9 Test `dataListsLogic.ts`
- [ ] 8.10 Test `matchRoute` and `routePath` for both new routes

## 9. Documentation

- [ ] 9.1 Describe the `"db.list"` type in `docs/authoring-guide.md`, beside the existing data source material
- [ ] 9.2 Record the new subsystem in `docs/current-state.md`
- [ ] 9.3 Narrow the CLAUDE.md "second data-source type" entry to an I/O-backed type that leaves the database
- [ ] 9.4 Keep that entry's timeout question open, and name `"db.list"` as the type that shipped
- [ ] 9.5 Record in `docs/current-state.md` that the admin area now admits two roles

## 10. Verification

- [ ] 10.1 Run the full suite in the devcontainer with `DATABASE_URL` set
- [ ] 10.2 Read the skip count of that run, not the pass count alone
- [ ] 10.3 Run `bun run typecheck`
