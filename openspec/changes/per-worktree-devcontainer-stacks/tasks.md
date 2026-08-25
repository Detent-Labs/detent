## 1. The derivation

- [ ] 1.1 Add `scripts/worktree-env.sh`. Source it; confirm it exports four variables.
- [ ] 1.2 Return the established name and ports where `.git` is a directory.
- [ ] 1.3 Derive a slug and an offset where `.git` is a file.
- [ ] 1.4 Add a `ponytail:` comment naming the collision ceiling.
- [ ] 1.5 Add `test/worktree-env.test.ts`. Cover the four scenarios in the spec.

## 2. Compose

- [ ] 2.1 Remove the `name:` literal. Confirm `docker compose config` reports no project name.
- [ ] 2.2 Pin `image: workflow-engine-app:dev` on `app`. Confirm a second project reuses it.
- [ ] 2.3 Read `CORS_ALLOWED_ORIGINS` from `PORT_VITE`, defaulting to 5173.

## 3. Callers

- [ ] 3.1 Source the derivation in `scripts/dev-up.sh`. Generate the override from `PORT_*`.
- [ ] 3.2 Print the bound addresses at the end of the bring-up.
- [ ] 3.3 Source it in `scripts/preflight.sh`. Probe `PORT_APP` and `PORT_MAILPIT`.
- [ ] 3.4 Rewrite each preflight repair hint to name this checkout's command.
- [ ] 3.5 Source it in `.githooks/pre-push` and `scripts/gates/lockfile.sh`.

## 4. Vite

- [ ] 4.1 Feed `server.hmr.clientPort` from the environment in `packages/web/vite.config.ts`.
- [ ] 4.2 Confirm `packages/web/test/boundaries.test.ts` still passes.

## 5. Documentation

- [ ] 5.1 Update `.claude/skills/devcontainer-exec/SKILL.md` to source the derivation.
- [ ] 5.2 Update `CLAUDE.md`, `docs/current-state.md` and `docs/browser-checks.md`.

## 6. Verification

- [ ] 6.1 Run `bun run typecheck`, `bun run build` and the full `bun test`.
- [ ] 6.2 Run both whitespace and prose gates over the touched files.
- [ ] 6.3 Bring up a worktree stack. Confirm its addresses answer and differ from main's.
- [ ] 6.4 Push from a worktree carrying a type error. Confirm the gate rejects it.
- [ ] 6.5 Run the suite in two worktrees at once. Confirm both pass.
