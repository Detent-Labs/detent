## Context

Item 3 of `PONYTAIL-AUDIT.md` (scanned 2026-07-24): `checkActionRegistry`
and `checkDataSourceRegistry` duplicate the resolve → not-registered →
`configSchema`-safeParse loop body verbatim — the previous audit round only
deduped the inner Zod-issue-mapping sub-loop (`mapConfigIssues`); this outer
shape was missed. Verified against current file contents before starting
this design:

- `src/engine/registry-check.ts:74-93` (`checkActionRegistry`)
- `src/engine/registry-check.ts:148-165` (`checkDataSourceRegistry`)

Both loops: resolve a `type` string against a registry, emit a
"not registered" issue if resolution fails, otherwise `safeParse` the
site's `config` against the resolved def's optional `configSchema` and map
any failures via the existing `mapConfigIssues`. Only the resolve function
and the entity label in the "not registered" message differ.

## Goals / Non-Goals

**Goals:**
- Extract one shared `checkTypedConfig` helper, used by both
  `checkActionRegistry` and `checkDataSourceRegistry`, removing the
  verbatim outer-loop duplication.
- Preserve both functions' existing public signatures and every emitted
  `RegistryIssue` message and shape exactly.

**Non-Goals:**
- **`checkAssignmentRegistry`.** Structurally different: no registry to
  resolve against (`"static"` is checked directly), and its
  `configSchema` is mandatory rather than optional — forcing it into the
  same helper would add a branch to accommodate a shape it doesn't share,
  which is exactly the kind of unrequested generalization the audit
  doesn't ask for.
- **`collect`/`collectDataSources`.** The site-collection functions
  (including the reserved-action-prefix filter) stay as-is; only the
  validation loop after collection is shared.
- **Audit item 4** (`migrateInstances`/`findOrphanKeys` keyset
  pagination). Unrelated code, separate change, marked low-priority in
  the audit.

## Decisions

### Shared shape

Both call sites' entities (`Action`, `DataSourceDef`) already carry `type`
and `config` fields directly, so sites can be normalized to a common shape
before the shared loop runs — no accessor-function parameters needed:

```ts
interface TypedSite {
  loc: string;
  type: string;
  config: unknown;
}

function checkTypedConfig(
  sites: TypedSite[],
  resolveFn: (type: string) => { configSchema?: z.ZodTypeAny } | undefined,
  entityLabel: string,
): RegistryIssue[] {
  const issues: RegistryIssue[] = [];
  for (const { loc, type, config } of sites) {
    const def = resolveFn(type);
    if (!def) {
      issues.push({ loc, type, message: `${entityLabel} type '${type}' is not registered` });
      continue;
    }
    if (def.configSchema) {
      const result = def.configSchema.safeParse(config);
      if (!result.success) issues.push(...mapConfigIssues(loc, type, result.error.issues));
    }
  }
  return issues;
}
```

Alternative considered: parameterize the helper with accessor functions
(`getType`, `getConfig`) instead of normalizing sites up front. Rejected —
both call sites already have `type`/`config` as direct fields, so an
accessor layer would add indirection with no site actually needing it.

### Call-site changes

`checkActionRegistry` and `checkDataSourceRegistry` keep their existing
public signatures (`(body, registry)` / `(body, dataSourceRegistry)`
respectively — `definitions.ts` and `transition.ts` call these unchanged).
Each maps its own sites to `TypedSite[]` and delegates:

```ts
export function checkActionRegistry(body: ProcessBody, registry: Registry): RegistryIssue[] {
  const sites = collect(body)
    .filter(({ action }) => !action.type.startsWith(RESERVED_ACTION_PREFIX))
    .map(({ action, loc }) => ({ loc, type: action.type, config: action.config }));
  return checkTypedConfig(sites, (type) => resolve(registry, type), "action");
}

export function checkDataSourceRegistry(body: ProcessBody, dataSourceRegistry: DataSourceRegistry): RegistryIssue[] {
  const sites = collectDataSources(body)
    .map(({ dataSource, loc }) => ({ loc, type: dataSource.type, config: dataSource.config }));
  return checkTypedConfig(sites, (type) => resolveDataSource(dataSourceRegistry, type), "data source");
}
```

### Data flow

Unchanged. Same inputs, same `RegistryIssue[]` output, same messages (the
`entityLabel` string reproduces today's literal "action"/"data source"
text in each function's existing message).

### Testing

No new test file. `test/registry-check.test.ts` and
`test/data-source-registry-check.test.ts` already exercise both branches
this helper covers (all-registered pass, unregistered-type rejection,
config-schema violation, no-declared-schema acceptance, reserved-prefix
skip, multi-issue aggregation) for both functions independently — a
behavior-preserving extraction is verified by these suites passing
unchanged. Safety net: `bun test` (existing suites) plus
`bun run typecheck`.

## Risks / Trade-offs

None identified — pure, behavior-preserving extraction; both exported
functions' signatures and emitted `RegistryIssue` messages are unchanged.

## Migration Plan

Pure refactor, no schema/contract/data changes. Rollback is reverting
`src/engine/registry-check.ts` to its prior form.

## Open Questions

None outstanding.
