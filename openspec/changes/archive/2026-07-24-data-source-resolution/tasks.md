## 1. Registry mechanism

- [x] 1.1 Add `DataSourceContext`, `DataSourceHandlerDef`, `DataSourceRegistry`, `createDataSourceRegistry`, `registerDataSource`, `resolveDataSource` to `src/engine/registry.ts`, mirroring the action `Registry`.
- [x] 1.2 Add `createDefaultDataSourceRegistry` to `src/engine/host.ts`, registering the built-in `"static"` handler (`configSchema: z.object({ options: z.array(fieldOption) })`, `resolve` echoing `ctx.config.options`).

## 2. Publish-time validation

- [x] 2.1 Add the structural invariant to `src/schema/definition.ts`'s existing `superRefine` block: every `FieldDef.dataSource` (including fields nested inside `group` fields) must resolve to an id present in `body.dataSources`.
- [x] 2.2 Add `checkDataSourceRegistry(body, dataSourceRegistry)` to `src/engine/registry-check.ts`: resolve each `body.dataSources[].type` against the registry, validate `config` against `configSchema` when declared, collect every located issue.
- [x] 2.3 Add `DataSourceRegistryValidationError` alongside the existing `RegistryValidationError`/`AssignmentRegistryValidationError`.
- [x] 2.4 Wire `checkDataSourceRegistry` into `src/engine/definitions.ts::publishBody`, in the same slot as `checkActionRegistry`/`checkAssignmentRegistry` (after the hash-hit no-op return, before CEL/cross-process validation). Add the new required `dataSourceRegistry: DataSourceRegistry` parameter to `publishBody`'s signature.
- [x] 2.5 Update every `publishBody` call site (`src/engine/host.ts`, `test/definitions.test.ts`, and any other publisher) to pass a `DataSourceRegistry`.

## 3. Runtime resolution in the Runtime API Layer

- [x] 3.1 Make `resolveFields` (`src/runtime/api.ts`) `async`, add a required `registry: DataSourceRegistry` parameter, and resolve each `dataSource`-bound view field's options via the registry, memoized by `DataSourceId` within one call.
- [x] 3.2 Add `options?: FieldOption[]` to `ResolvedViewField`, populated from static `field.options` or the resolved data-source result.
- [x] 3.3 Update `optionValuesValid` to validate against the resolved `options` instead of reading `FieldDef.options` directly.
- [x] 3.4 Add a `registry: DataSourceRegistry` parameter to `createProcessInstance`, `getInstanceView`, and `submitAndTransition`, threaded into `resolveFields`/`validateSubmissionData`; update all `await` call sites for `resolveFields` now being async.
- [x] 3.5 Throw a plain `Error` naming the unresolved type if a registry lookup fails at runtime despite passing publish-time validation (canary case).

## 4. HTTP wrapper wiring

- [x] 4.1 Add a `dataSourceRegistry: DataSourceRegistry` parameter to `createServer` and `startHttpServer` (`src/http/server.ts`), threaded into the route handlers (`src/http/routes.ts`) that call `createProcessInstance`/`getInstanceView`/`submitAndTransition`.
- [x] 4.2 Update `startHttpServer`'s bootstrap (and any test harness constructing a server) to pass `createDefaultDataSourceRegistry()`.

## 5. Editor Player

- [x] 5.1 Add `options?: FieldOption[]` to `ResolvedViewField` in `packages/editor/src/player/types.ts`.
- [x] 5.2 In `packages/editor/src/player/FieldInput.tsx`, drop the `usesDataSource` forced free-text fallback and its "data source resolution not yet supported" note; render `select`/`multiselect` from `field.options` unconditionally.

## 6. Tests

- [x] 6.1 `test/registry.test.ts` (or nearest existing registry test file): cover `DataSourceRegistry` construction/registration/lookup and the built-in `"static"` handler. (Added `test/data-source-registry.test.ts`.)
- [x] 6.2 `test/definitions.test.ts`: cover the new `FieldDef.dataSource` structural invariant (parse rejection) and `checkDataSourceRegistry`/`DataSourceRegistryValidationError` (unregistered type, schema-violating config, hash-hit no-op skip). (Structural invariant in `test/validate.test.ts`; pure check in `test/data-source-registry-check.test.ts`; publish wiring in `test/data-source-registry-publish.test.ts`.)
- [x] 6.3 `test/runtime-api.test.ts`: cover `resolveFields` resolving `dataSource`-bound options (including the shared-data-source memoization case), `ResolvedViewField.options`, `optionValuesValid` enforcing membership for `dataSource`-bound fields in both `createProcessInstance` and `submitAndTransition`, and the runtime canary-error case. (Added `test/data-source-resolution.test.ts`.)
- [x] 6.4 `test/http.test.ts`: cover a `dataSource`-bound field's resolved `options` appearing in a `GET /instances/:instanceId` response.
- [x] 6.5 `packages/editor` Player tests (or manual verification if no existing test harness covers `FieldInput.tsx`): confirm a `dataSource`-bound field renders as a populated `select`, not free text. (Updated `packages/editor/test/player-field-input-rendering.test.tsx`.)

## 7. Verification

- [x] 7.1 Run `bun run typecheck` and confirm no errors.
- [x] 7.2 Run the FULL `bun test` suite with `DATABASE_URL` set (never a single-file rerun) and confirm a clean pass with no unexpected skips. (732 pass / 0 fail, stable across two consecutive runs. Also had to `bun install` the workspace and install Playwright's chromium browser + system deps in the devcontainer — pre-existing environment gaps unrelated to this change, not code issues.)
