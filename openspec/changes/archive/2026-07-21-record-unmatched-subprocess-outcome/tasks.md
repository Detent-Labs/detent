## 1. Schema

- [x] 1.1 Add the `subprocess.outcome-unmatched` variant to the `instanceEvent`
      discriminated union in `src/schema/definition.ts`, alongside the other
      three no-action kinds' pattern: envelope fields, `kind: z.literal(...)`,
      `payload: z.object({ stepId, outcome: z.string().nullable() }).strict()`,
      no `actions` field.
- [x] 1.2 Run `bun run typecheck` to confirm the new union member doesn't break
      any existing exhaustive `switch`/handling over `InstanceEventKind`.

## 2. Engine

- [x] 2.1 In `src/engine/subprocess.ts`'s `makeReturnHandler`, at the
      `if (!path) return null` branch (currently line ~201), append a
      `subprocess.outcome-unmatched` event via `appendInstanceEvent(tx, ...)`
      before returning `null` — same transaction, same parent row already
      locked, using `parent.transitionSeq`/`parent.version`/`parentStepId`/
      `childOutcome` already in scope.
- [x] 2.2 Import `appendInstanceEvent` and `newInstanceEventId` from
      `./store.js` in `subprocess.ts` (mirroring how `migration.ts` and
      `transition.ts` already import them).
- [x] 2.3 Confirm the event's `at` timestamp uses the same clock source the
      rest of the handler/transaction uses for consistency with sibling event
      emitters.

## 3. Tests

- [x] 3.1 In `test/subprocess.test.ts`, add a case: a subprocess step whose
      automatic paths don't cover one of the child's contract outcomes —
      deliver a return producing that outcome, assert the `outputMapping`
      writeback lands in the parent's `data`, the parent stays parked at the
      subprocess step, no transition/`HistoryEntry` is created, and a
      `subprocess.outcome-unmatched` event is recorded naming the step and
      the outcome.
- [x] 3.2 Add a case for the reserved `"cancelled"` outcome specifically:
      cancel a running subprocess child independently of its parent, let the
      cancel's synthesized terminal return deliver, and assert the same
      `subprocess.outcome-unmatched` event is recorded when the parent's
      step doesn't guard on `"cancelled"`.
- [x] 3.3 Add a negative case: a return whose outcome *does* match a path
      records no `subprocess.outcome-unmatched` event (guards the "matched
      outcome is unaffected" scenario).
- [x] 3.4 Confirm existing subprocess-return tests (redelivery, non-running
      parent, moved-parent, non-subprocess-step failure, no-parent-link)
      still pass unmodified — none of them should now emit this event.

## 4. Verification

- [x] 4.1 `bun run typecheck` clean.
- [x] 4.2 `bun test` with `DATABASE_URL` set — full suite green, including
      the new cases.
- [x] 4.3 Re-read the `runtime-events` and `subprocess-execution` delta specs
      against the implemented behavior for drift before archiving.
