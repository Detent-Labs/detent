## 1. The derivation

- [x] 1.1 Add `scripts/worktree-env.sh`. Source it; confirm it exports four variables. POSIX `sh` only, no bashisms. Two callers declare `#!/bin/sh`, and CI's `sh` is dash. Derive from the caller's working directory, never from `$0`. A sourced script's `$0` is the sourcing shell, not the file.
- [x] 1.2 Guard the script with `command -v git`. Swallow a non-zero `git rev-parse`. Export the established identity in both cases.
- [x] 1.3 Assign all four variables unconditionally. A `${VAR:-default}` form is wrong here. Task 2.4 puts `PORT_VITE` in the container's own environment. Task 6.5 leaves the four exported in an interactive shell. An inherited value would then return another checkout's stack.
- [x] 1.4 Compare `git rev-parse --path-format=absolute --git-dir` with `git rev-parse --path-format=absolute --git-common-dir`. Return the established name and ports where they match. A bare comparison misreads a subdirectory of a main checkout as a worktree.
- [x] 1.5 Derive the project name where the two paths differ. Take the basename of `git rev-parse --show-toplevel` and lowercase it. Replace each run of characters outside `[a-z0-9_-]` with `-`. Prefix `detent-`. Append a hyphen and the full `cksum` value over that path. Two worktrees sharing a basename then get different projects.
- [x] 1.6 Derive the offset as `10 * (1 + cksum(path) % 200)` over that same path. Add it to 3000, 5173 and 8025. The `cksum` value routinely exceeds a signed 32-bit integer, and both dash and Git Bash do 64-bit arithmetic.
- [x] 1.7 Add a `ponytail:` comment naming the collision ceiling.
- [x] 1.8 Add `test/worktree-env.test.ts`, shaped like `test/enable-hooks.test.ts`: create a temporary repository and a linked worktree with `git worktree add`, and source the helper against each. The container cannot resolve the real worktree's `.git` pointer, so the real checkout exercises only the fallback branch. Cover the scenarios in the spec, including a run from a subdirectory of the main checkout. The recreate scenario has a testable half, determinism. Source the helper twice against one worktree. Assert both runs export the same four values.
- [x] 1.9 In that test, name the two worktrees of the differing-offsets case deterministically. Append a counter until their offsets differ, then assert. Assert differing project names with no such loop, since the full `cksum` enters the name.
- [x] 1.10 In that same test, assert the helper's established `COMPOSE_PROJECT_NAME` equals the `name:` attribute in `.devcontainer/docker-compose.yml`. Read that file as text, in the style of `packages/web/test/boundaries.test.ts`. The assertion needs no database and no container.

## 2. Compose

- [x] 2.1 Keep the `name: workflow-engine` literal in `.devcontainer/docker-compose.yml`. Confirm an exported `COMPOSE_PROJECT_NAME` overrides it, with `docker compose -f .devcontainer/docker-compose.yml config`. Compose puts the variable above the attribute, so the literal serves the caller that sourced nothing.
- [x] 2.2 Add `.devcontainer/docker-compose.ports.yml` to `.gitignore`, beside the existing override entry.
- [x] 2.3 Read `CORS_ALLOWED_ORIGINS` from `PORT_VITE`, defaulting to 5173. Emit both `http://localhost:${PORT_VITE}` and `http://127.0.0.1:${PORT_VITE}`. The manual checklist mandates the second address under Windows.
- [x] 2.4 Pass `PORT_VITE: ${PORT_VITE:-5173}` into the `app` service's `environment:` block. `vite.config.ts` then reads the published host port inside the container. Rewrite the mailpit comment at lines 95-97 of the same file. The host binding now comes from `.devcontainer/docker-compose.ports.yml`, which the bring-up generates.
- [x] 2.5 Extend `test/worktree-env.test.ts`: assert the helper's established `PORT_VITE` equals the default in `.devcontainer/docker-compose.yml`'s `PORT_VITE: ${PORT_VITE:-5173}` entry. Assert that file's `CORS_ALLOWED_ORIGINS` entry carries both `http://localhost:${PORT_VITE` and `http://127.0.0.1:${PORT_VITE`. Read the file as text, as task 1.10 does.

## 3. Callers

- [x] 3.1 Source the derivation in `scripts/dev-up.sh`. Pass `-f` in this order: the base file, then `.devcontainer/docker-compose.override.yml` only where that file exists, then `.devcontainer/docker-compose.ports.yml` last. Drop the block that writes the override when it is missing.
- [x] 3.2 Write the ports file from `PORT_*` as a whole file. Each generated mapping carries the `127.0.0.1:` host_ip prefix, as the block it replaces does. Without it Docker binds `[::]`, and the host browser meets a connection reset on Windows. Each mapping is `127.0.0.1:${PORT_*}:<container port>`. The container sides stay 3000, 5173 and 8025.
- [x] 3.3 Where the override holds the exact block the old script wrote, remove that file from disk. Leave any other override alone, print why, and name the derived ports.
- [x] 3.4 Print the three bound addresses at the end of the bring-up, each as `http://127.0.0.1:<port>`, never `localhost`. Under Windows `localhost` resolves to `::1` and the connection hangs.
- [x] 3.5 Source it in `scripts/preflight.sh`. Probe `PORT_APP` and `PORT_MAILPIT`. Rewrite the comment at `scripts/preflight.ps1` line 6, which names the port list `3000 8025`.
- [x] 3.6 Rewrite each preflight repair hint to name this checkout's command.
- [x] 3.7 Source it in `.githooks/pre-push` and `scripts/gates/lockfile.sh`.
- [x] 3.8 Source it in each Docker step of `.github/workflows/check.yml`. Three steps drive compose directly, and the lockfile gate in the same job execs into the derived project. Line 74's `up -d --wait` keeps its bare base `-f`. A runner has no generated ports file and publishes no host port. The `-f` rule task 3.10 states does not reach it.
- [x] 3.9 Sweep every remaining literal `docker compose -f .devcontainer/docker-compose.yml` in a tracked file. An `exec`, `ps` or `logs` site keeps that base `-f` and gains a source of the helper. The project name alone resolves the container there. The known sites are `.claude/skills/devcontainer-exec/SKILL.md` and the repair line at `scripts/gates/lockfile.sh` line 42, which leads with `. scripts/worktree-env.sh &&`. A third is `scripts/preflight.sh` line 72, check 5's seed hint, which task 3.6 rewrites.
- [x] 3.10 An `up` site never carries a bare base `-f`, since the published ports live in the generated file. The hints at `scripts/preflight.sh` line 41 and `.githooks/pre-push` line 22 print `bash scripts/dev-up.sh`. Checks 3 and 4 already print that form.
- [x] 3.11 The skill at `.claude/skills/devcontainer-exec/SKILL.md` lines 6-7 prints `bash scripts/dev-up.sh` too. The skill states the precondition wherever it also shows the raw invocation. After a bring-up has generated `.devcontainer/docker-compose.ports.yml`, add that file as the last `-f`. Add `-f .devcontainer/docker-compose.override.yml` before it only where the reader keeps one.

## 4. Vite

- [x] 4.1 Feed `server.hmr.clientPort` from the environment in `packages/web/vite.config.ts`. Fall back to 5173 where the environment carries no `PORT_VITE`, as tasks 2.3 and 2.4 do.
- [x] 4.2 Extend the "pins one dev port" case in `packages/web/test/boundaries.test.ts`. Assert `vite.config.ts` contains `hmr` and `PORT_VITE`. A later change then cannot drop the environment read while keeping the pin. Confirm the suite still passes.

## 5. Documentation

- [x] 5.1 Teach `.claude/skills/devcontainer-exec/SKILL.md` to source the derivation. Rewrite its port-publishing paragraph at lines 21-27. The bring-up publishes the derived ports into `.devcontainer/docker-compose.ports.yml` and prints them. A hand-written override is for an extra binding of the contributor's own. A literal `5173:5173` in a worktree collides with the main checkout.
- [x] 5.2 In that same paragraph, correct the dev-server command to `cd packages/web && bun run dev -- --host 0.0.0.0`, since the repo root declares no `dev` script. Say too that a worktree's dev server needs `VITE_API_URL=http://127.0.0.1:$PORT_APP`, the engine address the bring-up printed.
- [x] 5.3 Carry the derivation into `CLAUDE.md` and `docs/current-state.md`. In `docs/current-state.md`, line 582 states `CORS_ALLOWED_ORIGINS=http://localhost:5173` as a literal, which task 2.3 makes derived. Line 870 of that file names the override as where port publishing belongs, which the ports file replaces. At line 796, precede `docker compose logs app` with a source of the derivation. At line 2166, say the hook execs into the project the pushing checkout derives, not one shared container.
- [x] 5.4 Rewrite the operating rules in `docs/browser-checks.md` for the derived ports. Say the bring-up writes `.devcontainer/docker-compose.ports.yml`, and that the override file stays the contributor's. Correct the override snippet at lines 20-24 to `- "127.0.0.1:3001:3000"`. Task 3.2 names that prefix as load-bearing on Windows.
- [x] 5.5 Add `worktree-isolation` and `push-gate-checks` to the Specs line of the `CI: DONE` section in ROADMAP.md, and `per-worktree-devcontainer-stacks` to its Change line. Add one sentence there on the per-checkout stack.
- [x] 5.6 Mark `docs/superpowers/specs/2026-08-25-per-worktree-devcontainer-design.md` superseded by this change. Its `.git`-shape branch contradicts the spec. Git ignores that directory, so no commit carries it.
- [x] 5.7 Add a `docs/browser-checks.md` entry, sourced to `per-worktree-devcontainer-stacks`. In a linked worktree, open the dev server at the derived host address. Save a file under `packages/web/src/`, and confirm the browser updates with no manual reload. The entry names `cd packages/web && bun run dev -- --host 0.0.0.0` as what starts that server, since the repo root declares no `dev` script.

## 6. Verification

- [x] 6.1 Run `bun run typecheck`, `bun run build` and the full `bun test` with `DATABASE_URL` set. Check the skip count.
- [ ] 6.2 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` and `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`. Every delta spec here is a new file, so its base count is 0 and every finding reads as a rise.
- [x] 6.3 Bring up a worktree stack. Confirm `PORT_APP` and `PORT_MAILPIT` answer on `127.0.0.1`, and differ from main's. Confirm the printed dev-server address matches `PORT_VITE`. The bring-up starts no dev server, so that address answers only once `cd packages/web && bun run dev -- --host 0.0.0.0` runs, as `.claude/skills/devcontainer-exec/SKILL.md` already requires. Vite otherwise binds localhost inside the container.
- [ ] 6.4 Create a throwaway worktree on a scratch branch. Run `bash scripts/dev-up.sh` in it first. Introduce a type error there, push, and confirm the gate rejects it. Confirm the rejection names the type error from `bun run check`, rather than a stopped preflight. Confirm `docker compose ls` shows the main checkout's containers untouched.
- [ ] 6.5 From that worktree, run `. scripts/worktree-env.sh && docker compose -f .devcontainer/docker-compose.yml down -v`. Its project and its database volume go with it. Then remove the worktree and its scratch branch on the remote.
- [ ] 6.6 Run the suite in two worktrees at once. Confirm both pass.
- [ ] 6.7 Run the new `docs/browser-checks.md` entry in a linked worktree. Confirm the browser updates with no manual reload.
