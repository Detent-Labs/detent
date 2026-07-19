## 1. Generalize the shared commit helper

- [x] 1.1 Change `commitTransition` (`src/engine/transition.ts`) to take an explicit `toStepId`, a nullable `pathId`, and an explicit `status`, instead of deriving them from a `Path`. Keep the transaction body (jsonb_set of `{currentStepId, transitionSeq, status, timers}`, OCC on `transition_seq`, HistoryEntry insert, outbox inserts, target-step timer arming) unchanged.
- [x] 1.2 Update the authored callers (`executeManualTransition`, `executeAutomaticTransition`, `fireTimer`) to pass `path.id` / `path.to` / the `target.terminal ? "completed" : status` value at the call site.
- [x] 1.3 `bun run typecheck` (`tsc --noEmit`) passes; existing engine tests still green (`bun test`).

## 2. Cancel entry point

- [x] 2.1 Add `cancelInstance(instance, body, actor?, db?)` to `src/engine/transition.ts`. Takes an already-rehydrated instance (the caller loads + pin-checks it, matching `executeManualTransition`/`fireTimer` — a divergence from the original `instanceId` plan, chosen for sibling consistency and a deterministic same-seq OCC-race test). If `status !== "running"` return it unchanged (no HistoryEntry, no seq bump).
- [x] 2.2 Resolve the cancel-sink step (`CANCEL_SINK_STEP_ID`) from the frozen body; order triggers as `[source.onCancel ?? [], sink.onEntry ?? []]` — do NOT include the source step's `onExit`.
- [x] 2.3 Commit via the generalized helper with `toStepId: CANCEL_SINK_STEP_ID`, `pathId: null`, `status: "cancelled"`, `cause: "cancel"`, passing the actor id.

## 3. Tests (each scenario a case)

- [x] 3.1 onExit is skipped: cancelling an instance at a step with non-empty `onExit` enqueues only `onCancel` (+ sink `onEntry`), never the `onExit` actions.
- [x] 3.2 Cancel HistoryEntry: `cause == "cancel"`, `pathId == null`, `toStepId` resolves to the cancel-sink in the pinned version body; `status == "cancelled"`; `transitionSeq` bumped by one.
- [x] 3.3 Outbox: `onCancel` then sink `onEntry` actions are enqueued for the committed `transitionSeq`.
- [x] 3.4 No-op: cancelling a `completed` / `cancelled` / `faulted` instance appends no HistoryEntry and does not change `transitionSeq`.
- [x] 3.5 OCC race: a cancel and a normal transition computed from the same `transitionSeq` — exactly one commits, the other raises `ConcurrencyConflict` with no partial write.
- [x] 3.6 Synthesized-transition unit coverage (transition-execution spec): a null-path commit to an explicit target records `pathId: null` and arms the target step's timers like an authored transition.

## 4. Close out

- [x] 4.1 `bun test` and `bun run typecheck` both green.
- [x] 4.2 Update `CLAUDE.md` "Current state" / roadmap #3: runtime cancel done for a single instance; subprocess propagation still deferred.
