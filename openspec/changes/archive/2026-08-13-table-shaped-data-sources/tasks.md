## 1. Contract

- [x] 1.1 Add `attributes?: Record<string, string | number | boolean>` to
  `fieldOption` in `src/schema/definition.ts`, and export the attribute value
  type.
- [x] 1.2 Add `columnMapping?: Record<string, FieldId>` to `FieldDef` and to
  `fieldDef` in `src/schema/definition.ts`.
- [x] 1.3 Add the `columnMapping` checks to `src/schema/compile.ts`. Seven
  rules, each rejecting a body:
  - [x] 1.3.1 A `dataSource` is absent.
  - [x] 1.3.2 `type` is not `select`.
  - [x] 1.3.3 A key breaks the key grammar or the length bound.
  - [x] 1.3.4 A target resolves nowhere in the recursive field set.
  - [x] 1.3.5 A target is the field itself.
  - [x] 1.3.6 A target is a `group` field.
  - [x] 1.3.7 Two keys name one target.
- [x] 1.4 Test: a body carrying `attributes` and `columnMapping` reports no
  unknown-key failure. `FIELD_OPTION_KEYS` and `FIELD_DEF_KEYS` derive from
  `shapeKeys()`. The test pins that derivation, and adds no key list.
- [x] 1.5 Test: a body with inline options and no `attributes` hashes to the
  value it hashed before this change.
- [x] 1.6 Test: each rule in 1.3 rejects a violating body, one test per rule.
- [x] 1.7 Test: an option whose attribute value is an object fails to parse.

## 2. Persistence and the handler

- [x] 2.1 Add `columns jsonb NOT NULL DEFAULT '[]'` to `data_lists` and
  `attributes jsonb NOT NULL DEFAULT '{}'` to `data_list_values` in
  `src/engine/store.ts`, with both the create and the add-column form.
- [x] 2.2 Define `MAX_DATA_LIST_COLUMNS = 10` in `src/engine/host.ts`, and the
  column entry schema `{ key, label, type }`.
- [x] 2.3 Project `attributes` in the `"db.list"` query. Walk the list's
  `columns` declaration, and look each key up in the row's stored map. Never
  walk the stored map. Postgres normalizes a `jsonb` object's key order.
- [x] 2.4 Return no `attributes` key at all when the list declares no columns.
- [x] 2.5 Test: an option carries its attributes, and an unfilled column
  produces no entry.
- [x] 2.5.1 Test: a list declares a long key before a short one. `jsonb` stores
  that pair in the reverse order. The resolution follows the declaration.
- [x] 2.6 Test: a list with no columns resolves exactly as before.
- [x] 2.7 Test: a retired value that `heldValues` names comes back with its
  attributes.

## 3. Operator API

- [x] 3.1 Accept and return `columns` on `POST /admin/data-lists`,
  `PUT /admin/data-lists/:listKey`, `GET /admin/data-lists/:listKey` and
  `GET /admin/data-lists`, in `src/http/admin-routes.ts`.
- [x] 3.2 Reject a malformed key, a duplicate key, an unknown type and a count
  over `MAX_DATA_LIST_COLUMNS`, writing nothing on rejection.
- [x] 3.3 Treat an omitted `columns` as "leave it", and an empty array as
  "clear it".
- [x] 3.4 Drop a removed column's attribute from every value of the list, in
  the declaration write's own transaction.
- [x] 3.5 Accept and return `attributes` per value on
  `PUT /admin/data-lists/:listKey/values` and the detail route.
- [x] 3.6 Reject an undeclared attribute key and a value whose type does not
  match its column, writing nothing on rejection.
- [x] 3.7 Keep the attributes of a value the request omits, which the route
  retires rather than deletes.
- [x] 3.8 Test each scenario in the `data-list-administration` delta.

## 4. The write-back

- [x] 4.1 Return the `ResolvedViewField[]` from `validateSubmissionData` in
  `src/runtime/api.ts`, and keep every existing caller compiling.
- [x] 4.2 Add the write-back. For each written field carrying a
  `columnMapping`, find the picked option. Read each mapped attribute from it.
  Check that value against the target field's declared type. Write a match into
  `data`.
- [x] 4.3 Let a mapped target take the mapped value over a submitted one. The
  view's readonly and visibility rules lose too.
- [x] 4.4 Walk the `ResolvedViewField[]` from 4.1, which carries the step's
  view order. Never walk the request's own key order.
- [x] 4.5 Call the write-back from `submitAndTransition`, after validation and
  before `commitManualTransition`.
- [x] 4.6 Call it from `createProcessInstance`, after validation and before
  `resolveStepAssignment`, so a strategy reads the mapped data.
- [x] 4.7 Add one more optional argument, `events: InstanceEvent[]`, to
  `commitManualTransition` (`src/engine/transition.ts:488`). It goes after
  `assignmentRegistry`, and `executeManualTransition` passes it through. Every
  existing caller keeps compiling.
- [x] 4.8 Test each scenario in the `runtime-api` delta. The
  guard-on-the-same-hop case and the two-picker order case are the load-bearing
  ones.

## 5. The event

- [x] 5.1 Add the `datasource.attribute-dropped` kind to the `InstanceEvent`
  union, with payload `{ fieldId, column, targetFieldId, reason }` and reason
  `"type-mismatch"`.
- [x] 5.2 Record a drop in the commit's own transaction, carrying the `version`
  and `transitionSeq` in force and advancing neither.
- [x] 5.3 Test: the event lands, carries no `ActionOutcome`s, does not advance
  the sequence, and does not survive a rolled-back commit.

## 6. The renderer

- [x] 6.1 Compose an option's attribute values into its text in
  `packages/form-ui/src/FieldForm.tsx`, for `select` and `multiselect` alike.
- [x] 6.2 Format a number and a boolean through the locale's own formatter, and
  separate the segments with one visible separator.
- [x] 6.3 Test: an option with attributes, one without, and one whose list
  declares a column it does not fill.

## 7. The admin screen

- [x] 7.1 Add `columns` to `DataListSummary` and `DataListDetail`, and
  `attributes` to `DataListValue`, in
  `packages/web/src/areas/admin/api/types.ts`.
- [x] 7.2 Carry `columns` through `createDataList` and `updateDataList`, and
  `attributes` through `putDataListValues`, in
  `packages/web/src/areas/admin/api/client.ts`.
- [x] 7.3 Read the design skills before any screen work:
  `/frontend-design:frontend-design`, plus `.claude/rules/design-language.md`
  and `.claude/rules/ui-glossary.md`.
- [x] 7.4 Add the column editor to
  `packages/web/src/areas/admin/screens/DataListScreen.tsx`. Each row carries a
  key input, a label input and a type picker. The editor adds and removes a
  row.
- [x] 7.5 Warn before a save that removes a column, naming the values it drops.
- [x] 7.6 Add one attribute input per declared column to each value row, typed
  by the column. An inactive value's attributes stay readonly.
- [x] 7.7 Add every new string to the admin EN and DE catalogs.
- [x] 7.8 Report a rejected write where the data sits, following the area's
  existing failure pattern.
- [x] 7.9 Test the screen's logic module, the way
  `packages/web/test/admin-dataListsLogic.test.ts` already tests its siblings.

## 8. Documentation

- [x] 8.1 State the mapping rule in `docs/authoring-guide.md`, the
  mapping-beats-submission rule included.
- [x] 8.2 Add the `attributes` key to the view's option schema in
  `docs/openapi.yaml`.
- [x] 8.3 Record the work in `ROADMAP.md` as stage 29, and in
  `docs/current-state.md`.
- [x] 8.4 Add the browser walk to `docs/browser-checks.md`. Declare a column
  and fill it. Publish a mapping through the JSON surface. Pick a row, and read
  the mapped field.
- [x] 8.5 Move item 6 to `ARCHIVED` in `tmp/open-work-priority.md`. Add two new
  items. One is the field catalog's `columnMapping` editor, held behind item
  10. The other is the admin route reporting which processes map a column.
- [x] 8.6 Change the kind table and its count by hand, in the Purpose section
  of `openspec/specs/runtime-events/spec.md`. A delta does not reach a Purpose
  section.
- [x] 8.7 Amend the CEL-readable data-source deferral in `docs/decisions.md`. A
  mapped attribute now reaches `data`, and CEL reads it there.

## 9. Verification

- [x] 9.1 `bun run typecheck`, then `bun run build`.
- [x] 9.2 Full `bun test` with `DATABASE_URL` set, reading the skip count as
  well as the pass count.
- [x] 9.3 The antislop linter over every Markdown file this change touched.
- [x] 9.4 `git diff --check`, plus `git ls-files --eol` for a CR in the
  worktree.
- [x] 9.5 Walk the browser check from 8.4 against a real server.
