## Why

Dropping a column from a data list drops that column's value from every value
of the list. It can also break a published process that maps the column into a
form field. The detail screen warns about the first half. It says nothing about
the second.

Its usage report answers "which processes read this list". It never answers
"which processes map this column".

Stage 29 raised the question and deferred it. The answer was worth taking after
an operator had used the screen once. That has happened, and this change is the
answer.

## What Changes

- `GET /admin/data-lists/:listKey` reports the mapped column keys with each
  entry of its usage report. An entry that reads the list and maps no column
  reports an empty set. That is the shape a body written before stage 29
  carries.
- The detail screen names those column keys beside each process in the "Used
  by" section.
- The column-removal warning names the published processes that map a dropped
  column. That is the moment the report changes a decision. The data reaches
  the operator at the destructive act, rather than in a section further down
  the page.

No new route, no schema change, no engine change. The delete guard keeps its
rule. It refuses on any reference, mapped or not.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `data-list-administration`: the detail route's usage report gains the column
  keys each process maps.
- `admin-app`: the data list detail screen shows those keys, and the
  column-removal warning names the processes that map the dropped column.

## Impact

- `src/http/admin-routes.ts`: `referencingProcesses` gains the mapped column
  keys. The scan already walks `body->'dataSources'`. It now also walks the
  body's fields, which nest, so a group's children count.
- `packages/web/src/areas/admin/api/types.ts`: `DataListUsage` gains the keys.
- `packages/web/src/areas/admin/screens/DataListScreen.tsx`: the "Used by"
  list and the removal warning.
- `packages/web/src/i18n/catalogs/admin.ts`: new keys in EN and DE.
- Tests: `test/http-data-lists.test.ts` for the route, and
  `packages/web/test/admin-dataListsLogic.test.ts` for the warning's own
  computation. That first file already asserts the exact usage entry with
  `toEqual`, so the added key breaks it until the assertion changes.
- Documentation: `ROADMAP.md` under stage 29, the data list section of
  `docs/current-state.md`, a walk in `docs/browser-checks.md`, and item 13 in
  `tmp/open-work-priority.md`.
- `docs/openapi.yaml` carries no `/admin/data-lists` path, so it stays as it
  is.
