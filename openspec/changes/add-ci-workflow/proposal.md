## Why

`docs/CODE_REVIEW.md` (2026-08-09) names the absent CI as its highest-value
gap (TEST-1). Every quality gate this repository has runs only through
`.githooks/pre-push`, on a contributor's own machine. That list is
typecheck, build, and the full test suite. It is also the antislop prose
check, the whitespace check, and the machine-path check. It is also the
lockfile check and the ponytail-ledger check. `--no-verify` disables all
of them at once.

A prior commit, `4ff4382`, removed this repository's last GitHub Actions
workflow. Its message gives two reasons. The owner did not want a hosted
service executing this repository. Actions was also disabled at the
repository level.

This change reverses that decision, deliberately. GitHub-hosted runners
are free for a public repository, and `Detent-Labs/detent` is public.

This same change first tried a self-hosted alternative, then dropped it.
That alternative needed a registered runner and a persistent WSL2
service. It also needed a repository setting. The organization, not just
the repository, blocked that setting. GitHub-hosted needs none of it.

Hosting on GitHub also removes the reason this change first excluded the
`pull_request` trigger. A self-hosted runner executing a fork's PR would
run that fork's code on the runner's own host. A GitHub-hosted runner is a
disposable VM per job, so a fork's PR never touches infrastructure this
project owns. This workflow also carries no secrets, so there is nothing
for a fork PR to read even in principle. Both `push` and `pull_request`
trigger it.

## What Changes

- Add `.github/workflows/check.yml`, triggered on `push` and
  `pull_request`. Two jobs, both `runs-on: ubuntu-latest`:
  - **`check`**: brings up this project's existing devcontainer stack
    (`docker compose -f .devcontainer/docker-compose.yml up -d --wait`),
    then inside the `app` service runs `bun run check`, `lockfile.sh`
    (`frozen-lockfile`), and `silent-green.sh` (`no-silent-green`) against
    that output, the same three the pre-push hook's container stage runs.
    No teardown step: the VM is destroyed after the job regardless.
  - **`host-gates`**: runs the four gates that need only git and a shell,
    against the pushed or PR-diffed commit range: `ponytail-ledger.sh`,
    `whitespace.sh`, `prose.sh`, `machine-paths.sh`. Computes the range
    the same way `scripts/gates/range.sh` already does, fed `before`/`after`
    on a push, or `base`/`head` on a pull request, instead of git's
    pre-push stdin protocol.
- Add `.github/dependabot.yml` for this repo's ecosystems: `bun` (the root
  manifest and each `packages/*` workspace) and `github-actions` (the new
  workflow file). This closes DEP-1, no dependency or vulnerability
  monitoring, which the review calls a direct consequence of TEST-1.
- Enable GitHub Actions for `Detent-Labs/detent`. Already done in this
  session: both the repository and the organization now allow it
  (`gh api repos/Detent-Labs/detent/actions/permissions` reports
  `enabled: true`).

## Capabilities

This change touches CI and tooling settings only. It changes nothing
in `src/`, `packages/web`, or the process contract. It creates no spec and
modifies none.

### New Capabilities

(none)

### Modified Capabilities

(none)

## Impact

- **New files:** `.github/workflows/check.yml`, `.github/dependabot.yml`.
- **Touched docs:** `README.md`, `ROADMAP.md`, and `docs/current-state.md`
  each stated the prior "no hosted service" decision in one line or
  paragraph. Each now says plainly that this change reverses it, rather
  than reading as still current or as silently stale.
- **Unchanged:** `src/`, `packages/web`, `packages/form-ui`,
  `scripts/gates/*.sh`. CI calls the existing gate scripts and the existing
  `bun run check` script as written.
- **Dependencies:** none added. Dependabot's new `github-actions` ecosystem
  entry tracks the versions of any actions the workflow uses (currently
  just `actions/checkout`) from here on.
- **Infrastructure:** none. No self-hosted runner, no registration, no
  service to maintain. GitHub provisions and destroys each job's VM.
- **Coverage gained:** a pull request opened from a fork now gets an
  automatic CI run. That closes the gap the self-hosted design in this
  same change had accepted. It is also the gap TEST-1 originally flagged.
- **Coverage still missing:** `changed-markdown-prose` (`prose.sh`) skips
  on every run. A fresh GitHub-hosted VM carries no antislop install and
  no `$ANTISLOP`. The gate's own documented fallback applies: a named
  skip, not a failure. This matches what already happens on a
  contributor's machine that never installed the linter.
- **Follow-on:** once this lands, the next `docs/CODE_REVIEW.md` pass can
  mark TEST-1 and DEP-1 closed.
