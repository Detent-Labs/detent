## 1. Publish-time check

- [x] 1.1 In `src/engine/registry-check.ts`, replace `checkAssignmentRegistry(body, registry: AssignmentRegistry)` with a direct check: drop the `registry` parameter, replace the `resolveAssignmentStrategy` lookup with a `strategy.type !== "static"` check, and replace the resolved-`configSchema` parse with a fixed inline `z.object({ candidates: z.array(z.string()) })` parse.
- [x] 1.2 Update `src/engine/definitions.ts::publishBody` to call `checkAssignmentRegistry(body)` (no registry argument); drop the `assignmentRegistry`/`AssignmentRegistry` parameter from `publishBody`'s signature and its `= createDefaultAssignmentRegistry()` default.

## 2. Runtime resolution

- [x] 2.1 In `src/engine/transition.ts`, inline `resolveStepAssignment` to read `strategy.config.candidates` directly (comparing `strategy.type` against `STATIC_ASSIGNMENT_STRATEGY_TYPE`) instead of calling `resolveAssignmentStrategy`; drop the now-unused `ctx`/`buildGuardContext` call in that function (the static strategy never read it) and the function's `assignmentRegistry` parameter.
- [x] 2.2 In `src/engine/store.ts::createInstance`, apply the identical inlining to its own independent `resolveAssignmentStrategy` call for the initial step's assignment (this is a second real read site, not just a threading site — it does not go through `resolveStepAssignment`): read `strategy.config.candidates` directly, drop the now-unused `ctx` computation, and drop the function's `assignmentRegistry` parameter.
- [x] 2.3 Remove the `assignmentRegistry` parameter (and its default) from every other function in `transition.ts` that only threads it through: `commitTransition`, `resolveAutomatic`, `executeManualTransition`, `commitManualTransition`, `cancelInstance`, `sweepCancelledChildren`, `startInstance`, `executeAutomaticTransition`, `fireTimer` — update each internal call (including `startInstance`'s calls to `store.ts::createInstance` and `resolveAutomatic`) to drop the now-removed argument.

## 3. Callers

- [x] 3.1 Update `src/engine/host.ts`, `src/engine/subprocess.ts`, `src/engine/migration.ts` to drop any `assignmentRegistry` construction or pass-through to the functions changed in section 2 — in particular `subprocess.ts`'s spawn handler, which calls `store.ts::createInstance` directly with `assignmentRegistry` as its 4th argument.

## 4. Registry cleanup

- [x] 4.1 Delete `AssignmentRegistry`, `AssignmentStrategyDef`, `createAssignmentRegistry`, `registerAssignmentStrategy`, `resolveAssignmentStrategy`, `createDefaultAssignmentRegistry`, and the `staticAssignmentStrategy` object from `src/engine/registry.ts`. Keep `STATIC_ASSIGNMENT_STRATEGY_TYPE` as a plain exported constant.

## 5. Tests

- [x] 5.1 Rewrite `test/assignment-registry.test.ts` to cover the direct check: a `static` type with a valid `candidates` config passes; a non-`static` type is rejected with a located issue; a `static` type missing/malformed `candidates` is rejected with a located issue; an identical re-publish stays a no-op without invoking the check.
- [x] 5.2 Grep `test/` for any other `assignmentRegistry`/`AssignmentRegistry`/`createDefaultAssignmentRegistry` references (e.g. in `transition`/`definitions`/`http` test setup) and update or remove them to match the new signatures.

## 6. Documentation

- [x] 6.1 Update `CLAUDE.md`'s "Extensibility" paragraph: narrow from five plugin categories to four (drop "assignment strategies"); note `static` is the only supported assignment strategy, not an extension point.
- [x] 6.2 Update `CLAUDE.md`'s "Current state" paragraph describing the assignment-strategy registry to describe the direct check instead.

## 7. Verification

- [x] 7.1 Run `bun run typecheck` inside the devcontainer and fix every compile error surfaced by the parameter removal (this is the primary mechanism for finding missed call sites).
- [x] 7.2 Run the full `bun test` suite inside the devcontainer with `DATABASE_URL` set (never a single-file rerun) and confirm 0 fail, checking the skip count is as expected (DB-backed suites must not silently skip).
