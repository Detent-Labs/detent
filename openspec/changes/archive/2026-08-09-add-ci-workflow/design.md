## Context

See `proposal.md` - Why for the motivation, and for why this change
reverses commit `4ff4382`'s decision rather than honoring it. This
section covers only what shapes the workflow's structure.

This change tried a self-hosted runner first, in this same session.
Registration worked. Enabling it required organization-level access this
design did not have at first. The setup itself also needed a persistent
WSL2 service on a personal machine. Given that operational cost, the
user chose GitHub-hosted runners instead, once told they are free for a
public repository.

`.githooks/pre-push` already defines the gate set and its order. Stage 1
runs four host gates. Stage 2 is a preflight check. Stage 3 runs the
container gates plus `bun run check` (`.githooks/pre-push:1-74`).

`scripts/gates/range.sh` already computes a commit range. It reads
git's own pre-push stdin protocol, the line `<local ref> <local sha>
<remote ref> <remote sha>`, verbatim.

A GitHub Actions `push` event carries the same two shas as that line.
They arrive as two env vars, `github.event.before` and `github.sha`,
set by GitHub. A `pull_request` event carries the equivalent pair too.
It arrives as `github.event.pull_request.base.sha` and
`github.event.pull_request.head.sha`, the same shape.

The repository is public. Both `push` and `pull_request` trigger the
workflow.

## Goals / Non-Goals

**Goals:**
- Every gate `.githooks/pre-push` runs today also runs from the project's
  own side, on every push and every pull request. It must not depend on
  `--no-verify` staying unused.
- Reuse `scripts/gates/*.sh` unchanged. The workflow supplies input. It
  does not reimplement gate logic.
- Cover a pull request opened from a fork, which the self-hosted design
  this change first tried could not do safely.
- Add dependency monitoring (Dependabot) as a small addition once the
  workflow exists.

**Non-Goals:**
- Provisioning the antislop linter onto the runner. A GitHub-hosted VM is
  fresh every run, so `prose.sh` skips every time (see Risks). Fixing
  that is future work, not this change.
- Adding CI for the two gates that already run inside `bun run check`'s
  own test suite. `ponytail-ledger-fresh` runs standalone.
  `no-silent-green` reads `bun run check`'s own output. Neither needs a
  separate step.
- Changing what any gate script checks, or its exit behavior.

## Decisions

**GitHub-hosted runners (`ubuntu-latest`), not self-hosted.** Free for a
public repository, and this repository is public. The self-hosted
alternative this change tried first needed a registered runner and a
persistent WSL2 service. It also needed a repository setting that an
organization-level policy blocked until fixed separately. GitHub-hosted
needs none of that: GitHub provisions and destroys the VM per job.

**`push` and `pull_request` both trigger the workflow.** The self-hosted
design this change first tried excluded `pull_request`. A self-hosted
runner executing a fork's PR would run that fork's code on the runner's
own host. A GitHub-hosted runner is a disposable VM per job, so a fork's
PR never touches infrastructure this project owns. This
workflow also carries no secrets, so there is nothing for a fork PR to
read even in principle. Both triggers are safe here for reasons that did
not hold under the self-hosted design.

**Reuse the devcontainer stack for the `check` job anyway.** `ubuntu-latest`
ships Docker and Docker Compose v2 preinstalled. So `docker compose -f
.devcontainer/docker-compose.yml up -d --wait` works there too. It runs
the same way it runs on any other Docker host. This keeps one
environment definition,
the devcontainer's own, rather than installing Bun and Postgres a second
way on the runner. Bun's version still comes from
`.devcontainer/Dockerfile`'s pin, so no drift.

**`bun install` runs before `bun run check`.** The devcontainer's `app`
image carries Bun and its toolchain, but not `node_modules`. A
contributor's devcontainer already has it, from `scripts/dev-up.sh`'s
first provisioning. A fresh Actions checkout has none. Without this step,
`tsc` fails immediately. It cannot find Bun's own type definitions,
which live in the missing `node_modules`, not in the image.

**No teardown step in the `check` job.** The self-hosted design this
change first tried needed `docker compose down -v` after every run. That
runner was a persistent machine. `ubuntu-latest` destroys the whole VM
after the job, volumes included. The step would do nothing a
GitHub-hosted runner doesn't already do for free.

**Feed `range.sh` a constructed line instead of reimplementing it.**

The `host-gates` job builds one line, shaped like git's own pre-push
protocol: `<ref> <local-sha> <ref> <remote-sha>`. It fills that line in
per event.

On a `push` event, the local sha is `$GITHUB_SHA` and the remote sha is
`github.event.before`. On a `pull_request` event, the local sha is the
PR's head sha and the remote sha is the PR's base sha.

The PR's own shas matter more than `$GITHUB_SHA` here. On a
`pull_request` event, `$GITHUB_SHA` names a synthetic merge commit, not
the PR's actual head.

`range.sh` already falls back to a merge-base with `origin/main` when
the remote sha is all zero. That is the new-branch case on a push. The
workflow needs no separate handling for that case.
Reimplementing the range logic in YAML would create a second copy of a
rule. That copy could drift from the shell one.

**`lockfile.sh` and `silent-green.sh` run in the `check` job, not
`host-gates`.** `CLAUDE.md`'s own gate table draws this line. The first
four gates need only git and a shell: `ponytail-ledger-fresh`,
`pushed-whitespace`, `changed-markdown-prose`, `no-machine-paths`. The
last two need the devcontainer: `frozen-lockfile`, `no-silent-green`.
`lockfile.sh` runs `bun install --frozen-lockfile` inside the `app`
container. `silent-green.sh` reads `bun run check`'s captured output.
Both belong beside `bun run check`, in the same job.

**No `oven-sh/setup-bun` action.** Bun already lives inside the `app`
container image, at the version `.devcontainer/Dockerfile` pins.
Installing a second Bun on the runner host would add a version the
container image does not control. That reintroduces the drift the
container pin exists to prevent.

**Dependabot ecosystems: `bun` at the root and each `packages/*`
workspace, plus `github-actions`.** Bun workspaces publish
npm-compatible manifests, so Dependabot's `npm` ecosystem type reads
them. Each workspace gets its own `directory` entry. Dependabot does
not walk a workspace tree on its own. `github-actions` covers the
action pins this workflow adds, currently `actions/checkout`.

## Risks / Trade-offs

- **`changed-markdown-prose` (`prose.sh`) skips on every CI run.** The
  gate resolves the antislop linter from `$ANTISLOP` or
  `$HOME/AI/AntiSlop/antislop.py`. Neither exists on a fresh
  `ubuntu-latest` VM. `prose.sh`'s own documented behavior is a named
  skip, not a failure. That matches a contributor's machine that never
  installed the linter, accepted here as a Non-Goal. A future change
  could vendor the linter into this repository. It could instead fetch
  the linter from wherever it lives, so CI can install it per run.
- **This reverses a recorded decision.** `README.md`, `ROADMAP.md`, and
  `docs/current-state.md` each stated "no hosted service" as a deliberate
  choice. This change rewrites all three to say plainly that it reverses
  that choice, and why. It does not leave them stale or vague about it.
- **`bun run check` runs on every push and every PR push.** For an active
  branch with several small pushes, that's several full-suite runs. This
  matches what `.githooks/pre-push` already forces locally. CI adds no
  new cost class. It just pays the same cost a second time.

## Migration Plan

1. Enable GitHub Actions for this repository and its organization. Done
   in this session: `gh api repos/Detent-Labs/detent/actions/permissions`
   now reports `enabled: true`.
2. Land `.github/workflows/check.yml` and `.github/dependabot.yml`.
3. Rewrite the three docs that recorded the prior "no hosted service"
   decision: `README.md`, `ROADMAP.md`, `docs/current-state.md`. State
   the reversal plainly in each.
4. Push a commit. Confirm both jobs appear and pass in the repository's
   Actions tab.
5. No data migration applies. Rollback is deleting the workflow file.
   Disabling Actions again is optional and separate, since the
   organization-level setting outlives this one repository.

## Open Questions

None. The pivot from self-hosted to GitHub-hosted, and the resulting
`pull_request` trigger, were both resolved with the user in this
session. This change deferred neither question.
