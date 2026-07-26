## 1. Shared helper

- [x] 1.1 Create `packages/editor/src/draft/list-ops.ts` exporting
      `removeAt<T>(list, index)` and `updateAt<T>(list, index, patch)` per
      `design.md`.

## 2. Call-site migration

- [x] 2.1 `PathsPanel.tsx`: delegate `removePath`/`updatePath` to
      `removeAt`/`updateAt`.
- [x] 2.2 `TimersPanel.tsx`: delegate `removeTimer`/`updateTimer` to
      `removeAt`/`updateAt`.
- [x] 2.3 `ViewEditor.tsx`: delegate `removeRow`/`updateRow` to
      `removeAt`/`updateAt`.
- [x] 2.4 `ActionListEditor.tsx`: delegate `removeAction`/`updateAction` to
      `removeAt`/`updateAt`.
- [x] 2.5 `FieldCatalogPanel.tsx` (option rows): delegate
      `removeOption`/`updateOption` to `removeAt`/`updateAt`.
- [x] 2.6 `FieldCatalogPanel.tsx` (sub-field rows): delegate
      `removeSubField`/`updateSubField` to `removeAt`/`updateAt`.

## 3. Manual verification

- [x] 3.1 In the dev server, add, edit, and remove one row in each of the
      six lists (path, timer, view field, action, field option, sub-field)
      and confirm behavior is unchanged.

## 4. Verification

- [x] 4.1 Run `bun run typecheck`.
- [x] 4.2 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun).
