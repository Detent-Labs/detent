## 1. The route

- [x] 1.1 Widen `referencingProcesses` in `src/http/admin-routes.ts` to select
  `body` beside `process_id` and `version`.
- [x] 1.2 Derive the mapped column keys per row. Collect the ids of the body's
  `"db.list"` sources naming this list.
- [x] 1.3 Walk the body's fields with `collectFieldsDeep` from
  `src/schema/definition.ts`. Keep a field whose `dataSource` is one of them.
- [x] 1.4 Hold the keys in a `Set`, so two fields mapping one column report it
  once. Sort them, because jsonb drops the author's order.
- [x] 1.5 Normalize the jsonb `body` through `parseJsonb` before reading it,
  the rule every other jsonb read here takes.
- [x] 1.6 Confirm the delete guard still reads `.length` alone, and that it
  keeps its refusal message.
- [x] 1.7 Report an empty key set for a body that does not read as an object
  with an array `fields`. The row still appears.
- [x] 1.8 Report a mapped key the list no longer declares. No rule checks a
  key against the declaration.

## 2. Route tests

- [x] 2.0 Amend the existing detail-route assertion in
  `test/http-data-lists.test.ts` to carry the new key.
- [x] 2.1 In `test/http-data-lists.test.ts`, assert a mapped column key
  reaches the detail response.
- [x] 2.2 Assert a referencing body that maps nothing reports an empty set.
- [x] 2.3 Assert a mapping on a field nested in a group field counts.
- [x] 2.4 Assert a mapping of another list's column stays out of this list's
  entry.
- [x] 2.5 Assert two fields mapping one column report that column once.
- [x] 2.6 Assert the delete guard still refuses a referencing list, mapped or
  not.
- [x] 2.7 Assert a mapped key the list no longer declares reaches the
  response.

## 3. The screen

- [x] 3.1 Add the keys to `DataListUsage` in
  `packages/web/src/areas/admin/api/types.ts`.
- [x] 3.2 Add `mappingProcesses` to
  `packages/web/src/areas/admin/screens/dataListsLogic.ts`, beside
  `droppedColumns`.
- [x] 3.3 It takes the dropped keys and the usage report. It returns the
  distinct process ids, one entry per process.
- [x] 3.4 Show the mapped keys beside each process in the "Used by" list, in
  the mono face. They are machine values.
- [x] 3.5 Show a sentence where a process maps no column. No empty area stands
  in for it.
- [x] 3.6 Join the second confirm sentence onto `dataList.dropColumnConfirm`
  when `mappingProcesses` returns any id.

## 4. Catalog

- [x] 4.1 Add the mapped-columns label and the maps-nothing sentence to
  `packages/web/src/i18n/catalogs/admin.ts`, in EN and DE.
- [x] 4.2 Add the process sentence for the removal warning, in EN and DE. It
  is a whole sentence, not a fragment.

## 5. Screen tests

- [x] 5.1 In `packages/web/test/admin-dataListsLogic.test.ts`, assert
  `mappingProcesses` names a process that maps a dropped column.
- [x] 5.2 Assert a process mapping two dropped columns appears once.
- [x] 5.3 Assert a dropped column no process maps returns no id.

## 6. Documentation

- [x] 6.1 Record the work in `ROADMAP.md`, under stage 29, as the answer to
  its first open question.
- [x] 6.2 Change the data list route's description in
  `docs/current-state.md`. State that the guard now reads bodies it discards,
  and why the shared function keeps both callers.
- [x] 6.3 Add the browser walk to `docs/browser-checks.md`. Map a column,
  publish, then read the section and drop the column.
- [x] 6.4 Move item 13 to `ARCHIVED` in `tmp/open-work-priority.md`, and write
  its own section there.

## 7. Verification

- [x] 7.1 `bun run typecheck`, then `bun run build`.
- [x] 7.2 Full `bun test` with `DATABASE_URL` set. Read the skip count beside
  the pass count.
- [x] 7.3 The antislop linter over every Markdown file this change touched.
- [x] 7.4 `git diff --check`, and `git ls-files --eol` for a CR in the `w/`
  column.
- [x] 7.5 The browser check from 6.3, on a real browser, in EN and DE.
