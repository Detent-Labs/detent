# Tasks

## 1. Pin Bun 1.4.4 and rebuild the devcontainer

- [x] 1.1 Change the four pins of design.md D1:
  - `container/Dockerfile`: `ENV BUN_VERSION=1.4.4`.
  - `deploy/engine.Dockerfile`: `FROM docker.io/oven/bun:1.4.4-slim`, and the tag in its comment.
  - `deploy/frontend.Dockerfile`: `FROM docker.io/oven/bun:1.4.4-slim AS build`.
  - `THIRDPARTY.md`: the runtime image row reads `oven/bun:1.4.4-slim`.
  - Verify with `git grep -n '1\.3\.11' -- container deploy THIRDPARTY.md` printing nothing.
- [x] 1.2 With no dev server running, run `sh scripts/dev-pod.sh up` on the host. Then `sh scripts/dev-exec.sh bun --version` must print `1.4.4`.

## 2. Relock @types/bun and repair the breakage

- [x] 2.1 Set `@types/bun` to `^1.4.4` in `package.json`. Run `sh scripts/dev-exec.sh bun install` (design.md D2):
  - `bun.lock` keeps `"lockfileVersion": 1` and holds `@types/bun@1.4.4`.
  - Extract the `name@version` pairs from the old and the new `bun.lock` and compare the two sets. Report every pair besides `@types/bun` and `bun-types` that moved.
  - On the host, `sh scripts/gates/lockfile.sh` exits 0.
- [x] 2.2 Run `sh scripts/dev-exec.sh bun run scripts/thirdparty.ts --write`. `THIRDPARTY.md` changes only for `@types/bun`, `bun-types` and the runtime image row.
- [x] 2.3 Run typecheck, lint, build, the full suite as in task 3.2, and `test:tz`. Repair each failure as design.md D3 states, and record it under design.md's "Repairs". Repeat until all five pass.
- [x] 2.4 In `test/http-body-size.test.ts`, bring the comment's version note up to date if 1.4.4 refuses an over-size body differently.

## 3. Verification

- [x] 3.1 Run `sh scripts/dev-exec.sh bun run typecheck`, `sh scripts/dev-exec.sh bun run lint` and `sh scripts/dev-exec.sh bun run build`. Record each exit status.
- [x] 3.2 With no dev server running, run the full `bun test` with `DATABASE_URL` set through `sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`. Record the summary lines and the gate's verdict.
- [x] 3.3 Run `sh scripts/dev-exec.sh bun run test:tz` and `sh scripts/dev-exec.sh bun audit --audit-level=high`. Record both results.
- [x] 3.4 Commit first, then run these on the host. Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and the same pipeline with `whitespace.sh`. Then run `sh scripts/gates/machine-paths.sh`. Record what each printed.

## Workflow follow-up

- Run `openspec-review-change`, then start apply without asking (owner's rule).
- After apply: verify, archive, push, open a PR. Ask the user before the merge.
- The CI `e2e` job is this change's browser check (design.md D4).
