## Context

`editor-i18n` (archived 2026-07-22) added UI-chrome locale infrastructure to
the editor: a catalog-agnostic `LocaleProvider`/`useLocale()`, a `t()`
string-catalog lookup with fallback-to-`en`, and a manual switcher. Its
proposal explicitly deferred localizing *authored process content*
(`label`/`description` an author enters into the Draft) to a later change,
while shaping the locale-state so that change could reuse it directly.

Today, four contract fields hold plain-`string` display text an instance
participant or an author sees: `ProcessBody.label`/`description`,
`Step.label`/`description`, `FieldDef.label`/`description`, and
`FieldOption.label`. `Path.label`/`description`, `Timer.description`, and
`Plugin.description` are authoring-facing notes, never rendered to a
participant, and stay out of scope.

`definition.ts` is both the authoring-time parser and the deserializer for
already-persisted bodies (`CLAUDE.md`'s standing rule: a tightened refinement
must never make a previously-valid stored body throw on read). This project
is still pre-launch (no production instances pinned to a body using the old
`string` shape), so the team chose a direct breaking type change over a
`string | LocalizedText` compatibility union — confirmed explicitly, not a
default.

## Goals / Non-Goals

**Goals:**
- Let a process declare `label`/`description`/field-option-label content in
  more than one locale, with a required fallback locale per process.
- Let the editor author that content across locales, independently of the
  editor's own UI-chrome language.
- Keep the mechanism a plain data shape + one structural invariant + one pure
  resolver function — no new runtime subsystem, no CEL involvement.

**Non-Goals:**
- No participant-facing rendering surface is built here — no such UI exists
  yet. This change only makes the contract and the editor ready for one.
- No browser/Accept-Language auto-detection of content locale.
- No general translation-memory or machine-translation tooling.
- No compatibility shim for pre-existing plain-`string` bodies (see Context).
- No change to `Path.label`/`description`, `Timer.description`,
  `Plugin.description`, CEL, or any runtime execution path.

## Decisions

### D1: `LocalizedText` = partial-by-locale map with a required `baseLocale` key, not a fully-required map over a declared locale set

Considered and rejected: `ProcessBody.contentLocales: LocaleCode[]`
declaring the process's full supported set, with every `LocalizedText`
required to have an entry for every declared locale (no partial/fallback).
Rejected because it forces a full-translation gate before anything can be
authored or published, and adding a locale later would instantly invalidate
every existing label until fully retranslated — friction with no
counterbalancing benefit at this stage, and inconsistent with the
fallback-to-base-locale precedent `editor-i18n` already established for the
UI-chrome catalog.

Chosen instead: `ProcessBody.baseLocale: LocaleCode` (required) and
`LocalizedText = Record<LocaleCode, string>`, with a single structural
invariant — every `LocalizedText` instance in the body must contain a
non-empty `baseLocale` entry. Other locale entries are optional. This lets
an author add a second locale incrementally, field by field, with
`resolveLocalizedText` falling back to `baseLocale` for anything not yet
translated — mirroring `resolveTranslation()`'s existing fallback rule.

### D2: `LocaleCode` is an open regex-validated format, not a closed enum

`z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/)` (e.g. `en`, `de`, `en-US`).
A closed enum would require a schema change every time a process wants a new
content locale — content locales are process data, not a fixed platform
list (unlike the editor's own UI-chrome `LocaleCode`, which legitimately is
closed today because the editor ships exactly one interface language).

### D3: Content locale and UI-chrome locale stay fully independent

The editor gets a second, separate "current content locale" concept (which
locale of the *authored process* the author is viewing/editing), distinct
from `useLocale()` (which language the *editor's own interface* is in). A
German-speaking author can build an English+French process. The two are
not allowed to share a type, a component, or a piece of state — the content
locale's option set is derived per-Draft (union of locale keys already used,
plus free-form "add a locale"), while the UI-chrome's is the fixed
`SUPPORTED_LOCALES` list. Reusing the UI-chrome `LocaleSwitcher` component
for content locale was considered and rejected for this reason.

### D4: The synthesized cancel-sink label is a documented, unsolved limitation

`compile.ts` injects a cancel-sink step with `label: "Cancelled"` at publish
time, with no access to a full translation table. It becomes
`{ en: "Cancelled", [body.baseLocale]: "Cancelled" }` — guaranteeing the
structural invariant (a `baseLocale` entry exists) without inventing a
general translation mechanism for one synthesized word. A non-English-base
process will see the literal English word under its own base-locale key
until a real translation table is justified by more than this one string.

### D5: `resolveLocalizedText` takes `baseLocale` as a parameter, not a constant

Unlike `resolveTranslation(locale, key)` (UI catalog, hardcoded fallback to
`en`), `resolveLocalizedText(value, locale, baseLocale)` takes the process's
own `baseLocale` explicitly, since it is process-declared data, not a
platform constant.

## Risks / Trade-offs

- **[Risk] Wide mechanical migration**: every `examples/*.json` fixture and
  every `test/*.ts` suite touching the four affected fields needs updating
  in the same change, since there is no compatibility union.
  → **Mitigation**: mechanical, one-shot conversion (`"x"` → `{ en: "x" }`,
  plus `baseLocale: "en"` on each example `ProcessBody`); no behavior change
  to migrate, just shape.
- **[Risk] Untranslated synthesized cancel-sink label in non-English-base
  processes** (D4). → **Mitigation**: documented limitation, not silently
  wrong — the invariant still holds (a `baseLocale` entry always exists),
  the content is just untranslated English text under that key.
- **[Risk] Author confusion between UI-chrome locale and content locale**
  (two separate switchers in the editor). → **Mitigation**: visually and
  structurally distinct components (D3); content-locale switcher lives next
  to the panels that edit localized content, not in the global toolbar.
- **[Trade-off] No enforcement that a process's content is "complete" in any
  non-base locale** — a label can exist only in `baseLocale` forever with no
  warning. Accepted: matches the UI-catalog's existing missing-key-falls-
  back behavior, and the fully-required-map alternative was rejected in D1.

## Migration Plan

Not a runtime/data migration (no persisted instances exist yet in
production) — a source migration:
1. Land the schema changes in `definition.ts` and `compile.ts`.
2. Convert every `examples/*.json` fixture and affected `test/*.ts` literal
   in one pass (`label: "x"` → `label: { en: "x" }`, add
   `baseLocale: "en"` to each `ProcessBody`).
3. Land editor changes (content-locale state, switcher, `LocalizedTextInput`,
   panel wiring, graph-view resolution) against the updated contract.
4. `bun run typecheck` (root + editor) and `bun test` (both packages) as the
   completion gate — no partial/dual-shape intermediate state is shipped.

## Open Questions

None outstanding — all decisions above were confirmed in brainstorming
before this document was written.
