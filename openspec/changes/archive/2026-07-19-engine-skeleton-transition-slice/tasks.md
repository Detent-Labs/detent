## 0. Hash primitive (contract-level, shared with future publishing)

- [x] 0.1 Add `src/schema/hash.ts`: `definitionHash(body)` = sha256 of canonical JSON (JCS subset — sorted keys) of a `ProcessBody`. Beside `definition.ts` because the hash is contract, not engine.

## 1. CEL projection (single source of truth)

- [x] 1.1 Promote `INSTANCE_SCHEMA` in `src/cel/check.ts` to a shared export; keep the authoring check importing it so `test/cel.test.ts` still passes unchanged.
- [x] 1.2 Add `projectInstance(instance)` (beside `src/cel/`) that builds the runtime `instance` namespace from `INSTANCE_SCHEMA`'s keys — map `instanceId → id`, whitelist `{ id, status, transitionSeq, currentStepId }`, drop the rest.
- [x] 1.3 Test: `projectInstance(inst).id` equals `inst.instanceId` and is never `undefined`; a non-whitelisted field (e.g. `definitionHash`) is absent. (Closes the authoring-green/runtime-undefined landmine.)

## 2. Guard evaluation

- [x] 2.1 Add a runtime guard evaluator using `@marcbachmann/cel-js` that evaluates a path guard to a boolean over the frozen context (`data`, projected `instance`, `actor`, data-source results), with `result` unregistered and `child` only inside a subprocess step.
- [x] 2.2 Test: a guard that type-checks at authoring evaluates true/false as expected; referencing `result` is unresolvable in a guard.

## 3. Instance store (Bun.sql)

- [x] 3.1 Idempotent schema init: create `instances` (jsonb body + promoted `instance_id` PK, `transition_seq`) and append-only `history_entries` (keyed by `instanceId`) against `DATABASE_URL`.
- [x] 3.2 `createInstance(body, version)`: pin `{ processId, version, definitionHash }`, set `currentStepId = initialStep`, `transitionSeq = 0`, persist.
- [x] 3.3 `rehydrate(instanceId, body)`: load the row, recompute the JCS hash of `body`, reject on mismatch with the pinned `definitionHash`; return the parsed `Instance`.
- [x] 3.4 Test: create → rehydrate round-trips; rehydration against a mismatched body is rejected.

## 4. Transition executor

- [x] 4.1 `executeManualTransition(instance, pathId, body, actor)`: resolve the path, evaluate its guard (task 2), refuse if false.
- [x] 4.2 Visit `onExit(source) → onPath → onEntry(target)` in order through a no-op `dispatch` seam (the seam the outbox change later replaces).
- [x] 4.3 Commit in one `Bun.sql` transaction: `UPDATE instances SET body, transition_seq=$n+1 WHERE instance_id=$id AND transition_seq=$n`; on zero rows affected, reject as a concurrency conflict; INSERT one `HistoryEntry` (`cause: "user"`, resolved path/from/to, new `transitionSeq`, active `version`).
- [x] 4.4 Test: trigger order is onExit→onPath→onEntry; a guarded path is refused when the guard is false.
- [x] 4.5 Test: sequential transitions increment `transitionSeq` by one and append one history entry each.
- [x] 4.6 Test: two commits from the same `transitionSeq` — first wins, second is rejected with no partial write.

## 5. Verify

- [x] 5.1 `bun test` green (including the Postgres-backed tests) and `bun run typecheck` clean.
- [x] 5.2 `openspec validate --change engine-skeleton-transition-slice` passes.
