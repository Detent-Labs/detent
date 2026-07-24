## Context

`packages/editor/src/i18n/` implements a locale-provider architecture built
for a multi-locale future that never arrived: `store.tsx` (React context +
`useLocale`/`useT` hooks + `localStorage` persistence under key
`"editor.locale"`), `catalog.ts` (`LocaleCode`, `SUPPORTED_LOCALES`, a
per-locale `catalogs` map, `resolveTranslation`'s fallback-to-base-locale
logic, `resolveInitialLocale`), and `LocaleSwitcher.tsx` (a `<select>`
listing `SUPPORTED_LOCALES`). `SUPPORTED_LOCALES` has held exactly `["en"]`
since this was built, with 17 files (`App.tsx` + 16 others) importing `useT`
across ~22 call sites — the priciest ponytail-audit cut here by call-site
count.

The `openspec/specs/editor-i18n/spec.md` capability spec formally encodes
this as six SHALL requirements — most of them describing the
switcher/persistence/extensibility machinery being removed, not just an
implementation detail. This design's scope is therefore both a code
collapse and a requirement-set reduction.

## Goals / Non-Goals

**Goals:**
- Replace the context/hook/persistence/switcher stack with a single plain
  function `t(key) = en[key]`, reading one fixed catalog, importable from
  anywhere (component or not) with no provider needed.
- Every UI-chrome string renders identical text to today — this is a
  mechanism change, not a copy or behavior change.
- Bring `editor-i18n`'s spec down to only the requirements that remain true.

**Non-Goals:**
- Not touching content-locale localization (`ProcessBody`/`Step`/`FieldDef`
  `LocalizedText`, `resolveLocalizedText`, `ContentLocaleSwitcher`) — a
  wholly separate system this change does not reduce.
- Not simplifying `FileToolbar.tsx`'s `describeError`/`draft/file-io.ts`'s
  parameter-passing convention, even though the hook constraint that
  motivated it disappears (see Decisions).
- Not adding a second locale, ever, as part of this change — the opposite.

## Decisions

**Plain function, not a hook, not a context.** `t` becomes an ordinary
exported function reading a `const en = {...}` object directly —
`resolveTranslation`'s per-locale lookup and fallback branch, and
`resolveInitialLocale`'s stored-value validation, both existed only to
support a locale that never had a second value to select. Cutting them
removes the only place in the module that could throw (`useLocale`'s
"must be used within a LocaleProvider" guard) — a plain function has no
such failure mode.

*Alternative considered*: keep `useT()` as a hook but make it a trivial
wrapper with no context read (`() => t`). Rejected — this keeps every call
site paying for a hook call (and every component keeping the Rules-of-Hooks
constraint) for zero behavioral benefit; removing the hook entirely is the
actual YAGNI cut, not a hollowed-out version of it.

**Keep `FileToolbar`/`file-io.ts`'s parameter-passing convention as-is.**
`describeError(e, fallback)` and `file-io.ts`'s picker-description
parameters exist because non-component code could not call the `useT` hook.
Once `t` is a plain function, that constraint is gone — `file-io.ts` could
import `t` directly. Deliberately not done here: `describeError` is a
small, already-tested, exported pure function; changing its signature is an
unrelated refactor riding on this change's diff, and the current
calling convention (caller resolves, callee receives a string) is not wrong,
just no longer strictly necessary. Reintroduce only if a real reason to
touch that code arises.

**`editor-i18n` requirement disposition** (see also the delta spec):
- *"Editor UI-chrome text is localizable"* — MODIFIED. Drop "locale-aware...
  depends on current locale" (no longer true — there's exactly one locale,
  permanently); keep "rendered through a catalog lookup, not hardcoded
  literals" and the `EditorIssue.message`-untranslated exclusion, both still
  accurate.
- *"Default locale is English"* — REMOVED. There's no default being
  *selected* from a fallback chain anymore; English is the only value that
  has ever existed or can exist in this design.
- *"Missing translation keys fall back to the base locale"* — REMOVED. No
  non-base catalog exists or can exist here; `t(key)` reads the one catalog
  directly. Reintroduce only alongside an actual second locale.
- *"Locale is manually switchable, persisted, and extensible"* — REMOVED. No
  switcher, no persistence, no runtime change of any kind.
- *"Locale state is exposed independent of the string catalog"* — REMOVED.
  There is no locale state left to expose independently of anything — `t`
  *is* the whole surface now.
- *"Non-component code receives translated text as a parameter"* — left
  **untouched**, not part of this delta. Its normative content (non-component
  code doesn't import the catalog; it receives a resolved string) stays
  literally true under the "keep the convention" decision above; the word
  "hook" in its prose is a minor staleness, not worth a delta for zero
  behavior change.

**Test file disposition** — `content-locale-rendering.test.tsx`'s final
describe block ("content locale is independent of the UI-chrome locale")
tested two separate React contexts not interfering. With only one context
left (content locale), "independence" isn't a meaningful claim to test
anymore — but a real regression is still worth guarding: that UI-chrome text
stays in English regardless of what locale a Draft's content is authored in.
Kept, reduced to exactly that assertion, with the `LocaleSwitcher`-specific
assertions dropped since that component no longer exists.

## Risks / Trade-offs

- [Risk] A future second locale needs the whole provider/switcher/fallback
  stack rebuilt from scratch. → Mitigation: acceptable — same YAGNI trade as
  `remove-assignment-registry`; the removed shape (context + two hooks + a
  `<select>` + `localStorage`) is ordinary React and quick to reintroduce
  when an actual second locale is authored, at which point the requirements
  removed here are re-added deliberately with real content to validate
  against.
- [Risk] Mechanical `useT` → `t` import swap across 17 files is a wide but
  shallow diff (one import line + one deleted hook-call line per file) —
  easy to miss one file and leave a broken import. → Mitigation: `tsc
  --noEmit` with `noUnusedLocals`/`noUnusedParameters` (already enabled,
  confirmed in the prior `remove-assignment-registry` change) turns a missed
  or half-updated file into a compile error, not a silent runtime gap.
- [Risk] Deleting three describe blocks in `i18n-rendering.test.tsx` and
  reducing `content-locale-rendering.test.tsx` could silently drop real
  coverage. → Mitigation: the deleted blocks test mechanisms (context
  plumbing, hook independence, switcher option rendering) that no longer
  exist to test; the behavior that must still hold (UI-chrome text renders
  correctly, `NotCheckedBadge` composes text correctly, content locale still
  works) is retained in the surviving/rewritten tests.

## Migration Plan

1. Collapse `catalog.ts` to `en`, `TranslationKey`, `t()`.
2. Delete `store.tsx` and `LocaleSwitcher.tsx`.
3. Update `App.tsx`: drop `LocaleProvider`/`LocaleSwitcher` usage and
   wrapper, switch `useT` → `t` import in `ProcessHeader`/`Editor`.
4. Update the other 16 files: `useT` → `t` import, delete the hook-call
   line, in each.
5. Rewrite `test/i18n.test.ts`'s translation-related describe blocks to test
   `t()` directly; leave `describeError` tests untouched.
6. Rewrite `test/i18n-rendering.test.tsx`: delete the three obsolete describe
   blocks, keep `NotCheckedBadge`'s test without a provider wrapper.
7. Update `test/content-locale-rendering.test.tsx`: drop the
   `LocaleProvider` wrap from `withProviders`, reduce the independence test
   to a plain English-regardless-of-content-locale assertion.
8. Update `test/graph-view-rendering.test.tsx`: drop the `LocaleProvider`
   import and wrapper.
9. Update CLAUDE.md's editor paragraph.
10. `bun run typecheck` (primary missed-call-site detector, per the risk
    above) then full `bun test` with `DATABASE_URL` set.

No data migration, no runtime deployment step — editor-only source change,
no persisted state, no schema. Rollback is a plain revert.

## Open Questions

None — scope, requirement disposition, and test disposition were all
resolved during proposal drafting against the actual current code and spec.
