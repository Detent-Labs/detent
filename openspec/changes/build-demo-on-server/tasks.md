# Tasks

## 1. Build on the server

- [x] 1.1 Change `scripts/deploy-demo.sh` as design.md D1 to D4 state. Keep the dirty-tree guard, the shared SSH connection, the 0/1/255 handling and the order of the later steps. `sh -n` passes.
- [x] 1.2 In `test/demo-deployment.test.ts`, add the three `checkDeploy` rules of design.md D5, each with a breaking fixture. Reword the prune rule's message to "after the build".
- [x] 1.3 In `docs/runbooks/demo.md`, describe the new deploy flow. The operator's machine needs only `git` and SSH. Leave a placeholder line for the measured build times. The test deploy fills it.

## 2. Verification

- [ ] 2.1 Run `sh scripts/dev-exec.sh bun run typecheck` and `sh scripts/dev-exec.sh bun run lint`. Record each exit status.
- [ ] 2.2 With no dev server running, run the full `bun test` with `DATABASE_URL` set through `sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`. Record the summary lines and the gate's verdict.
- [ ] 2.3 Commit first, then run these on the host. Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and the same pipeline with `whitespace.sh`. Then run `sh scripts/gates/machine-paths.sh`. Record what each printed.

## Workflow follow-up

- Run `openspec-review-change`, then start apply without asking (owner's rule).
- Verify, sync and archive before the push.
- Test deploy, on the pushed branch: deploy it twice from a clean tree. The first run builds cold, the second warm. Record each build time and the server's memory peak in `docs/runbooks/demo.md` and the PR, as one follow-up commit.
- Ask the owner before the merge.
