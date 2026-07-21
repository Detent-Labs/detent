## 1. Restructure `makeSpawnHandler`

- [x] 1.1 In `src/engine/subprocess.ts`, split the handler body: an "obtain child"
      phase that produces `{ child, childBody }` — via the existing
      create-from-`inputMapping` path when the row does not yet exist, or via
      loading the row and resolving `childBody` from the child's own
      `{processId, version}` when it does — followed by an unconditional repair
      phase. Collapse the current two-step "SELECT 1 exists check, then a
      separate full load" into a single `loadInstance` call that branches on
      `undefined` vs. a row, avoiding a redundant round trip. Throw if
      `childBody` does not resolve on the "exists" branch, mirroring the
      existing throw on an unresolved `parentBody`/`childBody` in the creation
      branch.
- [x] 1.2 Make the repair phase (`resolveAutomatic`, then the cancel-orphan
      backstop's fresh parent/child reload and conditional `cancelInstance`) run
      for both branches of 1.1, exactly once per delivery, in the same order the
      fresh-creation path already uses.
- [x] 1.3 Confirm the "child does not exist AND parent not running" short-circuit
      (skip creating the child at all) still applies only to the creation branch,
      not to the repair phase.

## 2. Tests

- [x] 2.1 In `test/subprocess.test.ts`, add a redelivery test: create the child via
      one call, then re-invoke the handler as if for a redelivery, on a child
      whose all-automatic path leads it to a terminal outcome — assert the return
      is enqueued (not just that the handler no-ops).
- [x] 2.2 Add a redelivery test for the cancel-orphan backstop: create the child,
      cancel the parent, then re-invoke the handler as a redelivery before the
      backstop has run — assert the child ends up cancelled.
- [x] 2.3 Add a test that redelivering after both repairs already completed
      (drive-to-rest done, and either no orphan or already self-cancelled) is a
      true no-op: no new rows, no state change, no thrown error.

## 3. Verify

- [x] 3.1 `bun run typecheck` clean.
- [x] 3.2 `bun test` with `DATABASE_URL` set: full suite green, including the new
      tests in `test/subprocess.test.ts`.
