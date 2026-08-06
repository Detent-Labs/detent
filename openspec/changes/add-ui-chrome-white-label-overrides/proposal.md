## Why

Each customer already gets its own deployment and its own database. A
customer wants to change its own UI-chrome wording too: button labels,
headings, the login screen's title. Today that text sits as string
literals inside `catalog.ts` files. Changing a word means a code change, a
rebuild, and a redeploy.

`ROADMAP.md` stage 13b raised this and deferred it for a committed
trigger. The design at
`docs/superpowers/specs/2026-08-05-ui-chrome-white-label-overrides-design.md`,
already brainstormed and approved, is that trigger.

## What Changes

- Add a sparse `ui_string_overrides(area, locale, key, value)` table, with
  the `updated_by`/`updated_at` columns `data_lists` already carries.
- Add an unauthenticated `GET /ui-strings` route in the server's route
  table, returning every override as one nested map. The bundle fetches it
  once, before the first render, so the pre-login screen carries an
  override too.
- Add a shared frontend resolver module,
  `packages/web/src/i18n/overrides.ts`. Each of the three existing
  `t()` functions (`shell`, `app`, `studio`) gets a one-line change to
  consult it first. No call site of `t()` anywhere changes.
- Move the three builtin catalog objects up into
  `packages/web/src/i18n/catalogs/`. The package forbids an area from
  importing another area, and the admin screen needs all three key lists.
- Add `system:admin`-gated `GET /admin/ui-strings` and
  `PUT /admin/ui-strings` routes, plus `src/engine/ui-strings.ts`,
  mirroring the shape of `admin-queries.ts`. Both bound what a write may
  store, so the public read stays small.
- Add a `/ui-strings` screen in the admin area. It shows one table per
  selected area and locale: each catalog key, its builtin value, and an
  override input.
- Document `GET /ui-strings` in `docs/openapi.yaml`, beside the two health
  routes.

## Capabilities

### New Capabilities

- `ui-string-overrides`: the storage, the public boot-time read, the
  resolver every `t()` consults, and the admin-gated write.

### Modified Capabilities

- `admin-app`: the admin area gains a `/ui-strings` screen.
- `http-api-documentation`: the documented route list gains
  `GET /ui-strings`.

## Impact

- One new table (`ui_string_overrides`), no change to an existing one.
  `src/engine/store.ts`'s `initSchema` creates it.
- `src/engine/ui-strings.ts`: two new functions.
- `src/http/admin-routes.ts`: two new admin-gated routes, with their
  length and count bounds.
- `src/http/server.ts`: one new public route, needing no token. It goes
  in the route table beside `POST /auth/login`, not beside the health
  probes. It therefore carries CORS handling and a preflight answer.
- `src/http/errors.ts`: no code change; `toResponse`'s `no-store` comment
  in `server.ts` states a premise this route falsifies, and it changes.
- `docs/openapi.yaml`: one new path entry.
- `packages/web/src/i18n/overrides.ts`: new module.
- `packages/web/src/i18n/catalogs/{shell,app,studio,index}.ts`: new files,
  holding the three builtin catalog objects moved up.
- `packages/web/src/shell/catalog.ts`, `areas/app/catalog.ts`,
  `areas/studio/catalog.ts`: each keeps its `t()` and its exported key
  type, gains the resolver line, and imports its data from `i18n/`.
- `packages/web/src/main.tsx`: the boot fetch, awaited before the first
  render. `shell/App.tsx` is not touched: it offers no pre-render seam.
- `packages/web/src/areas/admin/`: one new screen file, plus `routing.ts`
  (route, role, path) and `root.tsx` (tab, render branch).
- `packages/web/src/areas/admin/api/`: the two admin calls.
- `packages/web/test/admin-routing.test.ts`: its two exact reachable-route
  assertions gain the new route.
- `ROADMAP.md`: stage 13b moves off NOT STARTED.
- `admin` and `reporting` stay untouched; they get no catalog and no
  overrides until their own prerequisite change ships.
