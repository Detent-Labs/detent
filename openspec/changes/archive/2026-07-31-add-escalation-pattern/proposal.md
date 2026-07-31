## Why

Timers are already first-class on a step (Roadmap #3). No documented recipe
exists for the common request "SLA breached, notify a manager, reassign."
Without one, every customer reinvents the same shape per process. Design
approved 2026-07-30
(`docs/superpowers/specs/2026-07-30-escalation-pattern-design.md`); this
change implements it.

## What Changes

- Document the escalation pattern. A step with a human `assignment` carries
  two independent timers from entry. One is a non-forcing reminder
  (`onFire.actions`, already the shape `review`'s existing timer uses). The
  other is a forcing escalation timer (`onFire.targetPath`). Its target
  step has a different `assignment` (the escalation tier) and its own
  `onEntry` notify action.
- Extend `examples/expense-approval.json`. `review.timers` gains a second
  (escalation) entry. `review.paths` gains a third (manual) `escalate` path.
  A new `escalated_review` step follows `booking_error`: assignment
  `finance-manager`, an `http.request` onEntry notify action, and
  approve/reject paths mirroring `review`. It uses `http.request`, not
  `review`'s existing `notify.email`. Only `http.request` is in
  `createDefaultRegistry()`. See design.md's Risks / Trade-offs for the
  gap this leaves in the untouched `notify.email` reminder.

  Every change appends a new element rather than reordering existing
  ones. Index-based references in the six dependent test files stay correct
  (`test/validate.test.ts`, `test/compile-validation.test.ts`,
  `test/cel.test.ts`, `test/cancel.test.ts`, `test/http.test.ts`,
  `test/runtime-api.test.ts`). `test/strip-compiled.test.ts` also loads
  this fixture. It reads the file generically, not by index, so it stays
  unaffected either way.
- Recompute `examples/expense-approval.json`'s stored `definitionHash` for
  the changed body, in the devcontainer per this repo's tooling convention.
- Add a new end-to-end test, alongside the existing expense-approval
  happy-path tests in `test/runtime-api.test.ts` and/or `test/http.test.ts`.
  It exercises the escalation timer firing, the forced transition, the new
  assignment, and the dispatched notify action.
- No engine capability changes. This uses only timers, `assignment`, and
  the existing action registry, all already shipped.

## Capabilities

### New Capabilities
- `escalation-pattern`: the documented SLA-escalation recipe (a reminder
  timer plus a forcing escalation timer to a differently-assigned step).
  Includes its concrete, tested instance in
  `examples/expense-approval.json`.

### Modified Capabilities
None. No existing capability's requirements change. This pattern composes
timers, assignment, and the action registry. None of those three change.

## Impact

- `examples/expense-approval.json`: new timer, new path, new step,
  recomputed `definitionHash`.
- `test/runtime-api.test.ts` and/or `test/http.test.ts`: one new end-to-end
  test.
- No `src/` engine code changes.
- No schema (`src/schema/definition.ts`) changes.
