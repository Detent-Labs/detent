<!-- antislop: allow-file passive-voice synonym-rotation -->

## 1. Registry

- [ ] 1.1 Add `AssignmentStrategyDef` (`resolve`, optional `configSchema`) and
  `AssignmentRegistry` to `src/engine/registry.ts`, beside `DataSourceRegistry`
- [ ] 1.2 Add `createAssignmentRegistry`, `registerAssignmentStrategy` and
  `resolveAssignmentStrategy`, mirroring the data-source helpers
- [ ] 1.3 Define the resolver context type: `{ config, stepId, instance: { id,
  startedBy, data } }`, and the `Promise<string[]>` return
- [ ] 1.4 Register the built-in `static` entry: schema
  `{ candidates: string[] }`, resolver returning `config.candidates` verbatim
- [ ] 1.5 Update the `STATIC_ASSIGNMENT_STRATEGY_TYPE` doc comment, which still
  states that no registry resolves it

## 2. Publish-time validation

- [ ] 2.1 Give `checkAssignmentRegistry` an `AssignmentRegistry` parameter in
  `src/engine/registry-check.ts`
- [ ] 2.2 Replace its hand-written loop with `checkTypedConfig`, entity label
  `assignment strategy`
- [ ] 2.3 Delete `staticAssignmentConfigSchema` and the module's `"static"`
  import
- [ ] 2.4 Update the module doc comment, which states that the assignment check
  is direct and registry-free
- [ ] 2.5 Add the `assignmentRegistry` parameter to `publishBody` and forward it
- [ ] 2.6 Tests: unregistered type rejected; no config issue for a rejected type
- [ ] 2.7 Tests: missing `candidates` rejected; non-string entry rejected
- [ ] 2.8 Tests: an entry with no declared schema accepts any config; two bad
  steps yield two issues
- [ ] 2.9 Test: an identical re-publish of a body whose type the registry
  dropped returns the stored version

## 3. Runtime resolution

- [ ] 3.1 Move `resolveStepAssignment` out of `src/engine/transition.ts` into a
  caller-side helper that takes the registry and the resolver context
- [ ] 3.2 Replace `planStepEntry`'s resolution with a caller-supplied
  `assignment` override on `StepEntryOpts`, beside `timers`
- [ ] 3.3 Resolve in `commitTransition` before `planStepEntry`, outside
  `withTransaction`, and pass the result as that override
- [ ] 3.4 Skip the resolver call entirely when the caller sets
  `carryAssignment`, so a migration pays for no lookup
- [ ] 3.5 Replace the inline `config.candidates` read in `createInstance`
  (`src/engine/store.ts`) with the same helper, before the write
- [ ] 3.6 Resolve an unregistered type to an empty list, preserving
  `createInstance`'s current defensive behaviour

## 4. Runtime tests

- [ ] 4.1 A `static` step resolves its list verbatim at entry and at creation
- [ ] 4.2 A step with no `assignment` leaves `instance.assignment` unset, and
  calls no resolver
- [ ] 4.3 A registered resolver returning a promise is awaited, and its list
  lands in `instance.assignment.candidates`
- [ ] 4.4 `planStepEntry` calls no resolver: a plan built with the override set
  produces that exact candidate list
- [ ] 4.5 A migration with `carryAssignment` runs no resolver, and leaves the
  assignment byte-for-byte unchanged
- [ ] 4.6 An unregistered type at entry yields empty candidates, and the entry
  commits
- [ ] 4.7 Re-entry via a loop-back path still resolves fresh and clears a prior
  claim

## 5. Call sites and regression

- [ ] 5.1 Update every `publishBody` caller in `src/http/`, `src/runtime/` and
  `test/` to pass an assignment registry carrying the `static` entry
- [ ] 5.2 Run `bun run typecheck`
- [ ] 5.3 Run the full suite with `DATABASE_URL` set
- [ ] 5.4 Check the run's skip count, not only its pass count

## 6. Documentation

- [ ] 6.1 Correct `CLAUDE.md`: assignment strategy is an extension point, and
  `"static"` is a registered entry rather than a direct check
- [ ] 6.2 Correct the matching statement in `docs/current-state.md`
- [ ] 6.3 Update `docs/authoring-guide.md` where it states the rule for authors
- [ ] 6.4 Record in `CLAUDE.md`'s deferred list that the deadline, the failure
  classification and the `assignment.unresolved` event belong to change C
