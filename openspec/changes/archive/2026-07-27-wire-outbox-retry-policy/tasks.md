## 1. Wire Action.retry into drainOutbox (finding 7)

- [x] 1.1 `src/engine/outbox.ts`: import `durationMs` from `./duration.js`.
- [x] 1.2 Add `maxAttemptsFor(action)` and `backoffMsFor(action, attempts)`
      per `design.md`.
- [x] 1.3 Replace `attempts >= MAX_ATTEMPTS` with `attempts >=
      maxAttemptsFor(row.action)` in the dead-letter branch.
- [x] 1.4 Replace `BACKOFF_BASE_MS * 2 ** (attempts - 1)` with
      `backoffMsFor(row.action, attempts)` in the transient-retry branch.
- [x] 1.5 Delete the `ponytail:` marker comment above `BACKOFF_BASE_MS`
      (retired — per-action config now exists).

## 2. Delete dead type aliases (finding 6)

- [x] 2.1 `src/schema/definition.ts`: delete `export type Timestamp = ...`
      (:161), `export type DefinitionStatus = ...` (:209), `export type
      Execution = ...` (:213), `export type RetryPolicy = ...` (:326),
      `export type TimerAction = ...` (:347), `export type
      PublishedProcessBody = ...` (:683), `export type
      InstanceFaultedReason = ...` (:842), `export type InstanceEventKind
      = ...` (:936). Leave every backing Zod schema untouched (including
      `retryPolicy`, which task 1 now reads from).
- [x] 2.2 Re-confirm each deleted name has zero references repo-wide.
      Confirmed via grep: only the underlying schema declarations and
      unrelated prose matches remain.

## 3. Delete the dead compatibility field, schema, and type alias (finding 9)

- [x] 3.1 `src/schema/definition.ts`: delete the `compatibility:
      compatibility.optional(),` field from `processVersion` (:717).
- [x] 3.2 Delete `export type Compatibility = ...` (:210).
- [x] 3.3 Delete the now-fully-dead `export const compatibility =
      z.enum([...])` schema (:199).
- [x] 3.4 `examples/expense-approval.json`: remove the
      `"compatibility": "compatible"` line.

## 4. Verification

- [x] 4.1 Run `test/outbox.test.ts` and confirm all pass, especially the
      retry/dead-letter tests that pin the no-`retry` default path
      (`"a failed delivery retries later..."`,
      `"a row that keeps failing exhausts attempts and dead-letters"`).
- [x] 4.2 Add and run a test exercising an action with a declared
      `retry.maxAttempts` lower than the default, confirming it
      dead-letters at that lower count.
- [x] 4.3 Add and run a test exercising `retry.backoff: "fixed"` with a
      `baseDelay`, confirming the scheduled `next_attempt_at` reflects the
      fixed delay, not the exponential default. Both new tests added to
      `test/outbox.test.ts`; 29/29 pass, 94 expect() calls.
- [x] 4.4 Run `bun run typecheck`. Passed (engine + editor).
- [x] 4.5 Run `test/definitions.test.ts` and confirm all pass. 32/32 pass,
      98 expect() calls.
- [x] 4.6 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun) and confirm 0 failures, including the
      `expense-approval.json` happy-path tests in
      `test/runtime-api.test.ts` and `test/http.test.ts`. 861 pass, 0
      fail, 2289 expect() calls.
