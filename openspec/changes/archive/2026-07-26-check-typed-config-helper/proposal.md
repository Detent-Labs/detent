## Why

Item 3 of `PONYTAIL-AUDIT.md` (scanned 2026-07-24): `checkActionRegistry` and
`checkDataSourceRegistry` duplicate the resolve → not-registered →
`configSchema`-safeParse loop body verbatim — the previous audit round only
deduped the inner Zod-issue-mapping sub-loop (`mapConfigIssues`, tracked as
`registry-error-consolidation`); this outer shape was missed. Reconfirmed
against current file contents (`src/engine/registry-check.ts:74-93` for
`checkActionRegistry`, `src/engine/registry-check.ts:148-165` for
`checkDataSourceRegistry`) before designing this change. Extracting one
shared loop removes the duplication with no behavior change.

## What Changes

- Add a shared `checkTypedConfig(sites, resolveFn, entityLabel)` helper in
  `src/engine/registry-check.ts` that runs the resolve → not-registered →
  `configSchema`-safeParse-and-map loop once, over a normalized
  `TypedSite[]` (`{ loc, type, config }`).
- `checkActionRegistry` and `checkDataSourceRegistry` keep their existing
  public signatures (`(body, registry)` / `(body, dataSourceRegistry)`);
  each maps its own collected sites to `TypedSite[]` and delegates to
  `checkTypedConfig`, passing its own resolve function and entity label
  (`"action"` / `"data source"`).
- No new test file — `test/registry-check.test.ts` and
  `test/data-source-registry-check.test.ts` already exercise every branch
  this helper covers (all-registered pass, unregistered-type rejection,
  config-schema violation, no-declared-schema acceptance, reserved-prefix
  skip, multi-issue aggregation) for both functions independently; a
  behavior-preserving extraction is verified by these suites passing
  unchanged.
- Out of scope: `checkAssignmentRegistry` (structurally different — no
  registry to resolve against, mandatory rather than optional
  `configSchema`); `collect`/`collectDataSources` (site-collection stays
  as-is, only the validation loop after collection is shared); audit item 4
  (`migrateInstances`/`findOrphanKeys` keyset pagination — unrelated,
  separate change).

## Capabilities

### New Capabilities

- `registry-config-check-consolidation`: a structural requirement that the
  resolve → not-registered → `configSchema`-safeParse-and-map loop used by
  `checkActionRegistry` and `checkDataSourceRegistry` is implemented once
  (`checkTypedConfig` in `registry-check.ts`) and reused by both, instead of
  duplicated inline — the mechanism-level counterpart to
  `registry-error-consolidation`, `field-expression-map-consolidation`, and
  `array-crud-by-index-consolidation` (added for earlier findings in the
  same audit report), recorded so the "don't re-duplicate this" constraint
  doesn't silently regress. External behavior (emitted `RegistryIssue`
  messages and shapes, both functions' exported signatures) is unchanged.

### Modified Capabilities

None — no requirement in `openspec/specs/action-registry-validation/spec.md`
or `openspec/specs/data-source-registry-validation/spec.md` changes. Each
function's observable validation behavior is unchanged; only the location
of the code implementing the shared loop shape moves, which the new
capability above documents.

## Impact

- **Affected code**: `src/engine/registry-check.ts` only.
- **Affected systems**: publish-time registry validation
  (`checkActionRegistry`, `checkDataSourceRegistry`), called from
  `publishBody`/`definitions.ts`. No schema, contract, or runtime changes.
- **Rollback**: revert `src/engine/registry-check.ts` to its prior form.
