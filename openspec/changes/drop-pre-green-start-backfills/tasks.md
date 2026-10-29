# Tasks

## 1. Delete the backfills

- [x] 1.1 Delete `scripts/backfill-instance-principals.ts`, `scripts/backfill-process-access-roles.ts` and `test/backfill-process-access-roles.test.ts`. Delete the `backfill-process-access-roles` line from `package.json`.
- [x] 1.2 Delete the sections "The instance-visibility backfill" and "The process-access-roles rollout migration" from `docs/runbooks/deployment.md`. Keep the sections before and after them intact.
- [x] 1.3 In `scripts/gates/pass-floor.txt`, change the integer from 5201 to 5199. Add a note line above it that names the two deleted tests, as design.md D3 states.
- [x] 1.4 Verify with `git grep -n -i 'backfill-instance-principals\|backfill-process-access-roles\|backfillProcessAccessRoles' -- . ':!openspec/changes'`. It prints only the pass-floor note from task 1.3.

## 2. Verification

- [ ] 2.1 Run `sh scripts/dev-exec.sh bun run typecheck`, `sh scripts/dev-exec.sh bun run lint` and `sh scripts/dev-exec.sh bun run build`. Record each exit status.
- [ ] 2.2 With no dev server running, run the full `bun test` with `DATABASE_URL` set through `sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`. Record the summary lines and the gate's verdict.
- [ ] 2.3 Run `sh scripts/dev-exec.sh bun run test:tz`. Record its summary.
- [ ] 2.4 Commit first, then run these on the host. Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and the same pipeline with `whitespace.sh`. Then run `sh scripts/gates/machine-paths.sh`. Record what each printed.

## Workflow follow-up

- Run `openspec-review-change`, then start apply without asking (owner's rule).
- After apply: verify, sync, archive, push, open a PR. Ask the owner before the merge.
