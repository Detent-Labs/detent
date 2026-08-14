## 1. The list read

- [x] 1.1 Widen `listDataListKeys` in
  `packages/web/src/areas/studio/api/client.ts` to return each list's
  `columns` beside its `listKey`. Rename it `listDataLists`.
- [x] 1.2 Add `useDataLists(token)` to `panels/shared/`, in the shape
  `useRegistry` beside it already takes.
- [x] 1.3 Have `DataSourcesPanel.tsx` read the hook rather than fetching for
  itself. Its own picker still uses the keys alone.
- [x] 1.4 Pass `token` to `FieldCatalogPanel` from `PanelsScreen`, the way it
  already passes one to `DataSourcesPanel`.

## 2. The helpers

- [x] 2.1 Add `columnMappingRows` beside `FieldCatalogPanel.tsx`. It takes a
  field, the draft's sources and the fetched lists.
- [x] 2.2 It returns one row per mapped key, each with its target. It marks a
  key the bound list no longer declares.
- [x] 2.3 It returns the bound list's declared keys, so the picker offers what
  the list holds.
- [x] 2.4 Add `mappableTargets`. It returns every catalog field except a group
  field and the mapping field itself.
- [x] 2.5 Add `showsColumnMapping`. It answers true for a `select` field
  bound to a `"db.list"` source, and false otherwise.

## 3. Helper tests

- [x] 3.1 In a new `packages/web/test/studio-columnMappingLogic.test.ts`,
  assert a mapped key returns a row carrying its target.
- [x] 3.2 Assert a key the list no longer declares returns a marked row.
- [x] 3.3 Assert the declared keys come back for the bound list, and not
  another list's.
- [x] 3.4 Assert `mappableTargets` omits a group field and the mapping field.
- [x] 3.5 Assert `showsColumnMapping` refuses a `multiselect`, an
  inline-options field, and a field bound to no `"db.list"` source.

## 4. The editor

- [x] 4.1 Render the editor in `FieldRow`'s options fieldset, under the
  `dataSource` picker, when `showsColumnMapping` answers true.
- [x] 4.2 Render one row per entry: a column picker, then a field picker over
  `mappableTargets`.
- [x] 4.3 Mark a row whose key the bound list no longer declares.
- [x] 4.4 Offer Add and Remove. Removing the last row leaves no
  `columnMapping` key, rather than an empty object.
- [x] 4.5 State in words where the bound list declares no column. No empty
  picker stands in for that sentence.
- [x] 4.6 Write through the draft store, as every other control in the panel
  does. Add no validation of your own.

## 5. Styling and wording

- [x] 5.1 Add the editor's wording to
  `packages/web/src/i18n/catalogs/studio.ts`. That catalog is EN-only.
- [x] 5.2 Style the rows as the register the design language sets. Ruled
  rows, no radius, the column key in the mono face.

## 6. Documentation

- [x] 6.1 Record the work in `ROADMAP.md`, under stage 29, as the builder it
  deferred.
- [x] 6.2 Add the editor to the studio section of `docs/current-state.md`.
- [x] 6.3 Add the browser walk to `docs/browser-checks.md`. Map a column,
  drop it from the list, and read the marked row.
- [x] 6.4 Move item 12 to `ARCHIVED` in `tmp/open-work-priority.md`, and note
  that the queue is empty.

## 7. Verification

- [x] 7.1 `bun run typecheck`, then `bun run build`.
- [x] 7.2 Full `bun test` with `DATABASE_URL` set. Read the skip count beside
  the pass count.
- [x] 7.3 The antislop linter over every Markdown file this work touched.
- [x] 7.4 `git diff --check`, and `git ls-files --eol` for a CR in the `w/`
  column.
- [x] 7.5 A real browser. Build a mapping, publish, and confirm a picked row
  fills the mapped field.
- [x] 7.6 In the browser, map two columns onto one field. The checks rail
  reports the duplicate, and the editor accepts both rows.
