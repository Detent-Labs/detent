## 1. Move the grammar into the contract

- [x] 1.1 Move the ISO-8601 duration grammar into `src/schema/definition.ts` as the
      single source, exported as the total parser `parseIsoDuration` (the regex stays
      module-private — it is weaker than the parser, accepting `P` and `PT`).
- [x] 1.2 Enforce the grammar at PUBLISH via `compile.ts::validateDurations`, **not**
      as a Zod refinement on `duration`: `definition.ts` is also the deserializer for
      stored immutable bodies, so a refinement would make an already-published
      definition throw on read and its pinned instances unrehydratable.
- [x] 1.3 Derive the magnitude bound from a fixed entry-instant ceiling, so a passing
      duration cannot overflow the four-digit-year window when armed before it. State
      the guarantee in the comment so it does not read as a business limit. Apply it
      to `Timer.duration` only — `baseDelay`/`timeout` compute no instant.
- [x] 1.4 Point `durationMs` at the exported grammar instead of its local copy, and
      keep its throw as a defensive assertion (document that it is unreachable for a
      validated body).

## 2. Close the arming-side gap

- [x] 2.1 Bring the duration branch of `armStepTimers` under the same width
      invariant the deadline branch asserts.
- [x] 2.2 Decide the assertion-failure behaviour per design.md: reuse the unarmed
      marker if the sibling change has landed, otherwise throw. Do not silently omit.
- [x] 2.3 Remove the "the duration branch is not total" caveat from the
      `armStepTimers` docstring, which this change makes untrue.

## 3. Tests

- [x] 3.1 Rejecting tests at the publish level in `test/validate.test.ts`: calendar
      units (`P1Y`, `P3M`), non-ISO (`1 day`, `""`), empty designators (`P`, `PT`),
      trailing bare `T` (`P1DT`), and the out-of-range case. Plus the layering
      assertion — an invalid duration still PARSES on the read path while being
      rejected at compile — and coverage of the `onExit`/`onCancel`/`onPath` action
      traversals and of the check's ordering before the idempotent early return.
- [x] 3.2 Accepting tests: `P1W`, `P1D`, `PT1H`, `PT30M`, `PT1.5S`, `P1DT2H30M`.
- [x] 3.3 `test/duration.test.ts`: the schema grammar and `durationMs` accept exactly
      the same set — a table driven from one list, so the two cannot drift.
- [x] 3.4 `test/timer.test.ts`: a step carrying both a duration and a deadline timer
      arms two fixed-width `fireAt` values, and earliest-timer selection between them
      is chronologically correct.
- [x] 3.5 Confirm every existing example and fixture still validates — the tightening
      must not reject a definition that was actually working.
- [x] 3.6 `bun run typecheck` clean and `bun test` green **with `DATABASE_URL` set**.
      Without it the DB-backed suites skip silently and report a false green.

## 4. Documentation

- [x] 4.1 Remove the duration entry from CLAUDE.md's "Decided, not yet built" and
      fold the now-enforced grammar into the contract rules section.
- [x] 4.2 Run `/opsx:verify`, then archive.
