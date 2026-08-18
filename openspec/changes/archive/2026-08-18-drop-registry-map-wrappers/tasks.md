## 0. Retire the superseded duplicate proposal

- [x] 0.1 Delete `openspec/changes/registry-map-wrappers/`. It proposes this
      same refactor (same six functions, same call sites, same "keep the
      three `create*` factories" decision) and stays open, unarchived, and
      unimplemented; this change supersedes it. Already absent from the tree
      (confirmed via `ls`) — nothing to delete.

## 1. Delete the six wrapper functions

- [x] 1.1 In `src/engine/registry.ts`, delete `register` and `resolve`
      (the action-registry pair). Keep `createRegistry` unchanged.
- [x] 1.2 In `src/engine/registry.ts`, delete `registerAssignmentStrategy`
      and `resolveAssignmentStrategy`. Keep `createAssignmentRegistry`
      unchanged.
- [x] 1.3 In `src/engine/registry.ts`, delete `registerDataSource` and
      `resolveDataSource`. Keep `createDataSourceRegistry` unchanged.
- [x] 1.4 In `src/engine/registry.ts`'s own `createDefaultAssignmentRegistry`,
      rewrite its internal `registerAssignmentStrategy(reg, ...)` call to
      `reg.set(...)`.
- [x] 1.5 In `src/engine/registry.ts`'s own `resolveStepAssignment`, rewrite
      its internal `resolveAssignmentStrategy(reg, ...)` call to
      `reg.get(...)`.

## 2. Update src/ call sites

- [x] 2.1 `src/engine/host.ts`: rewrite the three `register(reg, ...)` calls
      (`HTTP_ACTION_TYPE`, `NOTIFICATION_EMAIL_ACTION_TYPE`,
      `PROCESS_START_ACTION_TYPE`) to `reg.set(...)`, and the two
      `registerDataSource(reg, ...)` calls (`"static"`,
      `DB_LIST_DATA_SOURCE_TYPE`) to `reg.set(...)`.
- [x] 2.2 `src/engine/subprocess.ts`: rewrite the two `register(registry, ...)`
      calls (`SPAWN_ACTION_TYPE`, `RETURN_ACTION_TYPE`) to
      `registry.set(...)`.
- [x] 2.3 `src/engine/outbox.ts`: rewrite `resolve(registry, row.action.type)`
      to `registry.get(row.action.type)`.
- [x] 2.4 `src/engine/registry-check.ts`: rewrite the three lookups
      (`resolve(registry, type)`, `resolveAssignmentStrategy(assignmentRegistry,
      type)`, `resolveDataSource(dataSourceRegistry, type)`) to
      `registry.get(type)`, `assignmentRegistry.get(type)`, and
      `dataSourceRegistry.get(type)` respectively.
- [x] 2.5 `src/engine/assignment-strategies.ts`: rewrite
      `registerAssignmentStrategy(reg, MANAGER_OF_STARTER_STRATEGY_TYPE,
      managerOfStarterStrategyDef)` to `reg.set(MANAGER_OF_STARTER_STRATEGY_TYPE,
      managerOfStarterStrategyDef)`.
- [x] 2.6 `src/runtime/api.ts`: rewrite
      `resolveDataSource(registry, def.type)` to `registry.get(def.type)`.
- [x] 2.7 Re-run the repo-wide grep for the six deleted function names across
      `src/` (`register(`, `resolve(reg`/`resolve(registry`,
      `registerAssignmentStrategy(`, `resolveAssignmentStrategy(`,
      `registerDataSource(`, `resolveDataSource(`) to confirm no `src/` call
      site remains.

## 3. Update the packages/web consumer

- [x] 3.1 `packages/web/src/areas/studio/registry/exampleRegistry.ts`: rewrite
      its two `register(registry, ...)` calls (`"http.call"`,
      `"notify.email"`) to `registry.set(...)`. Keep the `createRegistry`
      import and call, and drop the now-unused `register` name from the same
      import line (`import { createRegistry, register, type Registry } from
      "workflow-engine/engine/registry";` loses `register`). File already
      deleted by `fix-studio-registry-panel-example-mismatch` (an earlier
      change in this same sequence) — nothing left to rewrite.

## 4. Update test fixtures

- [x] 4.1 Re-grep `test/*.test.ts` for the six deleted function names (the
      list in `proposal.md` - Impact is a starting point; this step confirms
      it against the current tree).
- [x] 4.2 Delete `test/registry.test.ts`. Its two tests exercise only
      `register`/`resolve` against a bare `createRegistry()` — once those two
      functions are gone, the file has no subject left of its own; both
      tests would assert native `Map.set`/`Map.get` behavior. No other test
      file covers `createRegistry`'s construction, so nothing else needs a
      replacement test for it.
- [x] 4.3 Update every remaining matched `test/*.test.ts` fixture (every file
      besides the one deleted in 4.2): `register(reg, a, b)` becomes
      `reg.set(a, b)`; `resolve(reg, a)` becomes `reg.get(a)`;
      `registerAssignmentStrategy(reg, a, b)` becomes `reg.set(a, b)`;
      `resolveAssignmentStrategy(reg, a)` becomes `reg.get(a)`;
      `registerDataSource(reg, a, b)` becomes `reg.set(a, b)`;
      `resolveDataSource(reg, a)` becomes `reg.get(a)`. Leave every
      assertion, every `createRegistry`/`createAssignmentRegistry`/
      `createDataSourceRegistry` call, and every other line untouched.
- [x] 4.4 Delete the now-unused `register`/`resolve`/
      `registerAssignmentStrategy`/`resolveAssignmentStrategy`/
      `registerDataSource`/`resolveDataSource` names from each file touched
      in 4.3's import line, keeping `createRegistry`/`createAssignmentRegistry`/
      `createDataSourceRegistry` and every other still-used import.

## 5. Apply the spec delta

- [x] 5.1 Run `openspec-sync-specs` (or the project's equivalent step) to
      merge `openspec/changes/drop-registry-map-wrappers/specs/
      data-source-resolution/spec.md`'s MODIFIED requirement into
      `openspec/specs/data-source-resolution/spec.md`, replacing the
      `registerDataSource`/`resolveDataSource` wording with
      `createDataSourceRegistry` plus direct `Map.set`/`Map.get` calls. While
      merging, found and fixed a second, unrelated staleness in the same live
      spec: its "resolved at runtime" requirement and two scenarios still
      described `resolveFields`' per-call memoization, which
      `dedup-runtime-pagination-webhook-sink` (an earlier change in this
      sequence) removed without a spec delta. Corrected the requirement text
      and merged the two "resolve it once"/"resolve separately" scenarios
      into one "each resolve it independently" scenario, matching current
      behavior. Also fixed the same stale claim in `docs/current-state.md`.

## 6. Verification

- [x] 6.1 Run `bun run typecheck` and confirm it reports zero errors. This
      is the primary safety net for a call site the grep in tasks 2.7/4.1
      missed. Caught 8 real errors on the first pass (unused imports and two
      function-call-as-first-argument call sites the mechanical rewrite's
      regex could not match); all fixed, now zero.
- [x] 6.2 Run `bun run build` and confirm it succeeds.
- [x] 6.3 Run the FULL `bun test` suite with `DATABASE_URL` set and confirm
      every test passes, with no unexpected skips (check the skip count,
      not just the pass count). 2743 pass, 1 skip, 0 fail, 155 files — exactly
      2 fewer tests and 1 fewer file than baseline, matching `registry.test.ts`'s
      deletion.
- [x] 6.4 Run the antislop linter on every Markdown file this work
      touched: `proposal.md`, `design.md`, the spec delta, and the archived
      `openspec/specs/data-source-resolution/spec.md` after step 5.1. Confirm
      zero error-severity findings. No rise in finding count on any touched
      file, including `docs/current-state.md` (fixed alongside 5.1).
- [x] 6.5 Run `git diff --check` and confirm no trailing whitespace or
      blank-line-at-EOF findings in the pushed range.
