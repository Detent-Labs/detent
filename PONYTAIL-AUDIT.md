# Ponytail Audit

Repo-wide over-engineering scan (not a diff review). Findings ranked biggest
cut first. Read-only report — nothing here has been applied. Regenerate with
`/ponytail-audit`; this file is a snapshot, re-run before trusting it after
further changes land.

Last scanned: 2026-07-24.

## Findings

**1. `shrink:`** A field-id→CEL-expression map editor (a row with a field
`<select>`, an `ExpressionInput`, a remove button, plus set/delete-entry and
add-first-unused-field logic) is implemented twice, near byte-for-byte
identical: `ActionListEditor`'s output-mapping block and `MappingEditor`
(used for a subprocess step's `inputMapping`/`outputMapping`). Extract one
shared `FieldExpressionMapEditor` component parameterized by
label/add-label/remove-label/placeholder, used by both call sites.
[packages/editor/src/panels/ActionListEditor.tsx:88-149 vs
packages/editor/src/panels/SubprocessSpecEditor.tsx:18-74]
(~25-30 lines)

**2. `shrink:`** The `addX`/`removeX(index)`/`updateX(index, patch)`
array-CRUD-by-index triple (`filter((_, i) => i !== index)` /
`map((x, i) => i === index ? {...x, ...patch} : x)`) is reimplemented
independently six times across the editor panels — `PathsPanel`,
`TimersPanel`, `ViewEditor`, `ActionListEditor`, and `FieldCatalogPanel`'s
option/sub-field rows — each ~3 lines of the same shape. One generic
`removeAt(list, i)` / `updateAt(list, i, patch)` helper replaces all six.
[packages/editor/src/panels/PathsPanel.tsx:38-40,
TimersPanel.tsx:34-36, ViewEditor.tsx:36-39, ActionListEditor.tsx:34-40,
FieldCatalogPanel.tsx:42-50]
(~15-18 lines)

**3. `shrink:`** `checkActionRegistry` and `checkDataSourceRegistry` still
duplicate the resolve→not-registered→`configSchema`-safeParse loop body
verbatim — the previous audit only deduped the inner Zod-issue-mapping
sub-loop (`mapConfigIssues`); this outer shape was missed. A small
`checkTypedConfig(sites, resolveFn, typeOf, configOf)` helper collapses
both.
[src/engine/registry-check.ts:74-93 vs 148-165]
(~8-10 lines)

**4. `shrink:`** `migrateInstances` and `findOrphanKeys` both hand-roll the
identical keyset-pagination loop shape (`let last = ""; for (;;) { SELECT …
WHERE instance_id > last … LIMIT BATCH; if empty break; … }`). Low
priority — the per-row bodies differ substantially and the surrounding
domain logic is otherwise justified.
[src/engine/migration.ts:543-592 vs 606-638]
(~8-10 lines)

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

## Resolved since last scan

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

-60 to -70 lines, -0 deps possible.
