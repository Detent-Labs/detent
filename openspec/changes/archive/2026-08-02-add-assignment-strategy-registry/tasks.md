<!-- antislop: allow-file passive-voice synonym-rotation -->

## 1. Registry

- [x] 1.1 Add `AssignmentStrategyDef` (`resolve`, optional `configSchema`) and
  `AssignmentRegistry` to `src/engine/registry.ts`, beside `DataSourceRegistry`
- [x] 1.2 Add `createAssignmentRegistry`, `registerAssignmentStrategy` and
  `resolveAssignmentStrategy`, mirroring the data-source helpers
- [x] 1.3 Define the resolver context type: `{ config, stepId, instance: { id,
  startedBy, data } }`, and the `Promise<string[]>` return
- [x] 1.4 Add `createDefaultAssignmentRegistry` to `src/engine/host.ts`,
  registering the built-in `static` entry: schema `{ candidates: string[] }`,
  resolver returning `config.candidates` verbatim. It belongs in `host.ts`
  beside `createDefaultDataSourceRegistry`, not in `registry.ts`, which stays
  the leaf module its own doc comment describes
- [x] 1.5 Update the `STATIC_ASSIGNMENT_STRATEGY_TYPE` doc comment, which still
  states that no registry resolves it

## 2. Publish-time validation

- [x] 2.1 Give `checkAssignmentRegistry` an `AssignmentRegistry` parameter in
  `src/engine/registry-check.ts`
- [x] 2.2 Replace its hand-written loop with `checkTypedConfig`, entity label
  `assignment strategy`
- [x] 2.3 Delete `staticAssignmentConfigSchema` and the module's `"static"`
  import
- [x] 2.4 Update the module doc comment, which states that the assignment check
  is direct and registry-free
- [x] 2.5 Add the `assignmentRegistry` parameter to `publishBody` and forward it
- [x] 2.6 Tests: unregistered type rejected; no config issue for a rejected type
- [x] 2.7 Tests: missing `candidates` rejected; non-string entry rejected
- [x] 2.8 Tests: an entry with no declared schema accepts any config; two bad
  steps yield two issues
- [x] 2.9 Test: an identical re-publish of a body whose type the registry
  dropped returns the stored version

## 3. Runtime resolution

- [x] 3.1 Move `resolveStepAssignment` out of `src/engine/transition.ts` into a
  caller-side helper that takes the registry and the resolver context
- [x] 3.2 Replace `planStepEntry`'s resolution with a **required**
  `assignment: Instance["assignment"] | { carry: true }` field on
  `StepEntryOpts`. Required, unlike `timers`. A caller that omits it then fails
  to compile, rather than silently unassigning the step. Fold the existing
  `carryAssignment` flag into that union, and drop the flag
- [x] 3.3 Add the field to `commitTransition`'s `overrides` `Pick`. Update the
  two doc comments the move invalidates: the `carryAssignment` block on
  `StepEntryOpts`, and the "four explicit overrides" sentence on `planStepEntry`
- [x] 3.4 Resolve in `commitTransition` before `planStepEntry`, outside
  `withTransaction`, and pass the result in that field
- [x] 3.5 Pass `{ carry: true }` from `migration.ts::migrateOne`, which
  therefore calls no resolver and pays for no lookup
- [x] 3.6 Replace the inline `config.candidates` read in `createInstance`
  (`src/engine/store.ts`) with an `opts.assignment` input. `createInstance`
  calls no resolver, keeping the persistence-only remit its doc comment states
- [x] 3.7 Resolve the child's initial-step candidates in `src/engine/
  subprocess.ts`'s spawn handler **before** its `withTransaction` opens, and
  pass the result into `createInstance`. The child body, its initial step and
  its seed data are all in hand there
- [x] 3.8 Resolve an unregistered type to an empty list, preserving
  `createInstance`'s current defensive behaviour

## 4. Runtime tests

- [x] 4.1 A `static` step resolves its list verbatim at entry and at creation
- [x] 4.2 A step with no `assignment` leaves `instance.assignment` unset, and
  calls no resolver
- [x] 4.3 A registered resolver returning a promise is awaited, and its list
  lands in `instance.assignment.candidates`
- [x] 4.4 `planStepEntry` calls no resolver: a plan built with the field set
  produces that exact candidate list
- [x] 4.5 A migration passing `{ carry: true }` runs no resolver, and leaves the
  assignment byte-for-byte unchanged
- [x] 4.6 An unregistered type at entry yields empty candidates, and the entry
  commits
- [x] 4.7 Re-entry via a loop-back path still resolves fresh and clears a prior
  claim
- [x] 4.8 A resolver invoked on a transition carrying a `dataPatch` sees the
  merged value in `ctx.instance.data`, not the pre-submission value
- [x] 4.9 A step whose resolved `candidates` is empty rejects every actor at
  `claimStep`: no fallback assignee is substituted
- [x] 4.10 A subprocess spawn onto an assignment-bearing initial step resolves
  before its transaction opens, and the child carries the resolved candidates

## 5. Call sites and regression

- [x] 5.1 Thread the registry from `src/http/server.ts` (`startHttpServer` and
  `createServer`, which already take the other two) through
  `src/runtime/api.ts`, `src/engine/resolution.ts`, `src/engine/timers.ts` and
  `src/engine/subprocess.ts` to every `commitTransition` and `createInstance`
  call site
- [x] 5.2 Wire `createDefaultAssignmentRegistry` into `server.ts`'s entry point,
  beside `createDefaultDataSourceRegistry`
- [x] 5.3 Update `publishBody`'s two callers, `src/http/routes.ts` and
  `src/http/studio-routes.ts`, plus the suites in `test/`, to pass an assignment
  registry carrying the `static` entry
- [x] 5.4 Run `bun run typecheck`
- [x] 5.5 Run the full suite with `DATABASE_URL` set
- [x] 5.6 Check the run's skip count, not only its pass count

## 6. Documentation

- [x] 6.1 Correct `CLAUDE.md`: assignment strategy is an extension point, and
  `"static"` is a registered entry rather than a direct check
- [x] 6.2 Correct `docs/current-state.md` at all three sites. One, the
  not-pluggable paragraph and its ponytail-audit note. Two, the
  `transition.ts::resolveStepAssignment` location the move invalidates. Three,
  the authorization section's analogy to the single `"static"` check on
  `Step.assignment.strategy.type`
- [x] 6.3 Update `docs/authoring-guide.md` where it states the rule for authors
- [x] 6.4 Record in `CLAUDE.md`'s deferred list that change C owns the deadline,
  the failure classification and the `assignment.unresolved` event. Name the
  subprocess-return path that resolves under a row lock there too
