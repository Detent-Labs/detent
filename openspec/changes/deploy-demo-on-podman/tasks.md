# Tasks

## 1. The engine image carries the bundle

- [x] 1.1 Change `deploy/engine.Dockerfile` as design.md D1 states. Keep every comment true, and keep `ENV NODE_ENV=production` before `USER bun`.
- [x] 1.2 Add a test that reads `deploy/engine.Dockerfile`, as design.md D6 states in its second part. It checks that the final stage copies `packages/web/dist` from the `build` stage and sets `WEB_ROOT`. Each rule gets a fixture that breaks it.
- [x] 1.3 On the host, run `podman build -t localhost/detent-engine:check -f deploy/engine.Dockerfile .`. Confirm both facts below, then delete the image with `podman rmi localhost/detent-engine:check`:
  - `podman run --rm --entrypoint ls localhost/detent-engine:check /app/packages/web/dist/index.html` succeeds.
  - `podman run --rm --entrypoint sh localhost/detent-engine:check -c 'test ! -e /app/node_modules/vite'` exits 0.

## 2. The demo definition

- [x] 2.1 Create the units of design.md D2 under `deploy/demo/`, plus `detent-demo-reset.service` and `detent-demo-reset.timer` from D4.
- [x] 2.2 Create `deploy/demo/Caddyfile`. It serves `detent.org` and proxies every request to `localhost:3000`.
- [x] 2.3 Create `deploy/demo/engine.env.example` with the D3 table, secrets as placeholders. Create `deploy/demo/setup.sh` and `deploy/demo/reset.sh` as D3 and D4 state. Both start with `set -eu`, and `sh -n` passes on each.
- [x] 2.4 Create `scripts/deploy-demo.sh` as design.md D5 states. It has no absolute home path, and `sh -n` passes.
- [x] 2.5 Add `test/demo-deployment.test.ts` with the rules of design.md D6, first part, each with a breaking fixture.
- [x] 2.6 Run `QUADLET_UNIT_DIRS=deploy/demo /usr/lib/podman/quadlet -dryrun -user` on the host. It prints a generated service for each unit and no error.

## 3. Documentation and cleanup

- [ ] 3.1 Write `docs/runbooks/demo.md`. It covers the server preparation the operator ran and a 2 GB swap file. It covers the first deploy, a later deploy and a manual reset. It names the known demo logins and the disk-fill response from design.md Risks. It links to `deployment.md` for what each variable means. It restates none of them.
- [ ] 3.2 In `docs/runbooks/deployment.md`, add a link to `demo.md` under "Related".
- [ ] 3.3 In `README.md`, delete the migration note for an old `.devcontainer/` clone. In `.gitignore`, delete the `.devcontainer/` line. Keep `test/dockerignore.test.ts` as it is.
- [ ] 3.4 In `scripts/seed.ts`, change the header comment. The known passwords now apply to local development and to the public demo.
- [ ] 3.5 Run the antislop linter on every Markdown file this change touched. Fix each finding or add a targeted directive with a reason.

## 4. Verification

- [ ] 4.1 Run `sh scripts/dev-exec.sh bun run typecheck`, `sh scripts/dev-exec.sh bun run lint` and `sh scripts/dev-exec.sh bun run build`. Record each exit status.
- [ ] 4.2 With no dev server running, run the full `bun test` with `DATABASE_URL` set through `sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test`. Record the summary lines and the gate's verdict.
- [ ] 4.3 Run `sh scripts/dev-exec.sh bun run test:tz`. Record its summary.
- [ ] 4.4 Commit first, then run these on the host. Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and the same pipeline with `whitespace.sh`. Then run `sh scripts/gates/machine-paths.sh`. Record what each printed.

## Workflow follow-up

- Run `openspec-review-change`, then start apply without asking (owner's rule).
- After apply: verify, sync, archive, push, open a PR. Ask the owner before the merge.
- After the merge, with the owner's go: the first deploy to `detent@detent.org`, then the D7 generator run on the server.
