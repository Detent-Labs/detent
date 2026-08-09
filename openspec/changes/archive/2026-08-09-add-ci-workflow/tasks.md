## 1. Enable GitHub Actions

- [x] 1.1 Enable GitHub Actions for Detent-Labs/detent. Both the repository
      and the organization had it disabled. Confirm with
      `gh api repos/Detent-Labs/detent/actions/permissions` that `enabled`
      reads `true`.

## 2. Add the workflow file

- [x] 2.1 Create `.github/workflows/check.yml`. Trigger on `push` and
      `pull_request`. Both jobs use `runs-on: ubuntu-latest`.
<!-- antislop: allow phrasal-verbs -->
<!-- "Check out" names the actions/checkout step, the same word git itself
     uses for the operation. "Examine" would misname it. -->
- [x] 2.2 Add the `host-gates` job. Check out with `fetch-depth: 0`. Write
      one line shaped like git's pre-push protocol. On a `push` event,
      take the shas from `github.event.before` and `$GITHUB_SHA`. On a
      `pull_request` event, take them from
      `github.event.pull_request.base.sha` and
      `github.event.pull_request.head.sha` instead, since `$GITHUB_SHA`
      names a synthetic merge commit there. Pipe the line through
      `scripts/gates/range.sh`. Run `ponytail-ledger.sh`, `whitespace.sh`,
      `prose.sh`, and `machine-paths.sh` against that range.
<!-- antislop: allow phrasal-verbs -->
- [x] 2.3 Add the `check` job. Check out, then `docker compose -f
      .devcontainer/docker-compose.yml up -d --wait`. `ubuntu-latest`
      ships Docker and Compose v2 already, so this needs no setup step.
      Run `bun install` inside the `app` service first. A fresh checkout
      carries no `node_modules`, unlike a contributor's already-provisioned
      devcontainer, and `bun run check` fails immediately without it. Then
      run `bun run check` and capture its output. Run `lockfile.sh` next.
      It takes no input; it re-runs `bun install --frozen-lockfile` inside
      the container on its own. Run `silent-green.sh` against the captured
      `bun run check` output.
- [x] 2.4 Add no teardown step. `ubuntu-latest` destroys the whole VM
      after the job, so a `docker compose down -v` step would do nothing
      a GitHub-hosted runner doesn't already do for free.
- [x] 2.5 Confirm this job needs no `MSYS_NO_PATHCONV` workaround. The
      runner is Linux, not Git Bash on Windows, so `.githooks/pre-push`'s
      path-rewrite fix does not apply here.

## 3. Add dependency monitoring

- [x] 3.1 Create `.github/dependabot.yml`. Add an `npm` ecosystem entry for
      the root manifest, and one more for each `packages/*` workspace
      directory.
- [x] 3.2 Add a `github-actions` ecosystem entry to the same file, so
      Dependabot tracks `actions/checkout`'s version.

## 4. Reconcile the docs that record the prior CI decision

- [x] 4.1 Rewrite `README.md`'s CI paragraph. State plainly that this
      change reverses the "no hosted service" decision, and why:
      GitHub-hosted runners are free for this public repository, and the
      self-hosted alternative needed a runner, a service, and an
      organization-level setting this change had to unblock separately.
- [x] 4.2 Rewrite `ROADMAP.md`'s CI line the same way. Add
      `add-ci-workflow` to the `Change:` list alongside
      `add-ci-and-dependency-hygiene`.
- [x] 4.3 Rewrite `docs/current-state.md`'s CI paragraph (around line
      1715) the same way. Name `add-ci-workflow` there too.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` inside the devcontainer. Confirm it
      passes.
- [x] 5.2 Run the full `bun test` suite inside the devcontainer, with
      `DATABASE_URL` set. Confirm a named pass count, not just green, and
      check the skip count stays at the recorded floor.
- [x] 5.3 Run the antislop linter over every Markdown file this change
      touched (`proposal.md`, `design.md`, `tasks.md`, and the three docs
      from group 4). Confirm no rise against each file's committed
      baseline.
- [x] 5.4 Run `git diff --check` over the change. Confirm no trailing
      whitespace or blank-line-at-EOF findings.
- [x] 5.5 Push a commit containing the new workflow, the Dependabot file,
      and the rewritten docs. Confirm both `host-gates` and `check` appear
      in the repository's Actions tab, and that both succeed.
