## 1. The hook enables itself

- [ ] 1.1 Add `scripts/enable-hooks.sh`. It sets `core.hooksPath` to
      `.githooks` when a `.git` directory exists and `git` is on the path,
      prints what it did, and exits `0` otherwise.
- [ ] 1.2 Add a `prepare` script to the root `package.json` that runs it.
- [ ] 1.3 Confirm `bun install` sets the value in a fresh clone, and that
      `docker/engine.Dockerfile` still builds, where no `.git` exists.
- [ ] 1.4 Remove the `git config core.hooksPath` instruction from
      `README.md:119`, and say the install does it.

## 2. The deployment runbook

- [ ] 2.1 Write `docs/runbooks/deployment.md` with one table row per
      environment variable. Cover the sixteen the engine reads today, listed
      in design.md, and mark every unsafe default. Add a row for
      `VITE_API_URL`, marked as a build argument rather than a runtime
      variable.
- [ ] 2.2 Add the proxy rule: a proxy must overwrite `X-Forwarded-For`, and a
      deployment sets `TRUST_PROXY` only after that.
- [ ] 2.3 Add the dependency-review section: `bun audit`, the cadence, where
      the result goes, and why no gate runs it.
- [ ] 2.4 Link the runbook from `README.md` and from
      `docs/runbooks/backup-restore.md`, so an operator reaches it from
      either entry point.

## 3. The four variables the sibling changes add

- [ ] 3.1 Add a row for each of `METRICS_TOKEN`, `HTTP_ACTION_ALLOWED_HOSTS`,
      `HTTP_ACTION_ALLOW_INSECURE` and `TRUST_PROXY` whose own change has
      already landed. A row naming a variable no code reads yet is worse
      than no row.
- [ ] 3.2 Leave the rest to their own changes. Each sibling carries a task to
      record its variable, and this runbook is the file that task writes to.

## 4. Documentation

- [ ] 4.1 Update `docs/current-state.md` where it describes the toolchain and
      the runbooks directory.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck`.
- [ ] 5.2 Run the full `bun test` suite with `DATABASE_URL` set. Report the
      pass, fail and skip counts, and compare the skip count against
      `scripts/gates/skip-floor.txt`.
- [ ] 5.3 Read every row of the runbook against `grep -rho
      "process\.env\.[A-Z_]*" src/`. Every variable the code reads has a row,
      and every row names a variable the code reads.
