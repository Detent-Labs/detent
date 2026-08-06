## 1. The hook enables itself

- [x] 1.1 Add `scripts/enable-hooks.sh`. It sets `core.hooksPath` to
      `.githooks` when `git rev-parse --git-dir` answers, prints what it set,
      and exits `0` otherwise. Never `[ -d .git ]`: in a linked worktree
      `.git` is a file.
- [x] 1.2 Add a `prepare` script to the root `package.json` that runs it.
- [x] 1.3 Confirm the script sets the value in this worktree, and that it
      exits `0` in a directory holding no repository, which is what
      `docker/engine.Dockerfile` builds from.
- [x] 1.4 Remove the `git config core.hooksPath` instruction from
      `README.md:119`, and say the install does it.
- [x] 1.5 Add `test/enable-hooks.test.ts`. It runs the script through
      `Bun.spawn`, the way `test/schema-bootstrap.test.ts` already runs a
      subprocess. Three cases: a temp directory with `git init` sets
      `core.hooksPath`; a temp directory with no repository exits `0` and sets
      nothing; a temp linked worktree, where `.git` is a file, sets the value
      too. The second case is the violating input the production build sends.

## 2. The deployment runbook

- [x] 2.1 Write `docs/runbooks/deployment.md` with one table row per
      environment variable. Cover the twenty `src/` reads, listed in the
      spec, and mark every unsafe default. Add a row for `VITE_API_URL`,
      marked as a build argument rather than a runtime variable, and one for
      `SEED_ALLOW`, marked as a maintenance-script variable.
- [x] 2.2 Add the proxy rule: a proxy must overwrite `X-Forwarded-For`, and a
      deployment sets `TRUST_PROXY` only after that. Name the entry the engine
      reads, which is the last.
- [x] 2.3 Add the dependency-review section: `bun audit`, the cadence, where
      the result goes, and why no gate runs it.
- [x] 2.4 Make the runbook the one home for the list. Reduce `README.md`'s
      Deploy and Authentication prose to the build and run commands plus a
      pointer, and link the runbook from `docs/runbooks/backup-restore.md`.
- [x] 2.5 Take the runbook to zero antislop findings. It is a new file, so the
      prose ratchet compares it against a base of zero.

## 3. The variables the sibling changes added

- [x] 3.1 Add a row for each of `METRICS_TOKEN`, `HTTP_ACTION_ALLOWED_HOSTS`,
      `HTTP_ACTION_ALLOW_INSECURE` and `TRUST_PROXY`. All four landed already,
      so all four get a row now.
- [x] 3.2 Say plainly that `HTTP_ACTION_ALLOWED_HOSTS` denies by default. An
      existing deployment using `http.request` loses every target on upgrade
      until an operator sets the list.

## 4. Documentation

- [x] 4.1 Change the CI entry in `docs/current-state.md` (near line 1614). Its
      second bullet names the manual `git config core.hooksPath` step as a
      live gap, and that stops being true.

## 5. Verification

- [x] 5.1 Run `bun run typecheck`.
- [x] 5.2 Run the full `bun test` suite with `DATABASE_URL` set. Report the
      pass, fail and skip counts, and compare the skip count against
      `scripts/gates/skip-floor.txt`. One database serves every worktree, so
      the serial runner owns this step.
- [x] 5.3 Read every row of the runbook against the variables the tree reads.
      Search `src/`, `packages/*/src`, `packages/web/vite.config.ts`,
      `scripts/` and `docker/` — `src/` alone misses `VITE_API_URL` and
      `SEED_ALLOW`. Every variable the code reads has a row, and every row
      names a variable the code reads.
- [x] 5.4 Run the antislop linter over every Markdown file this change edits,
      base against tip. The gate blocks a rise.
