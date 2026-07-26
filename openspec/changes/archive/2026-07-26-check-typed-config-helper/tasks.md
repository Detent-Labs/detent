## 1. Shared helper

- [x] 1.1 In `src/engine/registry-check.ts`, add the `TypedSite` interface
      and the `checkTypedConfig(sites, resolveFn, entityLabel)` function
      per `design.md`.

## 2. Call-site migration

- [x] 2.1 `checkActionRegistry`: map `collect(body)`'s filtered sites to
      `TypedSite[]` and delegate to `checkTypedConfig` with the existing
      `resolve(registry, type)` and the `"action"` label, in place of its
      current inline loop.
- [x] 2.2 `checkDataSourceRegistry`: map `collectDataSources(body)`'s sites
      to `TypedSite[]` and delegate to `checkTypedConfig` with the existing
      `resolveDataSource(dataSourceRegistry, type)` and the `"data source"`
      label, in place of its current inline loop.

## 3. Verification

- [x] 3.1 Run `bun run typecheck`.
- [x] 3.2 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun) and confirm `test/registry-check.test.ts` and
      `test/data-source-registry-check.test.ts` pass unchanged.
