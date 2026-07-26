# Ponytail Audit

Repo-wide over-engineering scan (not a diff review). Findings ranked biggest
cut first. Read-only report — nothing here has been applied. Regenerate with
`/ponytail-audit`; this file is a snapshot, re-run before trusting it after
further changes land.

Last scanned: 2026-07-24.

## Findings

None open — all four findings from the 2026-07-24 scan have been triaged (see
below). Re-run `/ponytail-audit` for a fresh scan.

## Checked, not flagged (deliberate, per CLAUDE.md)

- `devHeaderResolver` as the sole `ActorResolver` — documented: "no real
  identity provider ships in core."
- Action `Registry` — documented plugin envelope, has a real second handler
  (`http.request`) beyond the exempted `core.*` internal dispatch.
- `DataSourceRegistry` with only a `"static"` handler — documented: "the
  registry mechanism holds more than one type... deferred until a concrete
  need exists."
- `packages/editor/src/registry/exampleRegistry.ts` + `RegistryPanel.tsx` —
  documented v1 demo toggle (editor has no author-supplied-code execution
  surface).
- `src/http/server.ts`'s five-route if-chain — appropriately minimal at this
  route count; a table-driven dispatcher would be the over-engineering here.
- `src/engine/idempotency.ts`'s hand-rolled UUIDv5 — Node's `crypto` has no
  built-in v5; documented as a deliberate no-dependency choice.
- `migrateInstances`/`findOrphanKeys` keyset-pagination loop (finding 4,
  2026-07-24 scan) — reviewed 2026-07-26, declined. The audit already flagged
  it low priority; the per-row bodies differ substantially (4-way outcome
  categorization with two error types vs. parse-and-check with one), and the
  two queries themselves differ in SELECT columns and WHERE predicate, so a
  real extraction would need the query injected via callback — more
  indirection than the ~8-10 lines of loop boilerplate it would save.
  [src/engine/migration.ts:543-592 vs 606-638]

## Resolved since last scan

- ~~Field-id→CEL-expression map editor duplication~~ (finding 1) — extracted
  shared `FieldExpressionMapEditor`, used by `ActionListEditor` and
  `SubprocessSpecEditor`; also fixed a field-switch duplication bug found
  during implementation.
- ~~`addX`/`removeX`/`updateX` array-CRUD-by-index duplication~~ (finding 2)
  — extracted `removeAt`/`updateAt` helper, fixed across all six sites
  (`PathsPanel`, `TimersPanel`, `ViewEditor`, `ActionListEditor`,
  `FieldCatalogPanel`).
- ~~`checkActionRegistry`/`checkDataSourceRegistry` outer loop duplication~~
  (finding 3) — extracted shared `checkTypedConfig` helper, deduping the
  registry-validation loop.
- ~~`packages/editor/src/draft/validate.ts`~~ — deleted (zero callers,
  superseded by `validation.ts::runValidation`).
- ~~`RegistryValidationError`/`AssignmentRegistryValidationError`
  duplication~~ — merged, plus a third identical class
  (`DataSourceRegistryValidationError`) found and folded in during
  implementation.
- ~~`checkActionRegistry`/`checkAssignmentRegistry` Zod-issue mapping-loop
  duplication~~ — deduped into `mapConfigIssues`, plus a third identical
  copy (in `checkDataSourceRegistry`) found and folded in during
  implementation.
- ~~AssignmentRegistry plugin system~~ — already cut; `checkAssignmentRegistry`
  is now a direct `type !== "static"` check, no registry.
- ~~Editor i18n locale-switcher plumbing~~ — already cut; `i18n/` is just
  `catalog.ts`, a plain `t(key)` lookup.
- ~~Unused `_registry` param on `createServer`~~ — already gone; `createServer`
  takes no registry argument.
- ~~`HandlerDef.outputSchema`~~ — already gone, no references anywhere.

## Net

Findings 1-3 landed (~48-58 lines cut); finding 4 declined as not worth the
indirection. -0 deps throughout.
