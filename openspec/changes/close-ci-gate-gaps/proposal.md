# Proposal

## Why

Seven findings of the 2026-10-10 audit describe gates and CI steps that pass
without checking what they claim to check. They are G-1, G-2, G-6, G-7, G-8,
G-11 and G-12. G-1 and G-2 are medium and protect every later change.

- G-1: the CI `check` job runs a plain `bun install` first. It re-resolves and
  rewrites `bun.lock` in the bind-mounted `/workspace`. Only then does the
  `frozen-lockfile` gate run, against the file the install just wrote. It
  passes. Dependabot PR #19 set `lucide-react` to 1.33.0 in
  `packages/web/package.json` and left `bun.lock` at 1.31.0. The check was
  green, and the next unrelated commit `b206fc7d` carried the lock fix.
  `8f58825b` repeated the pattern for PR #63 and #64. `bun audit` reads the
  same rewritten file.
- G-2: `whitespace.sh` and `prose.sh` swallow a failing `git diff` with
  `2>/dev/null || true` and print "nothing to check". `range.sh` prints
  `<remote sha>..<local sha>` without checking that the remote sha exists in
  the clone. Reproduced on 2026-10-11: both gates exit 0 on a range where
  `git diff --check` exits 128. In CI every force-push hits this, since
  `github.event.before` is gone.
- G-6: Dependabot runs as the `npm` ecosystem and has not touched `bun.lock`
  since 2026-08-24. With G-1 the drift stays green.
- G-7: `silent-green.sh` reads `N skip` alone. A `test.todo` reads as a pass.
  A renamed summary line reads as zero skips. A run of far fewer tests goes
  unnoticed.
- G-8: `machine-paths.sh` misses the Git Bash form, the macOS form, lowercase
  drive paths and JSON-escaped Windows paths. The spec says "on any platform".
- G-11: `check.yml` sets no `permissions:`, stores the checkout token in
  `.git/config` (bind-mounted into the container) and pins its actions by tag.
- G-12: `test/preload-db.ts` creates the login role `detent_audit_probe` with
  the password `probe` cluster-wide and never drops it.

The owner ruled on two open questions on 2026-10-11. A force-push range falls
back instead of failing (G-2). The actions get pinned by SHA (G-11).

## What Changes

- CI installs frozen. The `check` job's first install is the `frozen-lockfile`
  gate itself, before `bun audit` and `bun run check`. The `e2e` job installs
  with `--frozen-lockfile`. Both read the committed lockfile.
- `range.sh` checks that a remote sha exists in the clone. A missing sha falls
  back to the range since `origin/main`, with a stderr note naming the sha.
- `whitespace.sh` and `prose.sh` stop swallowing a failing `git diff`. A range
  git cannot read aborts the gate with exit 1 and git's own message.
- Dependabot's three `npm` entries become `bun` entries.
- `silent-green.sh` adds `todo` lines to the skip sum. It rejects a run whose
  summary does not add up to its `Ran N tests` line. It also rejects a run
  below a pass-count floor kept in a tracked file.
- `machine-paths.sh` matches four more spellings of a home path.
- `check.yml` gets `permissions: contents: read`, `persist-credentials: false`
  on every checkout and SHA pins on both actions.
- The test preload gives `detent_audit_probe` a random password per run and
  hands it to the privileges test through the environment.
- `scripts/test-gated.sh` keeps a failing command's own exit code when the
  gate rejects the run as well.
- Each fix ships with a test in `test/gates.test.ts` that feeds the failing
  input and expects a refusal.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `push-gate-checks`: the lockfile requirement adds the CI order. The silent
  green requirement adds `todo`, the summary check and the pass floor. The
  home-path requirement names the four further spellings. Two ADDED
  requirements cover ranges. One says a range git cannot read stops the gates.
  The other says the range printer falls back past a missing remote sha.
- `development-toolchain`: three ADDED requirements state the workflow's
  credential handling, the Dependabot ecosystem and the preload's role
  password.

## Impact

- `.github/workflows/check.yml`, `.github/dependabot.yml`.
- `scripts/gates/range.sh`, `whitespace.sh`, `prose.sh`, `silent-green.sh`,
  `machine-paths.sh`, `_lib.sh`, a new `scripts/gates/pass-floor.txt`, and
  `scripts/test-gated.sh`.
- `test/preload-db.ts`, `test/instance-audit-privileges.test.ts`,
  `test/gates.test.ts`.
- `CLAUDE.md` (the gate table row of `no-silent-green`), `README.md` and
  `docs/current-state.md` where they list what CI and the gates run.
- `docs/decisions.md`: the audit index entry of this change goes.
- No runtime behavior of the engine or the browser UI changes.
- The Dependabot switch is provable only on the first Dependabot run after the
  merge. GitHub documents `bun` as a supported ecosystem for version and
  security updates, from Bun 1.1.39. Whether it updates `bun.lock` for this
  workspace layout stays unproven until then.
