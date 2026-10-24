# Tasks

## 1. Bump the pin

- [x] 1.1 Set `zod` to `4.6.6` in `package.json` and `packages/web/package.json` (design D1). Leave the peer range in `packages/form-ui/package.json`. Verify with `grep -n '"zod"'` over the three manifests.
- [x] 1.2 Run `sh scripts/dev-exec.sh bun install` (design D2). Verify that `bun.lock` holds one `zod` entry, at 4.6.6, and that `sh scripts/gates/lockfile.sh` exits 0 on the host.
- [x] 1.3 Run `sh scripts/dev-exec.sh bun run scripts/thirdparty.ts --write`. Verify that `THIRDPARTY.md` lists `zod` 4.6.6 and changes nothing else.
- [x] 1.4 Run `sh scripts/dev-exec.sh bun audit --audit-level=high`. It exits 0.

## 2. Verification

- [x] 2.1 Run `bun run typecheck`, `bun run lint` and `bun run build` in the devcontainer. Each exits 0.
- [x] 2.2 Run the full `bun test` with `DATABASE_URL` set, through `scripts/test-gated.sh` in the devcontainer. It reports 0 fail and the gate accepts the run.
- [x] 2.3 Run `sh scripts/dev-exec.sh bun run test:tz`. It reports 0 fail.
- [x] 2.4 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`, the same with `whitespace.sh`, then `sh scripts/gates/machine-paths.sh`. Each exits 0.

## Workflow follow-up

- Archive the change, push the branch and open the PR.
