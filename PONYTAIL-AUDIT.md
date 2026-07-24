# Ponytail Audit

Repo-wide over-engineering scan (not a diff review). Findings ranked biggest
cut first. Read-only report — nothing here has been applied. Regenerate with
`/ponytail-audit`; this file is a snapshot, re-run before trusting it after
further changes land.

Last scanned: 2026-07-24.

## Findings

**1. `yagni:`** Drop the `AssignmentRegistry` plugin system (Map +
register/resolve + publish-time `checkAssignmentRegistry`) built for a
strategy space of one — only `staticAssignmentStrategy` is ever registered
outside tests. Replace with a direct `if (type !== "static") throw` and
inline candidate resolution.
[src/engine/registry.ts:56-88, src/engine/registry-check.ts:103-132]
(~50-90 lines)

**2. `yagni:`** Collapse the editor's i18n locale-switcher plumbing
(Context/Provider, `useLocale`/`useT`, localStorage persistence,
`LocaleSwitcher.tsx` dropdown) — `SUPPORTED_LOCALES` has exactly one entry,
forever, until a second locale is authored. Replace with a plain
`t(key) = en[key]` lookup.
[packages/editor/src/i18n/{store.tsx,catalog.ts,LocaleSwitcher.tsx}]
(~60-70 lines; 22 call sites make this the priciest cut here)

**3. `shrink:`** `checkActionRegistry` and `checkAssignmentRegistry`
copy-paste the same resolve→not-found→Zod-safeParse-and-report loop. Extract
one `checkRegistryConfig(type, config, def, loc)` helper both call.
[src/engine/registry-check.ts:63-87 vs 109-132]
(~15-20 lines, no behavior change)

**4. `delete:`** Unused `_registry` parameter on `createServer` (already
underscore-marked as dead, routes never dispatch actions). Drop it; keep
`registry` only on `startHttpServer` for `startEngine`.
[src/http/server.ts:38-42]
(~3-5 lines)

**5. `delete:`** `HandlerDef.outputSchema` is declared but has zero readers
anywhere in src/ or test/. Cut until a writeback-checking consumer lands.
[src/engine/registry.ts:22]
(~2 lines)

## Net

-130 to -190 lines, -0 deps possible.
