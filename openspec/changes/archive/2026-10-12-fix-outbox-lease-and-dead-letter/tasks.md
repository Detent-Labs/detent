# Tasks

## 1. The marking transaction matches its claim, and the deadline is the remaining lease

- [x] 1.1 Add `AND attempts = ${attempts}` to the three tx2 statements in `src/engine/outbox.ts` (design decision 3). Test in `test/outbox.test.ts`: a `deliverFn` raises the row's `attempts` and `claimed_at` itself, as a peer's reclaim would, then throws. After the pass the row is still `claimed` with the raised count. A second test returns a patch and expects no writeback and no outcome. A third reaches the cap and expects the row not `dead-letter`.
- [x] 1.2 Take `performance.now()` before the claim `UPDATE` and give each row the remaining lease as its deadline (design decision 1). Test: ten rows, a handler that sleeps 100 ms and records `performance.now()` at its start, `leaseMs` 250. The test takes its own `performance.now()` just before the call. No recorded start is later than that reading plus 250 ms. Fewer than ten handlers started, and no row is `claimed` after the pass. The actions declare `backoff: "none"`, so repeated passes with a fast handler deliver all ten.
- [x] 1.3 Release a row whose remaining lease is zero or less, without running its handler (design decision 2). Test: a first row whose handler hangs past the lease and a second row behind it. After the pass the second row is `pending`, its handler never ran, and the next pass delivers it. Its `attempts` equal their value before the claim, and `claimed_at` is null. Change the existing test at `test/outbox.test.ts:861`, where a spawn row sits behind a hung row. It expects 0 delivered in the first pass and the spawn row in the second.
- [x] 1.4 Change the `ponytail:` comment on `CLAIM_LEASE_MS` and the header comment of `drainOutbox`. Both say the lease covers the batch and the deadline is the remainder.

## 2. A row past its cap dead-letters, and the writeback path is one element

- [x] 2.1 Dead-letter a row claimed with `attempts` above `maxAttemptsFor(action)` before any handler runs (design decision 4). Use the dead-letter CAS, store `attempts = maxAttemptsFor(action)`, write `last_error` of `abandoned after N attempts`, append the outcome and log. Test (repro R4): a registry handler returns `{ note: "a\u0000b" }` and the action maps it to a string field. Drain until the row settles, with the lease shortened and each pass at least one lease apart. Expect `dead-letter`, the handler run count equal to the cap, the `last_error` text, and a `dead-letter` outcome in the history entry.
- [x] 2.2 Bind the writeback path as `ARRAY['data', ${fid}::text]` and delete the comments that call `fieldId` a validated uuid (design decision 5). Test: a field id holding `,` and `}` writes under exactly that key of `data`, and no other key changes. Confirm first that the id passes `fieldId` and that the instance can hold it.
- [x] 2.3 Add a test for an action with `retry.maxAttempts` of 2. Its failing handler runs twice, and the row dead-letters on the second failure. No pass claims the row again. The existing cap tests stay green.

## 3. Retry bounds

- [x] 3.1 Change `retryPolicy.maxAttempts` in `src/schema/definition.ts` to `z.number().int().min(1).max(20)`. Tests in `test/definitions.test.ts`: 0, 21, 2.5 and `"3"` fail to parse; 1 and 20 parse. Run the `examples/` tests and `packages/web/test/studio-changeSet.test.ts` too, and fix any literal that breaks.
- [x] 3.2 Cap the exponential branch of `backoffMsFor` at `max(base, BACKOFF_CAP_MS)` (design decision 6). The cap is one hour, and the test imports the exported constant. Unit tests: base 1 s at `attempts` 20 gives one hour. Base 2 h at `attempts` 3 gives 2 h. Base 1 s at `attempts` 3 gives 4 s. The modes `fixed` and `none` do not change.
- [x] 3.3 Check `packages/web` for a retry input or a hand-kept list that bounds `maxAttempts` (the `changeSet.ts` entry is a label only). Report the result in the task ledger; change only if a mirror holds the old shape.

## 4. Documentation

- [x] 4.1 Add the retry rules to `### Action` in `docs/authoring-guide.md`. The key `maxAttempts` is a whole number from 1 to 20, and the default is 5. An exponential delay stops growing at one hour. Say that an action which keeps failing ends in the dead letters. Check the section against the spec delta by eye.
- [x] 4.2 State the bound in `.claude/rules/process-contract.md` under "Actions and triggers". Add one sentence to `.claude/rules/authoring-invariants.md` that names the Zod placement and why it holds. Keep both unwrapped around `maxAttempts`.
- [x] 4.3 Strike this change's entry in the audit index in `docs/decisions.md`.
- [x] 4.4 Run the antislop linter on every Markdown file the change touches, with the push-gate range command from `CLAUDE.md`.

## 5. Verification

- [x] 5.1 Run `bun run typecheck`.
- [x] 5.2 Run `bun run build`.
- [x] 5.3 Run the full `bun test` with `DATABASE_URL` set through `scripts/test-gated.sh` in the devcontainer.
- [x] 5.4 Run the prose and whitespace gates on the host over the push range.
