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

- Add a sparse `ui_string_overrides(area, locale, key, value)` table.
- Add an unauthenticated `GET /ui-strings` route, returning every override
  as one nested map. The shell fetches it once at boot, before any screen
  renders. That reaches the pre-login screen too.
- Add a shared frontend resolver module,
  `packages/web/src/i18n/overrides.ts`. Each of the three existing
  `t()` functions (`shell`, `app`, `studio`) gets a one-line change to
  consult it first. No call site of `t()` anywhere changes.
- Add `system:admin`-gated `GET /admin/ui-strings` and
  `PUT /admin/ui-strings` routes, plus `src/engine/ui-strings.ts`,
  mirroring the shape of `admin-queries.ts`.
- Add a `/ui-strings` screen in the admin area. It shows one table per
  selected area and locale: each catalog key, its builtin value, and an
  override input.

## Capabilities

### New Capabilities

- `ui-string-overrides`: the storage, the public boot-time read, the
  resolver every `t()` consults, and the admin-gated write.

### Modified Capabilities

- `admin-app`: the admin area gains a `/ui-strings` screen.

## Impact

- One new table (`ui_string_overrides`), no change to an existing one.
- `src/engine/ui-strings.ts`: two new functions.
- `src/http/admin-routes.ts`: two new admin-gated routes.
- `src/http/server.ts`: one new public route, unauthenticated, alongside
  the existing health endpoints.
- `packages/web/src/i18n/overrides.ts`: new module.
- `packages/web/src/shell/catalog.ts`, `areas/app/catalog.ts`,
  `areas/studio/catalog.ts`: one-line change each.
- `packages/web/src/shell/App.tsx`: one new boot-time fetch, before first
  render.
- New admin screen, one new file.
- `admin` and `reporting` stay untouched; they get no catalog and no
  overrides until their own prerequisite change ships.
