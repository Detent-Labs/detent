## Context

`packages/editor` is a young React/Vite structural editor (19 `.tsx` files,
roughly a few dozen hardcoded UI-chrome strings today: panel legends,
buttons, a `title=` hint, `IssueList`'s "not checked" badge). No i18n
library or locale infrastructure exists yet. The editor consumes the engine
package (`workflow-engine`) only through its `exports` map and renders
`EditorIssue.message` strings verbatim — those messages originate in the
engine (`definition.ts` Zod refinements, `cel/check.ts`,
`registry-check.ts`, `compile.ts::validateDurations`) as opaque prose with
no issue codes.

A later change will localize authored process content (`label`/
`description` an author types into the Draft). This design deliberately
shapes the locale-state so that change can reuse it.

## Goals / Non-Goals

**Goals:**
- Localize the editor's own UI-chrome strings (panel titles, buttons,
  legends, badges), including in non-component call sites that currently
  hold their own display strings (`draft/file-io.ts`,
  `FileToolbar.tsx::describeError`).
- Provide a manual locale switcher; default locale `en`.
- Missing translation key in a non-base locale falls back to the `en`
  entry.
- Shape the locale state (current locale + setter) so a later
  process-content-localization change can consume it directly, without
  depending on the UI-string catalog.
- Build the switcher and catalog so that adding a locale beyond `en` is a
  pure content addition later, requiring no further code changes.

**Non-Goals:**
- Shipping a second locale's translations. This change ships exactly one
  supported locale (`en`); the switcher is present and wired but has one
  option until a later change adds a catalog for another locale. (See
  "Single-locale scope" under Decisions.)
- Browser-language auto-detection (deferred; can be layered on top of the
  same provider later as an alternate initial-value strategy).
- Translating `EditorIssue.message` (engine-sourced validation/issue text).
  These stay English. Localizing them requires stable issue codes in the
  engine (`definition.ts`, `cel/check.ts`, `registry-check.ts`,
  `compile.ts`) — a larger, separate change. Consequence accepted here: a
  user who switches the editor to a non-English locale will still see
  English validation messages in `IssueList`. This is a deliberate scope
  boundary, not an oversight.
- Localizing authored process content (`label`/`description` in the
  Draft/contract) — later change.
- Pluralization/ICU message formatting — no current UI string needs it;
  add only if one does.
- A translation-management workflow (TMS integration, extraction tooling)
  — catalogs are hand-maintained JSON/TS for now.

## Decisions

**Hand-rolled context + typed `t()`, not react-i18next/Lingui.**
At the current string count (~20-50, one small package), a full i18n
library's namespace/lazy-loading/ICU machinery isn't earning its
complexity. A ~30-line Context + lookup function covers the need. Revisit
if the string count grows by an order of magnitude or real pluralization/
interpolation needs appear — swapping the `t()` call sites for a library's
hook later is a mechanical change, not a rewrite, since call sites just
call `t(key)`.

**Locale state and the string catalog are two separate pieces, composed.**
```
LocaleProvider (Context)
 ├─ locale: LocaleCode        <- plain value, catalog-agnostic
 ├─ setLocale(code)
 └─ persisted in localStorage (key: "editor.locale")
        │
        ├── useLocale()  → consumed directly by THIS change's t()
        │                   and, later, by process-content localization
        │                   (e.g. an author-facing label editor deciding
        │                   which language variant to show) — no
        │                   dependency on the UI catalog
        │
        └── useT() (this change) → wraps useLocale(), looks up the
            current locale's message catalog
```
`useLocale()` is exported from the provider module independent of `useT()`
specifically so a later change can `import { useLocale }` without pulling
in catalog/lookup code it doesn't need.

**Catalog shape and fallback.** `en` is the base/source-of-truth catalog
(a flat `Record<string, string>` — namespacing by panel is unnecessary at
this size). `TranslationKey = keyof typeof en` types every `t()` call
against the base catalog, so a call site referencing a nonexistent key is
a compile error. Non-base catalogs are typed `Partial<Record<TranslationKey,
string>>` — deliberately partial, so an incomplete translation doesn't
block a build. `t(key)` resolves `catalog[locale]?.[key] ?? catalog.en[key]`.

**Default locale is always `en`**, on first load and whenever
`localStorage` has no (or an invalid) stored value. No `navigator.language`
detection in this change.

**Switcher is a small manual control**, not a settings panel. Exact
placement (e.g. alongside `FileToolbar`) is an implementation detail for
tasks.md, not a spec-level requirement — the requirement is only that a
manual switch exists, lists whatever locales are currently supported, and
is reachable.

**Single-locale scope: this change ships only `en`.** The switcher,
catalog typing, and persistence are built to support N locales, but no
second locale's content is authored here — that was scoped out during
review rather than guessed at (real translation content needs a decision
this change shouldn't make silently). Consequence: the "switch and see the
UI re-render in another language" scenario isn't exercised end-to-end
until a later change adds a second catalog; what *is* exercised now is
that adding one requires touching only a catalog file plus a `LocaleCode`
entry — no changes to the switcher component, `useLocale`, or `useT`.

**Pure resolution logic is split from the React layer, mirroring
`draft/`'s existing split** (`draft/validate.ts`/`draft/issues.ts` as pure
logic, `draft/store.tsx` as the React Context/Provider/hooks wrapping it).
`packages/editor/src/i18n/catalog.ts` holds the `en` catalog,
`TranslationKey`, `resolveTranslation(locale, key)`, and
`resolveInitialLocale(stored, supported)` as plain, hook-free functions.
`packages/editor/src/i18n/store.tsx` holds `LocaleProvider`, `useLocale()`,
and `useT()` (a thin wrapper calling `resolveTranslation` with the current
context locale). This is what makes tasks 5.1/5.2 testable with the
package's existing plain `bun:test` setup (no `@testing-library/react`/
`jsdom` present in `packages/editor/package.json` today) — the logic under
test never touches React.

**Non-component call sites receive translated strings as parameters, not
by calling `t()` themselves.** Two existing call sites can't use a hook:
`draft/file-io.ts`'s module-level `DRAFT_TYPES`/`EXPORT_TYPES`
(`FilePickerAcceptType.description`, evaluated outside any component) and
`FileToolbar.tsx::describeError`'s fallback string (a plain function, not
a component). Rather than giving `draft/file-io.ts` its own dependency on
`i18n/catalog.ts`, `saveDraft`/`loadDraftViaPicker`/`loadDraftFromFile`/
`exportDraft` take the already-resolved description string(s) as a
parameter, supplied by `FileToolbar` (which has `useT()`); likewise
`describeError(e, fallback: string)` takes its translated fallback as a
parameter instead of resolving one internally. `draft/file-io.ts` keeps no
i18n import at all — it stays exactly what it is today, a file-I/O module,
with display text pushed to its caller. Browser/platform-sourced text
(`e.message` from a `DOMException`/`Error`) is passed through unchanged
either way, the same treatment as engine-sourced validation messages.

## Risks / Trade-offs

- **No pluralization/interpolation support** → acceptable: no current
  string needs it. Add a minimal `{param}`-style interpolation only if a
  concrete string needs it, not speculatively.
- **Catalog drift**: TypeScript only guarantees keys *exist* in the base
  catalog, not that every non-base catalog stays complete as new UI
  strings are added → mitigated by the runtime fallback-to-`en`, so a
  missing translation degrades to English rather than breaking or
  rendering a raw key.
- **English validation messages next to a localized UI** reads as
  inconsistent at first glance → accepted and documented (see Non-Goals);
  the alternative (blocking this change on engine issue-codes) was
  explicitly declined to keep this change scoped to `packages/editor`.
- **No auto-detection** means a non-English browser user sees English
  until they manually switch → accepted; layering detection onto the
  initial-value resolution later is additive, not a rearchitecture.
- **A one-option switcher is not very useful on its own** → accepted as an
  intermediate state; the control still needs to exist and be wired
  correctly now so a later change adds only content (see "Single-locale
  scope").

## Open Questions

- Which locale(s) beyond `en` get shipped, and when — a follow-up change,
  not decided here. This change only guarantees the mechanism doesn't need
  rework when that's decided.
- Exact `TranslationKey` catalog granularity (flat vs. lightly grouped by
  panel) is left to implementation; the current string count doesn't
  clearly demand namespacing yet.
