# Ponytail Audit

Repo-wide over-engineering scan (not a diff review). Findings ranked biggest
cut first. Read-only report — nothing here has been applied. Regenerate with
`/ponytail-audit`; this file is a snapshot, re-run before trusting it after
further changes land.

Last scanned: 2026-07-24.

## Findings

**1. `delete:`** `packages/editor/src/draft/validate.ts` (`validateDraft` +
its `DraftValidationIssue`/`DraftValidationResult` types) has zero callers
anywhere in `src/` or `packages/` — fully superseded by `validation.ts`'s
`runValidation`, which runs the same `authoredProcessBody.safeParse` plus the
CEL/registry/duration/cross-process dimensions this file never grew.
[packages/editor/src/draft/validate.ts]
(~30 lines, whole file)

**2. `shrink:`** `RegistryValidationError` and `AssignmentRegistryValidationError`
in `definitions.ts` are byte-identical (same constructor, same issue
formatting) aside from the `name` string. One class taking `name` as a
constructor arg, or a shared base, replaces both.
[src/engine/definitions.ts:68-86]
(~10 lines, no behavior change)

**3. `shrink:`** `checkActionRegistry` and `checkAssignmentRegistry` still
duplicate the Zod-issue → `RegistryIssue` mapping loop (`.config.` path
join + push), though the bigger resolve→not-found duplication this finding
originally named is gone now that assignment strategy is checked directly.
Extract one `mapConfigIssues(loc, type, zodResult)` helper.
[src/engine/registry-check.ts:81-85 vs 124-128]
(~8 lines, no behavior change)

## Resolved since last scan

- ~~AssignmentRegistry plugin system~~ — already cut; `checkAssignmentRegistry`
  is now a direct `type !== "static"` check, no registry.
- ~~Editor i18n locale-switcher plumbing~~ — already cut; `i18n/` is just
  `catalog.ts`, a plain `t(key)` lookup.
- ~~Unused `_registry` param on `createServer`~~ — already gone; `createServer`
  takes no registry argument.
- ~~`HandlerDef.outputSchema`~~ — already gone, no references anywhere.

## Net

-48 lines, -0 deps possible.
