## Context

See proposal.md for motivation.

Three shapes already exist in the tree. This change picks among them rather
than inventing a fourth.

- `i18n/catalogs/app.ts` exports an `en` and a `de` map. It also exports a
  `CatalogKey` type derived from `en`. `areas/app/catalog.ts` wraps it as
  `t(locale, key)` over `resolveOverride("app", locale, key)`.
- `i18n/catalogs/studio.ts` carries `en` alone. `areas/studio/catalog.ts`
  exports `t(key)` and passes the fixed `"en"` to `resolveOverride`.
- `i18n/catalogs/index.ts` holds `BUILTIN_CATALOGS` and `OVERRIDABLE_AREAS`.
  The UI-strings screen reads both. `localesOf(area)` in `uiStringsLogic.ts`
  derives the locale list from `BUILTIN_CATALOGS[area]`. Registering an area is
  therefore all that screen needs.

Both area roots destructure `locale` from `AreaRootProps` today, and both pass
it to `Chrome`. The shell hands it down on every render, so a locale change
already re-renders both areas.

Below the roots the picture differs. Of the nine admin screens only
`DataListScreen` takes a `locale` prop. None of the four reporting screens
takes one.

`test/admin-uiStringsLogic.test.ts` asserts `localesOf("admin")` is empty
today. Its comment names this change as the one that ends that.

## Goals / Non-Goals

**Goals:**

- One catalog per area, EN and DE, wired into the override mechanism.
- No literal left in either area that a person reads as prose.
- The locale the shell holds decides the wording, the date format and the
  decimal separator.

**Non-Goals:**

- The studio's EN-only catalog stays as it is. This change adds no German
  there.
- No new locale beyond `en` and `de`.
- No key sharing between areas. A word repeated in two areas gets a key in
  each, because an operator overrides an area at a time.
- No pluralization library. Two areas need one count-bearing sentence between
  them, in two languages that both have exactly two forms.
- No change to `src/api/client.ts`. The shell and the studio read `errorText`
  too, and widening it reaches past this change.

## Decisions

### Locale-aware `t(locale, key)`, not the studio's fixed-EN shape

The admin and reporting catalogs follow `catalogs/app.ts`, not
`catalogs/studio.ts`.

The shell's account menu offers German, and both area roots receive the chosen
locale. Under the studio's shape a German operator would read a German area
tab above an English screen. The studio earns its exception because it authors
an English JSON contract, where the surrounding terms are English anyway.
Neither the admin nor the reporting area has that property.

The cost is around 200 German strings to write. That cost is the change.

### Each screen takes a `locale` prop from its area root

`DataListScreen` already shows the shape. Each remaining screen gains
`locale: UiLocale` in its props, and each area root passes the value it
already holds.

Alternative considered: a React context in each area. Rejected. One prop
against nine call sites in `admin/root.tsx` and four in `reporting/root.tsx`
costs less than a provider. Each root renders every screen in one place
already.

A logic module that builds text takes `locale` as a parameter instead. It is
no component. `usersLogic.ts`, `timersLogic.ts` and their siblings
follow that rule.

### One key per sentence, and the count substituted rather than concatenated

`ScopeNote`'s excluded-instance sentence in `areas/reporting/components.tsx`
builds itself today from a count, a ternary over `"instance is"` and
`"instances are"`, and a trailing clause. German needs a different split, so
the fragments do not survive translation.

Each grammatical form becomes one key holding the whole sentence with a `{n}`
placeholder. A small substitution helper in the area's `catalog.ts` fills it.

Alternative considered: `Intl.PluralRules`. Rejected under rung 1 of the
ladder. Both shipped locales have two forms, and one sentence needs them.

### The reporting area gains its own `describeError`

The admin area maps a `ClientError` to operator-facing text in
`areas/admin/errors.ts`, and never reads `error.message`. The reporting area
has no such map. `reportingLogic.ts::describeCaughtError` answers a
`ClientError`, and `ErrorNote` prints it through the shared
`api/client.ts::errorText`.

That shared function ends in `return error.message`. The message comes from
the server in English, so no catalog reaches it.

The reporting area therefore gains `describeError(error, locale): string`
over `ClientError.type`. It mirrors the admin one. `ErrorNote` takes the
locale and calls it. `describeCaughtError` keeps its shape and its return
type.

Alternative considered: give `errorText` a locale and a catalog. Rejected.
The shell and the studio read that function too, and the studio ships no
German. That widening belongs to its own change.

### `formatDuration` and `formatPercent` take the locale

`reportingLogic.ts::formatDuration` composes a number and a literal suffix
(`"ms"`, `"s"`, `"min"`, `"h"`, `"d"`). Two things about it are locale-bound:
the suffix, and the decimal separator in `4.5 h`.

It takes `locale` as a second parameter. It reads its suffixes from the
catalog, and formats the number through `Intl.NumberFormat`. Its existing
tests keep their expectations by passing `"en"`, and gain a German case.

`formatPercent` takes the locale for the same reason. German sets a space
before the sign, and `Intl.NumberFormat` with `style: "percent"` places it.

The `—` that `formatDuration` answers for a negative or non-finite input stays
a literal. It is a typographic mark, not a word.

Alternative considered: leave the suffixes English, because `min` and `h`
read the same in German. Rejected. German writes `d` as `T`, so the set is not
locale-neutral. Half a set from a catalog is worse than none.

### `describeError` in the admin area takes the locale

`areas/admin/errors.ts` maps a `ClientError` to operator-facing text through a
`switch`. Every arm returns a literal. Both functions gain a `locale`
parameter and return `t(locale, "error.<type>")`, exactly as
`areas/app/errors.ts` already does.

`describeCaughtError(err)` has about 25 call sites across eight screens. Its
new signature is `describeCaughtError(err, locale)`, and each of those screens
gains the prop under the decision above.

### Key naming: `<screen>.<element>`

The app catalog's convention carries over: `tasks.title`, `task.claim`,
`error.network`. A screen owns its prefix.

One `common.` prefix holds what two or more admin screens both render, such as
`common.refresh` and `common.cancel`. A string one screen renders keeps that
screen's prefix, even where its wording repeats a word.

The override table keys a row by area, locale and key. A key rename after
this change lands orphans a deployment's stored override. The names are worth
one pass of care now.

### Somebody writes the `de` map by hand, and no tool generates it

Both maps are hand-written objects in one file per area. `CatalogKey` derives
from `en`, so a `de` map missing a key fails `tsc --noEmit`. A test asserts
the key sets match in both directions. That catches a `de` key `en` does not
declare.

## Risks / Trade-offs

- **A wide diff across 22 files invites a missed literal.** → The browser
  check walks every screen in German. An English word on a German screen is
  the one error this change can produce. A reader sees it at once.
- **The German wording is a first pass, not a reviewed translation.** → The
  override mechanism exists for this. A deployment corrects a word without a
  redeploy. Say so in the change's summary rather than calling the German
  final.
- **German runs 40% longer, and both areas carry wide tables.** → The browser
  check covers four at a narrow window. They are instances, outbox, timers and
  users. A column that wraps is acceptable. A clipped one is not.
- **`describeCaughtError`'s new parameter touches every catch in the admin
  area.** → `tsc --noEmit` finds every call site. None is optional.
- **A stored override keyed to a name this change invents dies if the key is
  later renamed.** → Accepted. No deployment holds an admin or reporting
  override today, because neither area has ever had a catalog.
- **A later change may still want one shared error catalog.** → This change
  leaves `api/client.ts::errorText` untouched, so that door stays open. The
  reporting map it adds mirrors the admin one, which such a change would fold
  in together.

## Migration Plan

No data migration. No stored state changes shape. The `ui_string_overrides`
table already accepts any `area` string, so `admin` and `reporting` rows need
no schema change.

Rollback is a revert of the commit. A deployment that stored an admin override
before the revert keeps the row. It then resolves against nothing and stays
inert.

## Open Questions

- Does a native-German reader review the two catalogs before somebody
  archives this change? That answer changes no spec. It changes no part of
  the approach, and it adds no task. It changes only what the change's
  summary claims about the German.
  The override mechanism corrects a word after the fact either way.
