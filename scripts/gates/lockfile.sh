#!/bin/sh
# Gate rule: frozen-lockfile
#
# Runs `bun install --frozen-lockfile` in the devcontainer. A manifest change
# without a matching committed bun.lock blocks the push.
#
# The add-ci-and-dependency-hygiene change made this the first CI step, because
# a stale lockfile is a red build. Commit 4ff4382 replaced that workflow with
# the pre-push hook and carried the step over nowhere. Nothing guarded lockfile
# drift between 2026-07-29 and this gate.
#
# The check also covers the declaration rule development-toolchain states: a
# runtime import belongs in its own package's manifest, and a frozen install is
# what proves the committed lockfile agrees with every manifest.
#
# Container placement, never the host. CLAUDE.md's Conventions forbid a host
# Bun, and MSYS_NO_PATHCONV=1 stops Git Bash rewriting /workspace before Docker
# sees it.
#
# Scope, measured: this gate catches a manifest change the committed lockfile
# cannot satisfy, such as a dependency with no entry in it. It does not fire on
# a widened range the locked version still satisfies. Changing "jose" from
# ^6.2.4 to ^6.0.0 passes, because the locked 6.2.4 satisfies both. That is
# correct: the lockfile and the manifest still agree, so nothing has drifted.
set -e

. "$(dirname "$0")/_lib.sh"
. "$(dirname "$0")/../worktree-env.sh"

RULE=frozen-lockfile
COMPOSE="docker compose -f .devcontainer/docker-compose.yml"

if MSYS_NO_PATHCONV=1 $COMPOSE exec -T -w /workspace app \
     bun install --frozen-lockfile > /dev/null 2>&1; then
  exit 0
fi

reject "$RULE"
echo "  bun.lock does not agree with the manifests. The install output:" >&2
MSYS_NO_PATHCONV=1 $COMPOSE exec -T -w /workspace app \
  bun install --frozen-lockfile 2>&1 | sed 's/^/    /' >&2 || true
echo "Regenerate the lockfile in the container, then commit it:" >&2
echo "  . scripts/worktree-env.sh && $COMPOSE exec -T -w /workspace app bun install" >&2
no_verify_note
exit 1
