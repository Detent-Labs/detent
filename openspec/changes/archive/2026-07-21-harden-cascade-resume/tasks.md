## 1. Core flag propagation

- [x] 1.1 In `applyStepEntry` (`src/engine/transition.ts`), add `resolve_state = 'pending'` to the instance UPDATE, alongside `body`, `transition_seq`, and `next_timer_at`, under the existing OCC predicate.
- [x] 1.2 In `createInstance` (`src/engine/store.ts`), add `resolve_state` to the INSERT's column list and value list, set to `'pending'`.
- [x] 1.3 In `migrateInstances` (`src/engine/migration.ts`), remove the now-redundant explicit `UPDATE instances SET resolve_state = 'pending' ...` that follows `applyStepEntry`, keeping the surrounding explanatory comment about why migration defers to the worker.

## 2. Tests: crash-recovery via the resolution worker

- [x] 2.1 Add a test that commits a manual (or automatic) transition onto an all-automatic step whose guard would advance it further, without invoking `resolveAutomatic`, then asserts `drainResolutions` finishes the cascade to rest.
- [x] 2.2 Add a test that calls `createInstance` directly (bypassing `startInstance`'s follow-up `resolveAutomatic`) for a body whose `initialStep` is all-automatic with a matching guard, then asserts `drainResolutions` advances it to rest.
- [x] 2.3 Add a test for the subprocess return path: commit the parent's first hop off its subprocess step (e.g. by driving `makeReturnHandler`'s transaction directly or via a seam that stops short of the post-transaction `resolveAutomatic` call) onto another all-automatic step with a further-matching guard, then assert `drainResolutions` completes the parent's cascade to rest.
- [x] 2.4 Add a test asserting `resolve_state` is set to `'pending'` by a plain manual transition that lands on a *resting* step (manual/terminal/wait-state) too, and that a subsequent `drainResolutions` pass is a no-op that leaves the instance's `currentStepId` and `data` unchanged.
- [x] 2.5 Add/extend a migration test asserting `migrateInstances` still leaves the migrated instance `resolve_state = 'pending'` after removing the explicit UPDATE (i.e. confirms `applyStepEntry` alone now provides it).

## 3. Verification

- [x] 3.1 `bun run typecheck` clean.
- [x] 3.2 `bun test` with `DATABASE_URL` set, full suite green (per project convention, a single-file rerun is not a reliable signal).
- [x] 3.3 Confirm no other read of `resolve_state`'s default (`'idle'`) or of the `instances` INSERT/UPDATE column lists elsewhere in `src/engine/` needs updating (grep for `resolve_state`).
