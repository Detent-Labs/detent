# Tasks

## 1. Pin the CLI

- [ ] 1.1 Set `ENV OPENSPEC_VERSION=1.14.3` in `container/Dockerfile` (design D1). Run `sh scripts/dev-pod.sh up` so the image rebuilds and the pod replays. Verify that `sh scripts/dev-exec.sh openspec --version` prints `1.14.3` and that `bash scripts/preflight.sh core` passes.
- [ ] 1.2 Run `sh scripts/dev-exec.sh env OPENSPEC_TELEMETRY=0 bun run scripts/openspec-review-check.ts bump-openspec-cli` and record its output (design D2).

## 2. Verification

- [ ] 2.1 Run `sh scripts/dev-exec.sh bun run typecheck`, `sh scripts/dev-exec.sh bun run lint` and `sh scripts/dev-exec.sh bun run build`. Record each exit status.
- [ ] 2.2 With the dev server stopped, run the full `bun test` with `DATABASE_URL` set through `sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`. Record the summary lines and the gate's verdict, then restart the server with `bash scripts/dev-up.sh`.
- [ ] 2.3 Run `sh scripts/dev-exec.sh bun run test:tz`. Record its summary.
- [ ] 2.4 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`, the same with `whitespace.sh`, then `sh scripts/gates/machine-paths.sh`. Record what each printed.

## Workflow follow-up

- Run `openspec-review-change`; then start apply without asking (owner's rule).
- Archive last, after the five stacked changes below it.
- No push until the user says the new machine is set up.
