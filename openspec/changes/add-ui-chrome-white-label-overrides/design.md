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
  area text NOT NULL,
  locale text NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
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

### Read path: unauthenticated, fetched once at boot

The login screen renders before any token exists. `GET /ui-strings`
therefore carries no auth check, alongside the stage-14a health endpoints
in `src/http/server.ts`. It returns wording only, nothing a customer would
treat as a secret.

It returns the full table as one nested map:
`Record<area, Record<locale, Record<key, value>>>`. The shell fetches it
once, in `App.tsx`, before rendering `Chrome` or any area.

Alternative considered: fetch after login, scoped to the actor's visible
areas. Rejected. The login screen itself needs overrides. The table also
stays small enough that scoping buys nothing.

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

`App.tsx` calls `setUiStringOverrides` once, after the boot fetch
resolves, before rendering anything. Each existing `t()` gains one line,
for example `shell/catalog.ts`:

```ts
export function t(locale: UiLocale, key: ShellKey): string {
  return resolveOverride("shell", locale, key) ?? catalog[locale][key];
}
```

`studio/catalog.ts`'s `t(key)` takes no `locale` argument; its change
passes the fixed `"en"` value. No call site of `t()` anywhere changes.

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

### Admin screen: keyed off the builtin catalog, imported directly

The screen needs the full key list per area. It imports each area's
builtin catalog object directly: `shell/catalog.ts`'s `en`/`de`,
`app/catalog.ts`'s `en`/`de`, `studio/catalog.ts`'s `en`. These are plain
data objects, not component code, so the cross-area import stays cheap.
Saving re-fetches `GET /ui-strings` and calls `setUiStringOverrides`
again, so the admin's own session reflects the change without a reload.

## Risks / Trade-offs

- [Risk] The public `GET /ui-strings` route serves every deployment's
  wording to an unauthenticated caller.

  → Mitigation: the content is wording every visitor already sees. The
  route exposes nothing that sits behind auth elsewhere.
- [Risk] `admin` and `reporting` stay unbranded until their own
  catalog-retrofit change ships. → Mitigation: none needed yet. An interim
  mechanism for them would be thrown away once the retrofit lands.

## Migration Plan

Additive:

- one new table
- two new engine functions
- two new admin routes
- one new public route
- one new frontend module
- a one-line change in each of three existing `t()` functions
- one new admin screen

No existing table or route changes shape. A deployment with an empty
`ui_string_overrides` table renders every screen exactly as it does today.

## Open Questions

None. The brainstorm resolved scope, load timing, and the editing role
before this document.
