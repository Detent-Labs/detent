## 1. Storage and engine functions

- [x] 1.1 Add `ui_string_overrides(area, locale, key, value, updated_by,
      updated_at)` to `initSchema` in `src/engine/store.ts`, with
      `CREATE TABLE IF NOT EXISTS`, the convention every other table there
      follows.
- [x] 1.2 Add `src/engine/ui-strings.ts` with `listUiStringOverrides(db)`,
      `countUiStringOverrides(db)` and
      `setUiStringOverride(area, locale, key, value, updatedBy, db)`. A
      `null` value deletes the row.
- [x] 1.3 Engine-level tests for all three functions, including
      delete-on-null and the nested-map shape `listUiStringOverrides`
      returns. `test/ui-strings.test.ts`.

## 2. Public read route

- [x] 2.1 Add `GET /ui-strings` to the `routes` table in
      `src/http/server.ts`. It resolves no actor and requires no role, the
      way `POST /auth/login` is registered. It does NOT go beside
      `/livez` and `/readyz`: those answer with no CORS headers on
      purpose, and a route outside the table gets no `OPTIONS` preflight.
- [x] 2.2 Amend the `Cache-Control: no-store` comment on `toResponse` in
      `src/http/server.ts`. Its premise — every envelope this wrapper
      returns is actor-scoped — stops being true with this route. The
      header itself stays.
- [x] 2.3 Test: an unauthenticated request returns every stored override
      as one nested map. `test/http-ui-strings.test.ts`, which also pins
      that an anonymous caller and an admin read the same map, and that
      the envelope carries no `updated_by`.
- [x] 2.4 Test: the route answers an `OPTIONS` preflight, and a request
      carrying an allowed `Origin` comes back with the CORS header.

## 3. Admin write route

- [x] 3.1 Add `GET /admin/ui-strings` and `PUT /admin/ui-strings` in
      `src/http/admin-routes.ts`, both behind
      `requireRole(actor, ADMIN_ROLE)`. `PUT` records the acting actor in
      `updated_by`.
- [x] 3.2 Bound the write, in the shape `admin-routes.ts` already uses for
      a role string and a data list's values: `area`, `locale` and `key`
      under `MAX_KEY_LENGTH`; `value` under a declared
      `MAX_OVERRIDE_VALUE_LENGTH` of 4096; the table under a declared
      `MAX_OVERRIDES` of 2000. Each breach is a `RequestShapeError`.
- [x] 3.3 Refuse an empty-string `value` with the same `RequestShapeError`.
      Clearing goes through `null`.
- [x] 3.4 Test: both routes refuse a non-admin actor.
- [x] 3.5 Test: a `PUT` with `value: null` deletes the row; a string value
      upserts it and records `updated_by`.
- [x] 3.6 Test, one per bound, each rejecting a violating input: an
      over-long `value`, an over-long `key`, a write past `MAX_OVERRIDES`,
      and an empty-string `value`.

## 4. The builtin catalogs move up

`packages/web/test/boundaries.test.ts` forbids an area importing another
area. The admin screen needs all three key lists, so the data moves up
first, before anything reads it.

- [x] 4.1 Move shell's `en`/`de` to `packages/web/src/i18n/catalogs/shell.ts`
      and export both.
- [x] 4.2 Move the app area's `en`/`de` to `i18n/catalogs/app.ts` and
      export both.
- [x] 4.3 Move studio's `en` to `i18n/catalogs/studio.ts` and export it.
- [x] 4.4 Add `i18n/catalogs/index.ts`, exporting the three keyed by area.
      Only the admin screen imports this file; each area imports its own
      file alone, so the per-area chunking stays.
- [x] 4.5 Point `shell/catalog.ts`, `areas/app/catalog.ts` and
      `areas/studio/catalog.ts` at their moved data. Each keeps its `t()`
      and its exported key type at its current path, so no call site and
      no type import moves.
- [ ] 4.6 Confirm `bun test packages/web/test/boundaries.test.ts` still
      passes after the move. Checked statically here — no file under
      `areas/` names an `areas/<other>/` specifier, and the new screen adds
      no CSS class — but the test itself was not run.

## 5. Frontend resolver

- [x] 5.1 Add `packages/web/src/i18n/overrides.ts` with
      `setUiStringOverrides`, `resolveOverride` and a
      `loadUiStringOverrides()` that fetches `GET /ui-strings`, catches
      any failure, and leaves the map empty on one.
- [x] 5.2 Change `shell/catalog.ts`'s `t()` to consult `resolveOverride`
      first.
- [x] 5.3 Change `app/catalog.ts`'s `t()` the same way.
- [x] 5.4 Change `studio/catalog.ts`'s `t()` the same way, passing the
      fixed `"en"` locale.
- [x] 5.5 In `packages/web/src/main.tsx`, await `loadUiStringOverrides()`
      before `createRoot(root).render(<App />)`. Not in `App.tsx`: it
      renders `LoginScreen` synchronously on its first render, and
      `overrides` is a module variable React does not observe, so a
      `useEffect` there would schedule no re-render.
- [x] 5.6 Unit tests for `resolveOverride`: an override wins; an absent
      override falls back to the builtin value; an absent area and an
      absent locale each fall back rather than throw.
      `packages/web/test/i18n-overrides.test.ts`.
- [x] 5.7 Unit test: `loadUiStringOverrides` leaves the map empty when the
      fetch rejects, and `t()` still answers with builtin values. Same
      file, which also covers a non-2xx status and a malformed body.

## 6. Admin screen

- [x] 6.1 Add a `uiStrings` route to `packages/web/src/areas/admin/routing.ts`:
      the `Route` union, `matchRoute`, `routePath`, and `ROUTE_ROLE` with
      `system:admin`.
- [x] 6.2 Change `packages/web/test/admin-routing.test.ts`. Its `ROUTES`
      list names every route by hand. So do its two exact reachable-route
      assertions. All three go red otherwise.
- [x] 6.3 Add the tab to `TABS` and the render branch to
      `areas/admin/root.tsx`. An actor without `system:admin` gets the
      existing `MissingRole` state, unchanged.
- [x] 6.4 Add the two calls to `areas/admin/api/client.ts` and their types
      to `api/types.ts`.
- [x] 6.5 Add the screen. It picks an area and a locale, then lists that
      catalog's keys with the builtin value and an editable override
      input, reading `i18n/catalogs/index.ts`.
- [x] 6.6 Seed each input from any stored override. Saving calls
      `PUT /admin/ui-strings`, then re-fetches `GET /ui-strings` and calls
      `setUiStringOverrides` again.
- [x] 6.7 Clearing an input and saving sends `null`, which deletes the
      override. An input left empty is never sent as `""`.
      `packages/web/test/admin-uiStringsLogic.test.ts` covers the rule.

## 7. Documentation

- [x] 7.1 Add `GET /ui-strings` to `docs/openapi.yaml`, beside `/livez`
      and `/readyz`, stating that it needs no role and no token. Leave
      `test/openapi-exclusions.test.ts`'s `EXCLUDED` list alone: an entry
      there would oblige the document to carry a `` `ui-strings/*` ``
      prefix that does not exist. That file gained two inclusion tests
      instead, beside the one it already carried.
- [x] 7.2 Move `ROADMAP.md` stage 13b off NOT STARTED, and correct the
      sentence saying neither 13a nor 13b is applied. 13a shipped as
      `add-content-translation-gap-warnings`.
- [x] 7.3 Add the subsystem entry to `docs/current-state.md`, the
      descriptive counterpart `CLAUDE.md` names.

## 8. Verification

- [x] 8.1 `bun run typecheck`.
- [ ] 8.2 Full `bun test` with `DATABASE_URL` set. Read the skip count,
      not the pass count alone.
- [x] 8.3 The antislop linter on every Markdown file this change touches,
      measured as the push gate measures it: the finding count at the
      branch base against the count at the tip.
- [x] 8.4 `git diff --check`, and `git ls-files --eol` read for a `w/`
      column showing CRLF.
- [ ] 8.5 Manual check in a real browser: set an override for
      `shell`/`en`/`login.title`, reload the login screen with no session,
      and confirm the overridden text renders before login.
- [ ] 8.6 Manual check in a real browser: clear that override, reload, and
      confirm the login screen shows the builtin `Log in` rather than a
      blank heading.
