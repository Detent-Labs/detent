## 1. Move the base port

- [x] 1.1 Change `_WTENV_BASE_APP` in `scripts/worktree-env.sh` from `3000`
  to `3100`, and verify by running
  `. scripts/worktree-env.sh; echo "$PORT_APP"` from the repository root,
  confirming it prints `3100`
- [x] 1.2 Change the four `"3000"` literals asserted against `PORT_APP` in
  `test/worktree-env.test.ts` to `"3100"`. Three are main-checkout
  assertions, and one is a linked-worktree contrast. Verify by running
  `grep -n '"3000"' test/worktree-env.test.ts`, confirming no match remains

## 2. Verification

- [x] 2.1 Run `bun run typecheck` and confirm it exits clean
- [x] 2.2 Run the full `bun test` suite with `DATABASE_URL` set, never a
  single-file rerun. Confirm every test in `test/worktree-env.test.ts`
  passes, the suite reports zero unexpected skips, and no other test
  regresses
- [x] 2.3 Run `bash scripts/dev-up.sh` in the main checkout. Confirm it no
  longer fails with `ports are not available: exposing port TCP
  127.0.0.1:3000`, and that `.devcontainer/docker-compose.ports.yml` now
  publishes `3100`
