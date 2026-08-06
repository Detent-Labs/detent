## Context

See proposal.md for motivation. Four facts shape the approach.

The hook already exists and already works. `.githooks/pre-push` runs the
preflight, the typecheck, the suite and the gates. Only its enablement is
manual.

Bun runs a root `prepare` script on `bun install`. That is the one lifecycle
hook every contributor triggers, and the production image triggers it too.

The production image copies the tree and installs. `docker/engine.Dockerfile`
runs `COPY . .` then `bun install --production --frozen-lockfile`. A `.git`
directory does not reach that stage, and `.dockerignore` keeps it out.

The engine reads twenty environment variables today, counted from
`process.env` in `src/`. Four of the twenty landed with the changes beside
this one, and are already live. `harden-http-response-boundary` added
`METRICS_TOKEN`. `restrict-http-action-egress` added
`HTTP_ACTION_ALLOWED_HOSTS` and `HTTP_ACTION_ALLOW_INSECURE`.
`harden-local-account-sessions` added `TRUST_PROXY`. So the runbook writes all
twenty rows now, and no row waits on a sibling.

Two more values sit elsewhere in the tree. One is `VITE_API_URL`, a build
argument. It lives in `docker/frontend.Dockerfile` and in
`packages/web/vite.config.ts`. The other is `SEED_ALLOW`, which guards
`scripts/seed.ts`. `.dockerignore` excludes `docs` and `test` from the images,
and excludes no part of `scripts/`. So the seed script reaches the engine
image, and its variable belongs in the table.

The frontend image also takes one build argument, `VITE_API_URL`. A build
argument is not a runtime variable, and the runbook says which is which.

## Goals / Non-Goals

**Goals:**

- A clone gains its gate without a contributor reading a setup step.
- An operator can configure a deployment from one document.
- The reason no gate runs `bun audit` survives, so nobody re-opens it.

**Non-Goals:**

- No hosted CI. The owner made that decision, and the archive records it.
  See proposal.md.
- No new gate. See the proposal's out-of-scope note.
- No change to what the hook runs. This change touches enablement alone.

## Decisions

**A shell script, not an inline `prepare` command.** The command must not
fail where no repository exists. It must not fail where `git` is missing
either. An inline `git config ... || true` hides a real error as readily as an
expected one. A short script tests first, and prints what it did.

**The script asks `git`, never the filesystem.** `git rev-parse --git-dir` is
the test, not `[ -d .git ]`. In a linked worktree `.git` is a FILE holding a
`gitdir:` pointer. The directory test answers false there, which is where this
repository does most of its work: every tree under `.claude/worktrees/`. The
`rev-parse` call answers true in a worktree, and answers false outside a
repository. A third case has no `git` at all, and a `command -v` test covers
that one.

**The runbook is the one home for the variable list.** `README.md` carries
that list today, in prose. It spreads over two sections. Two homes means a
change adds its row to one of them. The README keeps the
build and run commands, since a reader reaches for those first. It points at
the runbook for the table.

**`prepare`, not `postinstall`.** Bun runs both. The `prepare` step is the
lifecycle hook meant for repository setup. A `postinstall` also runs for a
package installed as a dependency. This root package never is one, and the
narrower hook still states the intent better.

**One runbook, not one document per variable group.** An operator
configuring a deployment reads one file and stops. Splitting SMTP from auth
from retention makes three files. A later change can forget any of them.

**The runbook holds the proxy rule, not `docker/nginx.conf`.** That block
serves static files and proxies nothing. A `proxy_set_header` line there
would document a case the file does not handle. The deployment that adds a
proxy is the one that needs the rule.

**The runbook states the audit cadence and enforces nothing.** A cadence in
a document nobody reads is weak. This change says so. It is still the
strongest form the owner's recorded decision leaves. It also beats the
nothing that exists today.

## Risks / Trade-offs

- A contributor who never runs `bun install` still has no hook → that
  contributor cannot run the suite either. They are not pushing verified work
  in any case.
- The `prepare` script runs on every install and costs a `git config` call →
  the call is idempotent and takes milliseconds.
- A contributor who set `core.hooksPath` elsewhere loses it → the script
  prints what it set, so the install output shows the change.
- The install arms `.githooks/post-commit` too → that hook writes a `VERSION`
  bump after each commit. It leaves the bump uncommitted, for the next commit
  to carry. A contributor who armed the directory by hand already had it. The
  ones who did not now get a `VERSION` line in `git status`. The hook is the
  repository's stated convention, so this closes a second gap rather than
  opening one. The install output must still name both hooks.
- An install inside the devcontainer, in a linked worktree, arms nothing →
  the worktree's `.git` file holds a host path. The container cannot resolve
  it, so `git rev-parse` fails and the script exits 0. Measured, 2026-08-06.
  The two cases that matter both work: a host install, and a container
  install at `/workspace`. Git runs the hook on the host either way.
- The runbook drifts as variables come and go → the spec requires the row in
  the same commit as the variable. That is the rule
  `docs/authoring-guide.md` already lives under.

## Migration Plan

1. Merge. Every contributor's next `bun install` enables the hook.
2. A contributor who cloned before this change and never re-installs keeps
   the manual configuration they already have. Nothing breaks for them.
3. The README loses its `git config` instruction, so nobody follows a step
   the install already took.

No rollback question arises. Removing the script leaves the manual step,
which is where this started.

## Open Questions

- What cadence fits the audit? The runbook starts at monthly, and at every
  dependency bump. Changing the number changes no requirement, since the spec
  requires a stated cadence rather than a particular one.
