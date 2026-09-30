# Tasks

## 1. Timing test

- [x] 1.1 Rewrite the timing test in `test/auth-users.test.ts` as design.md describes. Keep its name and its one-half bound.
- [x] 1.2 On a copy outside the working tree, make `verifyLogin` return before `verify` on a missing row. Verify that the rewritten test fails against that copy.

## 2. Verification

- [ ] 2.1 Run `bun run typecheck` in the devcontainer. Verify that it exits 0.
- [ ] 2.2 Run the full `bun test` suite with `DATABASE_URL` set three times through `scripts/test-gated.sh`. Verify 0 fail in each run.
- [ ] 2.3 Run the prose gate and the whitespace gate on the host, each fed by `range.sh`. Verify that both exit 0.
