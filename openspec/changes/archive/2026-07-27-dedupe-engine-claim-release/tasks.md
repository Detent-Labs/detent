## 1. Shared updateAssignment helper

- [x] 1.1 `src/engine/transition.ts`: add `AssignmentState` to the
      existing `import type { ... } from "../schema/definition.js"` list.
- [x] 1.2 Add the `updateAssignment(instanceId, actor, db, guard,
      computeNext, eventKind)` helper per `design.md`, computing the
      timestamp once and threading it into `computeNext`.
- [x] 1.3 Rewrite `claimStep` to call `updateAssignment` with its guard
      closure (`NotAssignedError`/`AlreadyClaimedError`/
      `NotACandidateError`), its `computeNext` closure, and
      `"assignment.claimed"`.
- [x] 1.4 Rewrite `releaseClaim` to call `updateAssignment` with its guard
      closure (`NotClaimantError`), its `computeNext` closure, and
      `"assignment.released"`.

## 2. Verification (engine core — high scrutiny)

- [x] 2.1 Read `test/assignment.engine.test.ts` and
      `test/assignment.runtime-api.test.ts` in full to confirm their claim/
      release/race coverage before running them, per `design.md`'s Risks.
      Confirmed: includes "two actors racing to claim the same unclaimed
      step resolve to exactly one winner".
- [x] 2.2 Run `test/assignment.engine.test.ts` and
      `test/assignment.runtime-api.test.ts` and confirm all pass, including
      any concurrent-claim race test. 18/18 pass, 42 expect() calls.
- [x] 2.3 Run `bun run typecheck`. First attempt caught a real type gap:
      `inst.assignment` is `AssignmentState | null | undefined`, not just
      `| undefined` as design.md's first draft assumed — widened `guard`'s
      parameter type accordingly (design.md updated to match). Second
      attempt passed (engine + editor).
- [x] 2.4 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun) and confirm 0 failures. 859 pass, 0 fail, 2286
      expect() calls.
