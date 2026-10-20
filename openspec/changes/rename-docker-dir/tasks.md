# Tasks

## 1. Move the directory and its readers

- [x] 1.1 Run `git mv docker deploy` per design D1. In `deploy/frontend.Dockerfile`, change the `COPY` source to `deploy/nginx.conf`. In both Dockerfiles, prefix each `FROM` image with `docker.io/` (design D2). In `test/http-error-path.test.ts`, read `../deploy/engine.Dockerfile` (design D2). Verify with `git status --short` showing the three renames and `ls -A docker` failing.
- [x] 1.2 Build both images on this host per design D3 (dependencies installed): `podman build -f deploy/engine.Dockerfile -t workflow-engine:rename-check .` and `podman build -f deploy/frontend.Dockerfile --build-arg VITE_API_URL=https://api.example.com -t workflow-frontend:rename-check .`. Record both exit statuses, and verify that `grep -n '^FROM' deploy/*.Dockerfile` shows a registry host on every line. Then remove both tags with `podman rmi`.

## 2. Documents and comments

- [x] 2.1 Replace the path in `README.md`, `docs/runbooks/deployment.md`, `docs/current-state.md`, `docs/decisions.md`, `THIRDPARTY.md`, `scripts/enable-hooks.sh`, `packages/web/csp.ts`, `packages/web/test/vite-config.test.ts` and `test/enable-hooks.test.ts`. Keep `docker build` as a command wherever it appears. Edit the Purpose paragraph of `openspec/specs/production-docker-images/spec.md` to name `deploy/engine.Dockerfile` and `deploy/frontend.Dockerfile`. Verify with `git grep -n -E '(^|[^a-z_.-])docker/' -- . ':!openspec/changes'` printing only lines from base specs that this change's deltas replace.
- [ ] 2.2 Run the antislop linter on every Markdown file this change touched, if it is installed. Fix each finding or add a targeted directive with a reason. If it is absent, leave this task open and say so.

## 3. Verification

- [ ] 3.1 Run `sh scripts/dev-exec.sh bun run typecheck`, `sh scripts/dev-exec.sh bun run lint` and `sh scripts/dev-exec.sh bun run build`. Record each exit status.
- [ ] 3.2 With the dev server stopped, run the full `bun test` with `DATABASE_URL` set through `sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`. Record the summary lines and the gate's verdict, then restart the server with `bash scripts/dev-up.sh`.
- [ ] 3.3 Run `sh scripts/dev-exec.sh bun run test:tz`. Record its summary.
- [ ] 3.4 On the host, run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`, the same with `whitespace.sh`, then `sh scripts/gates/machine-paths.sh`. Record what each printed.

## Workflow follow-up

- Run `openspec-review-change` and resolve every finding; then start apply without asking (owner's rule).
- Apply runs in the main checkout after `slim-claude-md`'s apply finishes there; rebase this branch onto its tip first.
- Archive last, after the four changes below it.
- No push until the user says the new machine is set up.
