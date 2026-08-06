## Context

See `proposal.md` - Why. Full background and the brainstorm that produced
this design lives at
`docs/superpowers/specs/2026-08-05-ui-chrome-white-label-overrides-design.md`.
This document extracts the technical decisions from it.

Three areas already carry a `t(locale, key)` catalog:

- `shell`: login, account menu, area names.
- `app`: `en` and `de`.
- `studio`: fixed `en` only, by the existing `collapse-editor-i18n`
  decision.

`admin` and `reporting` render raw JSX strings today, with no catalog and
no `t()` call. Their own catalog-retrofit is a separate, later change.
This design only covers the three areas that already have a catalog to
override.

## Goals / Non-Goals

See `proposal.md` - Capabilities for the full list. At the design level:
no new UI-chrome language, no logo/color/theming support, and no
per-locale inheritance. A deployment running both `en` and `de` needs its
own override row for each locale it wants to rename.

## Decisions

### Storage: a plain-text `area` column, no DB enum

```sql
CREATE TABLE ui_string_overrides (
  area       text NOT NULL,
  locale     text NOT NULL,
  key        text NOT NULL,
  value      text NOT NULL,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (area, locale, key)
);
```

The later catalog-retrofit change can start writing `area = 'admin'` rows
with no migration here. Alternative considered: a DB enum over the four
known areas. Rejected. It would need its own migration the day `admin` or
`reporting` gets a catalog. That buys nothing over a plain string.

An override row only exists while it overrides something. Clearing a
key's override deletes the row.

This differs from stage 26's `db.list` values, which are never deleted. A
running instance may still hold one in its own `data`. No instance,
draft, or published body ever reads a UI string. Nothing pins to one.
Deletion stays always safe.

The table carries `updated_by` and `updated_at`, the columns `data_lists`
carries. A customer renames its own login title. The row then records who
did it and when.

### Bounds: the write path keeps the public read small

`GET /ui-strings` needs no token and reads the whole table. Its response
size is therefore whatever the write path allowed in. Three bounds sit on
the `PUT`, in the shape `admin-routes.ts` already uses for a role string
and for a data list's values:

- `area`, `locale` and `key` each stay under `MAX_KEY_LENGTH`.
- `value` stays under `MAX_OVERRIDE_VALUE_LENGTH`, 4096 characters. A
  button label fits. A sentence of empty-state prose fits. A megabyte of
  text does not.
- The table holds at most `MAX_OVERRIDES` rows, 2000. The route rejects a
  `PUT` past that count.

Without these, one admin write decides how much every visitor downloads
at boot. `MAX_REQUEST_BODY_SIZE` alone permits 8 MiB per row.

The route rejects an empty-string `value` with the same 400. Clearing
goes through `null`, which deletes the row. The two stay distinct on
purpose. `resolveOverride(...) ?? builtin` does not fall back on `""`. A
stored empty string would render a blank label.

### Read path: in the route table, fetched before first render

The login screen renders before any token exists. `GET /ui-strings`
therefore resolves no actor and requires no role. It returns wording only,
nothing a customer would treat as a secret.

It sits in `createServer`'s `routes` table, not beside the health probes.
`POST /auth/login` is the precedent. The table carries that route, and no
token reaches it. Two mechanical reasons decide the placement:

- The two health probes answer through
  `toResponse(..., undefined, null)`, so neither ever carries an
  `Access-Control-*` header. That is deliberate for a probe. It is wrong
  for `/ui-strings`, which a browser fetches. `API_BASE` reads
  `VITE_API_URL`, so a deployment may serve the bundle from a second
  origin. The route needs the server's ordinary CORS handling.
- The `routes` table decides the `OPTIONS` preflight answer. A route
  outside the table gets no preflight.

It returns the full table as one nested map:
`Record<area, Record<locale, Record<key, value>>>`.

Alternative considered: fetch after login, scoped to the actor's visible
areas. Rejected. The login screen itself needs overrides, and the bounds
above already keep the table small.

### Patch mechanism: one shared resolver, one line per catalog

Threading a fetched map through every `t(locale, key)` call site would
touch hundreds of call sites. Instead, one module,
`packages/web/src/i18n/overrides.ts`, holds the fetched map:

```ts
let overrides: UiStringOverrideMap = {};

export function setUiStringOverrides(map: UiStringOverrideMap): void {
  overrides = map;
}

export function resolveOverride(area: string, locale: string, key: string): string | undefined {
  return overrides[area]?.[locale]?.[key];
}
```

Each existing `t()` gains one line, for example `shell/catalog.ts`:

```ts
export function t(locale: UiLocale, key: ShellKey): string {
  return resolveOverride("shell", locale, key) ?? catalog[locale][key];
}
```

`studio/catalog.ts`'s `t(key)` takes no `locale` argument; its change
passes the fixed `"en"` value. No call site of `t()` anywhere changes.

### `GET /ui-strings` joins the OpenAPI document

`http-api-documentation` names the documented routes one by one. It names
the excluded prefixes one by one too: `admin/*`, `drafts/*`,
`migration-plans/*`, `reporting/*` and `registry`. A new public route
belongs in one list or the other. Today it is in neither.

It joins the documented set. `GET /livez` and `GET /readyz` set the
precedent. No token reaches either one, and neither backs a customer
integration. The document carries both anyway. A document that omits a
route any caller can reach reads as an oversight.

`PUT /admin/ui-strings` and `GET /admin/ui-strings` need no entry. Both
sit under the excluded `admin/*` prefix.

`test/openapi-exclusions.test.ts` keeps its `EXCLUDED` list unchanged. An
entry there obliges the document to carry the literal `` `<prefix>/*` ``.
`/ui-strings` has no sub-paths to name.

### Where the boot fetch goes: `main.tsx`, not `App.tsx`

`overrides` is a module-level variable. React does not observe it, so
`setUiStringOverrides` schedules no re-render. Whatever the map holds must
be in place before the first render, not after it.

`App()` gives no seam for that. It is synchronous, and its first render
returns `LoginScreen`. A `useEffect` there runs after that render and
changes nothing on screen. A pre-login override would then appear only
once an unrelated state change forced a second render. Typing in the
password field would reveal it.

The fetch goes in `packages/web/src/main.tsx` instead, awaited, before
`createRoot(root).render(<App />)`:

```tsx
await loadUiStringOverrides();
createRoot(root).render(<App />);
```

`loadUiStringOverrides` catches its own failure and drops it. The map
stays empty and every screen renders its builtin wording. A deployment
whose engine is briefly unreachable must still reach its login screen.
Wording counts for little against that.

### Write path: `system:admin`, matching the roadmap sketch

`PUT /admin/ui-strings`, body `{ area, locale, key, value }`, `value` a
string or `null`. `null` deletes the row. One route covers both set and
clear.

Alternative considered: a narrower `system:branding` role, mirroring
stage 26's `system:datalists`. The brainstorm chose `system:admin`
instead, matching the roadmap's own sketch. A narrower role stays possible
later, if a customer's wording owner turns out not to be an admin in
practice.

`src/engine/ui-strings.ts` carries `listUiStringOverrides` and
`setUiStringOverride`, mirroring `admin-queries.ts`'s shape.
`src/http/admin-routes.ts` gains `GET /admin/ui-strings` (the admin
screen's own read) and the `PUT` above, both behind
`requireRole(actor, ADMIN_ROLE)`.

### Admin screen: the builtin catalogs move up to `i18n/`

The screen needs the full key list for each of the three areas. It cannot
read them where they sit today.
`packages/web/test/boundaries.test.ts` asserts the package's one
structural rule: no area imports from another area. An admin screen
reading `areas/app/catalog.js` breaks that test. The test also states the
repair. Shared code moves up. It never travels sideways.

The three builtin data objects therefore move up, one file each:

- `i18n/catalogs/shell.ts` holds shell's `en` and `de`.
- `i18n/catalogs/app.ts` holds the app area's `en` and `de`.
- `i18n/catalogs/studio.ts` holds studio's `en`.
- `i18n/catalogs/index.ts` imports all three and exports them keyed by
  area. The admin screen imports that file and nothing else.

Each area's own `catalog.ts` keeps its `t()` and its exported key type,
and imports only its own file under `i18n/catalogs/`. No `t()` call site
moves. No key type changes its import path.

One file per area, rather than one shared module, keeps the chunking the
package already has. The app area's chunk pulls `i18n/catalogs/app.ts`
alone. Only the admin chunk pulls all three, through `index.ts`.

The screen also needs a second gate beside the area's own. `routing.ts`
carries `ROUTE_ROLE`. That map names the role each admin route needs.
`root.tsx` carries the `TABS` list, which hides a tab an actor cannot
use. The new route joins both.

Saving re-fetches `GET /ui-strings` and calls `setUiStringOverrides`
again. The admin's own session then holds the new value. A screen already
rendered keeps its wording until React renders it again. That is the same
reason the boot fetch sits in `main.tsx`. A reload shows the change
everywhere.

## Risks / Trade-offs

- [Risk] The public `GET /ui-strings` route serves every deployment's
  wording to a caller holding no token.

  → Mitigation: the content is wording every visitor already sees. The
  route exposes nothing that sits behind auth elsewhere. It reads one
  table, and that table holds no actor, instance, process or account
  data. It reads the table whole, so its answer never varies by caller.
  Nobody can read the presence of anything out of it.
- [Risk] The route reads the database, and no token gates it. Each call
  costs one query.

  → Mitigation: the bounds above cap the row count and the value length.
  The query then answers from at most 2000 short rows. `/readyz` stands
  on that same ground. No token gates it, because it costs one cheap
  query. `METRICS_TOKEN` gates `/metrics` instead. A scrape runs three
  aggregates over live tables.
- [Risk] `toResponse` sets `Cache-Control: no-store` on every JSON
  envelope. Its comment gives the reason. Every envelope this wrapper
  returns is actor-scoped. `/ui-strings` is the first that is not, so
  that reason stops holding.

  → Mitigation: the header stays. The comment changes. It will say that
  the wrapper applies `no-store` to every route. It will name
  `/ui-strings` as the one envelope that would not need it. That same
  comment warns against a per-route opt-out, and the boot fetch runs once
  per page load.
- [Risk] `admin` and `reporting` stay unbranded until their own
  catalog-retrofit change ships. → Mitigation: none needed yet. An interim
  mechanism for them would be thrown away once the retrofit lands.

### The one-way door

The `admin`/`reporting` catalog retrofit is the stage that follows this
one. It needs nothing here undone. `area` is a plain text column. That
retrofit therefore writes `area = 'admin'` rows with no migration.
`i18n/catalogs/index.ts` gains two entries.

One move here sets today's layout aside for good: the builtin catalogs go
up to `i18n/`. No later stage plans to move them back. The
move satisfies the package's own asserted boundary rule, and the retrofit
puts two more catalogs in the same place.

## Migration Plan

Additive at the database and at the HTTP routes:

- one new table
- two new engine functions
- two new admin routes
- one new public route
- one new admin screen, plus its route entry, its role entry and its tab

One part is not additive. The three builtin catalog objects change file.
Each area's `catalog.ts` keeps its `t()` and its exported key type at the
same path, so no importer of either moves.

No existing table or route changes shape. A deployment with an empty
`ui_string_overrides` table renders every screen exactly as it does today.

`initSchema` creates the table with `CREATE TABLE IF NOT EXISTS`, the
convention every other table in `src/engine/store.ts` follows. This repo
runs no separate migration tool. There are no rows written before this
change, since the table is new.

## Open Questions

None. The brainstorm resolved scope, load timing, and the editing role
before this document.
