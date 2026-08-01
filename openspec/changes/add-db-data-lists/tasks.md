## 1. Schema

- [ ] 1.1 Add `data_lists` and `data_list_values` to `initSchema` in `src/engine/store.ts`, with the `ON DELETE CASCADE` reference
- [ ] 1.2 Test that both relations exist after `initSchema`, and that a second run raises nothing
- [ ] 1.3 Test that deleting a `data_lists` row takes its values with it

## 2. The db.list handler

- [ ] 2.1 Add `heldValues?: string[]` to `DataSourceContext` in `src/engine/registry.ts`
- [ ] 2.2 Add `MAX_DATA_LIST_VALUES` (500) beside the handler
- [ ] 2.3 Give `createDefaultDataSourceRegistry` a `db: SQL = sql` parameter in `src/engine/host.ts`, and thread it at every call site
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
- [ ] 5.2 Add handlers for the overview, creation, detail, and metadata routes in `src/http/admin-routes.ts`
- [ ] 5.3 Add `PUT /admin/data-lists/:listKey/values`, replacing the set, deactivating what the request omits, reactivating what it names
- [ ] 5.4 Reject a value set over `MAX_DATA_LIST_VALUES` or naming one value twice, writing nothing
- [ ] 5.5 Add `DELETE /admin/data-lists/:listKey`, refusing when a published body references the key
- [ ] 5.6 Make `GET /admin/data-lists/:listKey` report the referencing processes from `definitions`
- [ ] 5.7 Register the six routes in `src/http/server.ts`
- [ ] 5.8 Test the write rules: omission deactivates, a returning value reactivates, and no row ever disappears
- [ ] 5.9 Test the delete guard, both directions
- [ ] 5.10 Test the role gate on every route, including a developer who reads but cannot write

## 6. Studio picker

- [ ] 6.1 Make `DataSourcesPanel` offer the server's `listKey` values for a `"db.list"` data source
- [ ] 6.2 Warn, never fail, when a draft names a key the server does not report
- [ ] 6.3 Test that the warning leaves publishing possible

## 7. Admin screens

- [ ] 7.1 Run `/frontend-design:frontend-design` and the Vercel skills before writing either screen, per CLAUDE.md
- [ ] 7.2 Add `dataListsLogic.ts` with the logic that needs no React: duplicate values, the size bound, empty labels
- [ ] 7.3 Add `DataListsScreen.tsx`, the overview
- [ ] 7.4 Add `DataListScreen.tsx`: label, description, the value table, and the usage report
- [ ] 7.5 Mark an inactive value as inactive rather than hiding it
- [ ] 7.6 Gate both screens on `system:datalists`, reusing the area's empty state for a missing role
- [ ] 7.7 Test `dataListsLogic.ts`

## 8. Documentation and verification

- [ ] 8.1 Describe the `"db.list"` type in `docs/authoring-guide.md`, beside the existing data source material
- [ ] 8.2 Record the new subsystem in `docs/current-state.md`
- [ ] 8.3 Move the "second data-source type" entry out of the CLAUDE.md "Decided, not yet built" list
- [ ] 8.4 Run the full suite in the devcontainer with `DATABASE_URL` set
- [ ] 8.5 Read the skip count of that run, not the pass count alone
- [ ] 8.5 Run `bun run typecheck`
