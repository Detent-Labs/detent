## 1. The script arms the keepalive

- [ ] 1.1 Add the keepalive branch to `scripts/enable-hooks.sh`, after the
      `core.hooksPath` line. Hold the value in one variable:
      `ssh -o ServerAliveInterval=20 -o ServerAliveCountMax=30`. One variable,
      so the script compares against the same string it writes.
- [ ] 1.2 Read the current value with `git config --get core.sshCommand`.
      That command exits 1 when the setting is unset, and the script runs
      under `set -e`, so the read needs `|| true`. Without it the script dies
      on the ordinary case.
- [ ] 1.3 Branch four ways, each exiting 0: no value and no `GIT_SSH` writes
      it; an equal value prints that the clone already carries it; a
      different value keeps it and prints the two options to add; `GIT_SSH`
      set in the environment keeps out and prints the same two options.
- [ ] 1.4 Print what the script did in every branch, the way the
      `core.hooksPath` line already does. An install that arms nothing has to
      say so, or the contributor learns it from a failing push.
- [ ] 1.5 Extend the header comment. It lists three cases that end without an
      error today. Name the keepalive, and name the two settings the script
      never touches: a foreign `core.sshCommand` and `GIT_SSH`.

## 2. The tests

- [ ] 2.1 Add a case to `test/enable-hooks.test.ts`: a `git init` temp
      repository with no `core.sshCommand` gains the value, and the run
      prints it.
- [ ] 2.2 Add the violating input. A temp repository whose `core.sshCommand`
      is already `ssh -i /tmp/other_key` keeps exactly that value after the
      run, and the run exits 0. This is the case that rejects an overwrite.
- [ ] 2.3 Add the `GIT_SSH` case. Run with `GIT_SSH` in the child
      environment, and read back no `core.sshCommand`. The existing `run()`
      helper passes `{ ...process.env }`, so this case needs one added key.
- [ ] 2.4 Add the idempotence case. Run twice against one temp repository,
      and read back the same value. The second run's output says the clone
      already carries it.
- [ ] 2.5 Confirm the no-repository case still passes with no new setting.
      That case already exists and guards the production image build.

## 3. Documentation

- [ ] 3.1 Check whether `README.md` or `docs/current-state.md` states the
      push gate's setup. Add the keepalive only where one of them already
      names what `bun install` arms. Do not add a new section for it.

## 4. Verification

- [ ] 4.1 Run `bun run typecheck`, then the full `bun test` with
      `DATABASE_URL` set. Report the pass, fail and skip counts, and compare
      the skip count against `scripts/gates/skip-floor.txt`.
- [ ] 4.2 Time one real push, from the first gate to the last byte. Record
      the number in the archived design. Check 600 seconds against it: the
      product of the two values has to exceed that wall clock. Raise
      `ServerAliveCountMax` if it does not, and say so in the same commit.
- [ ] 4.3 Confirm the arming in this clone. `git config --get
      core.sshCommand` already holds the value here, set by hand on
      2026-08-06, so this clone exercises the equal-value branch rather than
      the writing one. Run the script and read the output.
- [ ] 4.4 Run the antislop linter over every Markdown file this change
      touches. The four new files start at a base of zero and have to reach
      zero.
- [ ] 4.5 Run `git diff --check` over the change.
- [ ] 4.6 Read the `w/` column of `git ls-files --eol` for the changed files.
