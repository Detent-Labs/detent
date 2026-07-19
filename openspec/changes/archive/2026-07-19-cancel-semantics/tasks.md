## 1. Contract constants and reserved names

- [x] 1.1 Define the cancel-sink id/key scheme and the reserved `"cancelled"` outcome literal as documented contract constants in `src/schema/definition.ts` (deterministic, well-known sink id)
- [x] 1.2 Add validation that rejects an authored step colliding with the reserved sink id/key and an authored `outcome == "cancelled"` (resolve the collision open question)

## 2. Schema additions

- [x] 2.1 Add optional `onCancel: z.array(action).optional()` to the `step` schema
- [x] 2.2 Widen the `HistoryEntry.cause` enum to include `"cancel"`
- [x] 2.3 Extend the body `superRefine` action-output validation loop to include `onCancel` action outputs (alongside `onEntry`/`onExit`)
- [x] 2.4 Add the authoring invariant: a published body has exactly one cancel-sink step (reject zero or more than one)

## 3. Publish-time compile pass

- [x] 3.1 Create the compile module (e.g. `src/schema/compile.ts`) that augments an authored `ProcessBody`
- [x] 3.2 Inject exactly one terminal cancel-sink step into the body
- [x] 3.3 For a contracted process, inject the reserved `"cancelled"` outcome bound to the sink; skip for non-contracted processes
- [x] 3.4 Ensure injection runs before `definitionHash = JCS(ProcessBody)` and is deterministic (byte-identical on recompile, idempotent re-publish)
- [x] 3.5 Verify the compiled contracted body passes existing contracted-process invariants (terminal-outcome + outcome-reachability) by construction

## 4. Tests (each invariant ships a rejecting test)

- [x] 4.1 Missing cancel-sink is rejected; duplicate cancel-sink is rejected
- [x] 4.2 `onCancel` output targeting an unknown field is rejected; a step without `onCancel` validates
- [x] 4.3 Compile pass is deterministic and idempotent (same authored body → identical compiled body and `definitionHash`)
- [x] 4.4 Contracted compile yields sink + reserved outcome and satisfies contract invariants; non-contracted compile yields only the sink
- [x] 4.5 Reserved-name collisions (sink id/key, `outcome == "cancelled"`) are rejected

## 5. Example fixture

- [x] 5.1 Exercise `onCancel` cleanup on a real definition (test-embedded fixture in `test/cancel.test.ts`). The parent-guards-on-`child.outcome == "cancelled"` case is a runtime scenario (engine surfaces the child outcome) — deferred with the rest of R6 propagation to #3; the repo has no subprocess example to extend yet, and its contract precondition (the reserved outcome exists on a contracted body) is covered.
- [x] 5.2 Assert the compiled form of `examples/expense-approval.json` gains the cancel-sink (keep the authored example uncompiled)

## 6. Runtime specification (spec-only, no implementation)

- [x] 6.1 Record the cancel transition semantics for the later engine: skip `onExit`; order `onCancel` → `onEntry`(sink); `HistoryEntry` with `fromStepId`=current, `pathId`=null, `toStepId`=sink, `cause`=`"cancel"`, `status`→`"cancelled"`; reuse outbox + `transitionSeq` OCC
- [x] 6.2 Record the downward-only subprocess propagation rule and the v1 no-upward-cancel boundary

## 7. Documentation

- [x] 7.1 Update `CLAUDE.md` (Current state / Open questions): remove `onCancel` from open questions, note cancellation is contract-specified with runtime deferred to the engine skeleton
- [x] 7.2 Update `README.md` status table if it enumerates contract features
