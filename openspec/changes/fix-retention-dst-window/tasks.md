# Tasks

## 1. Compute the cutoff in the engine

- [ ] 1.1 In `test/retention.test.ts`, add two tests after the existing boundary test. Follow design.md D3:
  - Each test passes a fixed `now` as the third argument of `sweepRetention`.
  - The autumn test uses `Date.parse("2026-11-01T12:00:00.000Z")`.
  - The spring test uses `Date.parse("2027-04-10T12:00:00.000Z")`.
  - Each test name says which change the window holds.
  - Run the full suite as in task 2.2. Both new tests must fail by name on the unchanged code.
- [ ] 1.2 In `src/engine/retention.ts`, compute the cutoff in the engine:
  - Add `DAY_MS`. Change the signature to `sweepRetention(db: SQL, days: number, now: number = Date.now())`.
  - Compute `new Date(now - days * DAY_MS).toISOString()` once, before the paging loop.
  - Change the signature to `retentionSelect(db: SQL, cutoff: string, lastEntry: string, lastId: string)`.
  - Its query compares the entry expression with `< ${cutoff}`. Delete the `make_interval`/`to_char` expression.
  - The doc comment states that the engine computes the cutoff from its own clock. A day counts 24 hours.
  - Verify with `grep -n 'make_interval\|to_char' src/engine/retention.ts` printing nothing.
- [ ] 1.3 In `test/worker-scan-plans.test.ts`, pass a cutoff string to `retentionSelect` instead of the day count. Compute it from `RETENTION_DAYS` the way task 1.2 does. Leave every plan assertion unchanged. Record the exit status of `sh scripts/dev-exec.sh bun run typecheck`.
- [ ] 1.4 Run the full suite as in task 2.2. Four retention tests must pass by name:
  - both new tests from 1.1
  - "sweepRetention selects an instance just outside the window and not one just inside it"
  - "a retention tick with nothing eligible reads no instance row"
- [ ] 1.5 In `docs/runbooks/deployment.md`, change the `DATA_RETENTION_DAYS` row's description to "The age, in days of 24 hours, at which the sweep redacts a terminal instance. A positive integer." Verify with `grep -n 'days of 24 hours' docs/runbooks/deployment.md`.

## 2. Verification

- [ ] 2.1 Run `sh scripts/dev-exec.sh bun run typecheck`, `sh scripts/dev-exec.sh bun run lint` and `sh scripts/dev-exec.sh bun run build`. Record each exit status.
- [ ] 2.2 With no dev server running, run the full `bun test` with `DATABASE_URL` set through `sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`. Record the summary lines and the gate's verdict.
- [ ] 2.3 Run `sh scripts/dev-exec.sh bun run test:tz`. Record its summary.
- [ ] 2.4 Commit first, then run these on the host. Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and the same pipeline with `whitespace.sh`. Then run `sh scripts/gates/machine-paths.sh`. Record what each printed.

## Workflow follow-up

- Run `openspec-review-change`, then start apply without asking (owner's rule).
- After apply: verify, sync, archive, push, open a PR, merge once CI is green.
- The merge itself goes to the user as `! gh pr merge <n> --merge`.
