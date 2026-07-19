## 1. CEL guard evaluation (engine-side)

- [x] 1.1 Already present: `src/cel/eval.ts` (`evalGuard` — guardless ⇒ true, `buildGuardContext` over the frozen `data`/`instance`/`actor` context, `result`/`child` absent), built with the manual-transition slice.
- [x] 1.2 Already covered by `test/eval.test.ts`.

## 2. Automatic-path selection

- [x] 2.1 In `src/engine/transition.ts`, add pure `selectAutomaticPath(step, ctx)`: automatic paths in ascending `priority`, first path whose guard holds wins (guardless default sorts last per the authoring invariant, so iteration handles it); return null on no-match.
- [x] 2.2 Test (`test/automatic.test.ts`, no DB): higher-priority match wins and short-circuits; false-then-true takes the second; guardless default is the else; no-match returns null. (Spec: "evaluated on step entry in priority order".)

## 3. Single automatic transition

- [x] 3.1 Extract the shared commit block from `executeManualTransition` into `commitTransition(instance, path, target, actions, cause, actorId?, db)`; add `executeAutomaticTransition(instance, path, body, db)` that reuses `orderedTriggerActions` + `commitTransition` with `cause: "automatic"` and no `actorId`. Manual path keeps identical behaviour (`cause: "user"`, `actorId`).
- [x] 3.2 Test (DB-guarded): trigger order S.onExit → path → T.onEntry; `transitionSeq` N→N+1; one `HistoryEntry` with `cause: "automatic"` and no `actorId`; instance `data` preserved. (Spec: "reuses the transition machinery".)

## 4. Run-to-rest driver + cascade termination

- [x] 4.1 Add `resolveAutomatic(instance, body, actor, db)`: loop while the current step is all-automatic and a path matches, committing each hop via `executeAutomaticTransition`; stop at a manual step, an all-automatic step with no match (wait-state), or a terminal step; return the resting instance.
- [x] 4.2 Track entered `currentStepId`s in a visited set; on re-entry, stop, set the instance status to `faulted` (a final status-flip commit, no history), and throw `AutomaticCascadeLoop` naming the repeated step.
- [x] 4.3 Test: no-match leaves `currentStepId` unchanged (wait-state, pure); DB-guarded — a manual transition into an automatic step cascades to a terminal step (each hop its own transition); a data-independent S→T→S cycle stops, parks on the last committed step with status `faulted`, keeps prior hops in history, and raises the loop error. (Specs: "advance to rest", "wait-state", "cascade terminates on a repeated step".)

## 5. Wire into entry points

- [x] 5.1 Fold `resolveAutomatic` into `executeManualTransition` (return the rested instance) and add `startInstance(body, opts, actor, db)` = `createInstance` + `resolveAutomatic`, so a freshly created instance on an automatic `initialStep` advances before returning (store stays pure to persistence).
- [x] 5.2 Test (DB-guarded): `startInstance` on an automatic `initialStep` with a matching path returns the instance advanced past it. (Spec: "advances the instance to rest".)

## 6. Verify

- [x] 6.1 `bun run typecheck` clean; `bun test` green (DB-backed cases skip when `DATABASE_URL` is unset, per the engine-test convention).
