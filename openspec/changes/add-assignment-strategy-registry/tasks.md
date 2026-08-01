<!-- antislop: allow-file passive-voice synonym-rotation -->

## 1. Registry

- [ ] 1.1 Add `AssignmentStrategyDef` (`configSchema?`, `resolve`) and an
  assignment-strategy map on `Registry` in `src/engine/registry.ts`
- [ ] 1.2 Define the resolver context type: `{ config, stepId, instance: { id,
  startedBy, data } }`, frozen and minimal
- [ ] 1.3 Register the built-in `static` entry: schema
  `{ candidates: string[] }`, resolver returning `config.candidates` verbatim
- [ ] 1.4 Delete the local `staticAssignmentConfigSchema` and the
  `STATIC_ASSIGNMENT_STRATEGY_TYPE` literal comparison it fed
- [ ] 1.5 Add the resolve helper: awaits the resolver under an `AbortSignal`
  deadline, parses the result as `string[]`, returns either candidates or a
  reason
- [ ] 1.6 Add the deadline constant (5 s default) with its environment override

## 2. Publish-time validation

- [ ] 2.1 Update `checkAssignmentRegistry` in `src/engine/registry-check.ts` to
  resolve each `strategy.type` against the injected registry
- [ ] 2.2 Parse each `config` against the resolved entry's `configSchema`; skip
  the config check when the type did not resolve
- [ ] 2.3 Accept any `config` when the resolved entry declares no `configSchema`
- [ ] 2.4 Keep `AssignmentRegistryValidationError` collecting every located
  issue, and keep the call placement in `publishBody` unchanged
- [ ] 2.5 Tests: unregistered type rejected; no config issue for a rejected type
- [ ] 2.6 Tests: missing `candidates` rejected; non-string entry rejected
- [ ] 2.7 Tests: no declared schema accepts any config; two bad steps yield two
  issues
- [ ] 2.8 Test: an identical re-publish of a body whose type the registry
  dropped returns the stored version

## 3. Event kind

- [ ] 3.1 Add the `assignment.unresolved` kind to the `InstanceEvent` union in
  `src/schema/definition.ts`, payload `{ stepId, reason }`, carrying no
  `actions`
- [ ] 3.2 Surface the kind wherever the merged instance record renders event
  kinds (admin area, `getInstanceRecord`)
- [ ] 3.3 Test: the event parses, carries no `actions`, and advances no
  `transitionSeq`

## 4. Runtime resolution

- [ ] 4.1 Make `planStepEntry` report the assignment resolution a step entry
  needs, instead of resolving it, keeping the function pure and synchronous
- [ ] 4.2 Resolve between plan and apply in the transition caller, outside the
  database transaction
- [ ] 4.3 Pass the resolved candidates and any `assignment.unresolved` event
  into apply through the existing caller-supplied override path
- [ ] 4.4 Do the same for instance creation at an assignment-bearing initial
  step in `src/engine/store.ts`
- [ ] 4.5 On failure, commit with empty candidates and the event in the same
  transaction; never roll back the entry
- [ ] 4.6 Leave the migration remap's suppressed re-resolution unchanged

## 5. Runtime tests

- [ ] 5.1 A `static` step resolves its list verbatim at entry and at creation
- [ ] 5.2 A step with no `assignment` leaves `instance.assignment` unset
- [ ] 5.3 An asynchronous resolver's list is awaited and written
- [ ] 5.4 A raising resolver commits the transition, empties `candidates`, and
  records the event with its reason
- [ ] 5.5 A resolver returning a non-list is treated as failed, and its value is
  not written
- [ ] 5.6 A hanging resolver is abandoned at the deadline, and the submit still
  commits
- [ ] 5.7 A failed resolution at creation still creates the instance
- [ ] 5.8 An empty candidate list makes no actor eligible, and no fallback
  assignee appears
- [ ] 5.9 Re-entry via a loop-back path still resolves fresh and clears a prior
  claim

## 6. Call sites and regression

- [ ] 6.1 Update every `publishBody` caller in `src/http/`, `src/runtime/` and
  `test/` to pass a registry carrying the `static` entry
- [ ] 6.2 Run `bun run typecheck`
- [ ] 6.3 Run the full suite with `DATABASE_URL` set
- [ ] 6.4 Check the run's skip count, not only its pass count

## 7. Documentation

- [ ] 7.1 Correct `CLAUDE.md`: assignment strategy is an extension point, and
  `"static"` is a registered entry rather than a direct check
- [ ] 7.2 Correct the matching statement in `docs/current-state.md`
- [ ] 7.3 Update `docs/authoring-guide.md` where it states the rule for authors
- [ ] 7.4 At archive, update the `runtime-events` spec Purpose: twelve kinds,
  with `assignment.unresolved` added to the canonical table
