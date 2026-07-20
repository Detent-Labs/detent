## 1. Instant parsing

- [x] 1.1 Add an `instantFromValue(v: unknown): string | null` helper to
      `src/engine/duration.ts`: returns a UTC ISO-8601 string for a parseable
      instant, `null` otherwise. Accepts date-only (`2026-08-01` → midnight UTC),
      offset-bearing, and `Z`-suffixed strings; treats a naive datetime as UTC by
      appending `Z` rather than letting `new Date()` apply host-local time.
      Non-strings and `Invalid Date` yield `null`.
- [x] 1.2 Test `instantFromValue` directly: date-only, offset-bearing, `Z`,
      naive-as-UTC (assert host-TZ independence), non-string, garbage string.

## 2. Authoring scope

- [x] 2.1 In `src/cel/check.ts`, collect the `deadline` site with `child: false`
      instead of the step's `child` flag — a deadline is evaluated at entry, before
      a child exists, so `child.*` is never resolvable there.
- [x] 2.2 Add a rejecting test in `test/cel.test.ts`: a deadline on a subprocess
      step referencing `child.outcome` is now a `CelIssue`, while the same
      reference in that step's path guard still passes.
- [x] 2.3 Confirm `examples/expense-approval.json` still validates (it declares no
      deadline timer, so this is a regression check, not an expected change).

## 3. Arming

- [x] 3.1 Change `armStepTimers` to accept the `ProcessBody` and the entry-time
      `Instance` alongside `step` and `entryInstant`, and update its module comment
      (the current one states deadline timers are deferred and skipped).
- [x] 3.2 Add the deadline branch: build the guard context via `buildGuardContext`
      from `src/cel/eval.ts` with `SYSTEM_ACTOR`, evaluate the deadline expression,
      pass the value through `instantFromValue`, and arm only on a non-null result.
      Wrap evaluation so a throw omits the timer instead of propagating — arming
      stays total.
- [x] 3.3 Update the `commitTransition` call site in `src/engine/transition.ts` to
      pass the body and the entry-time instance (the target step and the new
      `transitionSeq`, built before arming and folded back in afterwards).
- [x] 3.4 Update the `createInstance` call site in `src/engine/store.ts` to pass the
      body and the parsed seed instance.
- [x] 3.5 `bun run typecheck` clean.

## 4. Tests

- [x] 4.1 Arming: a deadline timer read from a data field arms with the expected
      UTC `fireAt`; date-only arms at midnight UTC; an offset-bearing value
      normalizes to UTC.
- [x] 4.2 Arming alongside a duration timer on the same step: both armed,
      `next_timer_at` is the earlier `fireAt`.
- [x] 4.3 Non-arming: a deadline reading an unwritten field commits the transition
      and arms nothing for that timer; a well-formed expression yielding a
      non-instant string does the same.
- [x] 4.4 No re-arm: a post-commit writeback that writes the field an omitted
      deadline reads leaves the timer unarmed.
- [x] 4.5 Past deadline: arms with the past `fireAt` and the scheduler fires it on
      the next poll.
- [x] 4.6 End-to-end: an armed deadline timer with a `targetPath` forces its
      transition bypassing the guard, with `cause: "timer"` in history — proving a
      deadline timer is indistinguishable from a duration timer once armed.
- [x] 4.7 Initial-step arming: an instance created on an initial step carrying a
      deadline timer over seeded data arms it in the INSERT.
- [x] 4.8 Cancel-path regression: `cancelInstance` still commits with the
      synthesized sink (no timers) under the new `armStepTimers` signature.
- [x] 4.9 `bun test` green.

## 5. Result-type check (opportunistic)

- [x] 5.1 Investigate whether `@marcbachmann/cel-js` exposes a site's inferred
      result type. If it is a small addition, constrain a `deadline` site to
      `string` in `src/cel/check.ts` with a rejecting test; if not, leave the
      design's open question standing and note the finding in the design doc.

## 6. Documentation

- [x] 6.1 Update `CLAUDE.md`: remove `deadline` timers from the "Remaining" list
      under roadmap #3 and from the engine `timers.ts` description; note the
      narrowed `child` scope in the `src/cel/check.ts` summary.
- [x] 6.2 Update `README.md` status table if it mentions deadline timers as
      pending.
- [x] 6.3 Run `/opsx:verify`, then archive the change.
