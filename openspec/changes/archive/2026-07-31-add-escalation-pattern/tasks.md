## 1. Extend the example definition

- [x] 1.1 Add a second (escalation) entry to `review.timers` in
      `examples/expense-approval.json`: `duration: "P14D"`,
      `onFire.targetPath` pointing at the new escalation path, per
      design.md's Decisions section.
- [x] 1.2 Add a third path to `review.paths`: `key: "escalate"`,
      `trigger: "manual"`, targeting the new `escalated_review` step.
- [x] 1.3 Append a new `escalated_review` step after `booking_error`:
      `assignment` candidates `["finance-manager"]`, an `onEntry`
      `http.request` notify action, a readonly view mirroring `review`'s,
      and approve/reject paths routing to the same downstream steps
      `review`'s equivalent paths route to.
- [x] 1.4 Confirm every added id is fresh, correctly-prefixed, and follows
      this file's existing readable-id pattern (e.g. `step_aaaa1111-0007-`).
      Confirm every existing id, step, path, and timer stays untouched and
      in its original array position.

## 2. Recompute the definition hash

- [x] 2.1 In the devcontainer, run `definitionHash(compileProcessBody(definition))`
      against the changed `definition`, importing both from
      `src/schema/hash.js` and `src/schema/compile.js`. Hash the compiled
      body, not the raw authored one; `test/validate.test.ts:735` asserts
      exactly this call, and hashing the wrong body has silently broken
      this fixture before.
- [x] 2.2 Write the recomputed hash back into the stored file's top-level
      `definitionHash` field.

## 3. Add end-to-end coverage

- [x] 3.1 Add a test (in `test/runtime-api.test.ts` or `test/http.test.ts`,
      beside the existing expense-approval happy-path tests) that drives an
      instance to `review`, lets the escalation timer fire, and asserts the
      transition to `escalated_review`.
- [x] 3.2 In the same test, assert the new assignment candidate
      (`finance-manager`) can see and claim the escalated instance.
- [x] 3.3 In the same test, assert the `escalated_review` `onEntry` notify
      action dispatches (an `ActionOutcome` or outbox row for it exists).
      Landed in `test/runtime-api.test.ts` as a new test, "escalation: an
      unactioned review escalates to a manager after the SLA timer fires."
      Discovered mid-implementation, not anticipated by this task list: the
      new `http.request` action on `escalated_review` is a type neither
      `test/runtime-api.test.ts`'s nor `test/http.test.ts`'s own
      hand-built expense-approval registry had registered (each only
      stubbed `accounting.postInvoice` and `notify.email`), so both
      existing happy-path tests failed `publishBody`'s registry check
      until each registry gained one added stub line for `http.request`.

## 4. Verification

- [x] 4.1 Run `bun run typecheck` and confirm it passes.
- [x] 4.2 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun) and confirm every test passes: the six existing
      test files that load `expense-approval.json` by array index
      (`test/validate.test.ts`, `test/compile-validation.test.ts`,
      `test/cel.test.ts`, `test/cancel.test.ts`, `test/http.test.ts`,
      `test/runtime-api.test.ts`), `test/strip-compiled.test.ts` (loads
      the same file generically, not by index), and the new test from
      Section 3. Result: 1384 pass, 0 fail, 0 skip.
