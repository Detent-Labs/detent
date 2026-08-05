## 1. Storage and engine functions

- [ ] 1.1 Add `ui_string_overrides(area, locale, key, value)` to
      `initSchema` in `src/engine/store.ts`.
- [ ] 1.2 Add `src/engine/ui-strings.ts` with `listUiStringOverrides(db)`
      and `setUiStringOverride(area, locale, key, value, db)`. A `null`
      value deletes the row.
- [ ] 1.3 Engine-level tests for both functions, including delete-on-null.

## 2. Public read route

- [ ] 2.1 Add `GET /ui-strings` in `src/http/server.ts`, alongside the
      existing health endpoints. No auth check.
- [ ] 2.2 Test: an unauthenticated request returns every stored override
      as one nested map.

## 3. Admin write route

- [ ] 3.1 Add `GET /admin/ui-strings` and `PUT /admin/ui-strings` in
      `src/http/admin-routes.ts`, both behind
      `requireRole(actor, ADMIN_ROLE)`.
- [ ] 3.2 Test: both routes refuse a non-admin actor.
- [ ] 3.3 Test: a `PUT` with `value: null` deletes the row; a string value
      upserts it.

## 4. Frontend resolver

- [ ] 4.1 Add `packages/web/src/i18n/overrides.ts` with
      `setUiStringOverrides` and `resolveOverride`.
- [ ] 4.2 Change `shell/catalog.ts`'s `t()` to consult `resolveOverride`
      first.
- [ ] 4.3 Change `app/catalog.ts`'s `t()` the same way.
- [ ] 4.4 Change `studio/catalog.ts`'s `t()` the same way, passing the
      fixed `"en"` locale.
- [ ] 4.5 In `shell/App.tsx`, fetch `GET /ui-strings` once at boot and
      call `setUiStringOverrides` before rendering `Chrome` or any area.
- [ ] 4.6 Unit tests for `resolveOverride`'s fallback behavior.

## 5. Admin screen

- [ ] 5.1 Add a `/ui-strings` screen to the admin area, gated by
      `system:admin`.
- [ ] 5.2 The screen picks an area and a locale, then lists that catalog's
      keys with the builtin value and an editable override input,
      importing each area's builtin catalog object directly.
- [ ] 5.3 Saving calls `PUT /admin/ui-strings`, then re-fetches
      `GET /ui-strings` and calls `setUiStringOverrides` again.
- [ ] 5.4 Clearing an input's value and saving deletes the override.

## 6. Verification

- [ ] 6.1 `bun run typecheck`.
- [ ] 6.2 Full `bun test` with `DATABASE_URL` set.
- [ ] 6.3 Manual check in a real browser: set an override for a
      `shell.login.title` key, reload the login screen unauthenticated,
      confirm the overridden text renders before login.
