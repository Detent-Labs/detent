#!/bin/sh
# Points core.hooksPath at .githooks, so a clone gains the push gate from its
# first `bun install`. The root package.json runs this as its `prepare` script.
# It also arms an SSH keepalive, so the connection the pre-push hook runs
# inside outlives the hook's own runtime.
#
# Arms the whole directory, so `post-commit` comes with `pre-push`.
#
# Three cases end here without an error:
#   - no git on the PATH        (the production image's base has none)
#   - no repository around      (docker/engine.Dockerfile COPYs a tree whose
#                                .git .dockerignore excluded)
#   - git answers               (the ordinary case, including a worktree)
#
# Two settings the keepalive branch never touches, so it never breaks a
# contributor's own transport:
#   - a `core.sshCommand` already set to something else (an identity file, a
#     ProxyCommand, a different ssh binary)
#   - `GIT_SSH` set in the environment (a plink/putty/tortoiseplink user, for
#     whom `-o option` is the wrong syntax)
#
# `git rev-parse --git-dir` is the test, never `[ -d .git ]`. In a linked
# worktree .git is a FILE holding a gitdir: pointer, so the directory test
# answers false inside a real repository -- and this repository works in
# worktrees under .claude/worktrees/.
set -e

KEEPALIVE_CMD="ssh -o ServerAliveInterval=20 -o ServerAliveCountMax=30"

command -v git > /dev/null 2>&1 || {
  echo "enable-hooks: no git on the PATH, leaving core.hooksPath alone"
  exit 0
}

git rev-parse --git-dir > /dev/null 2>&1 || {
  echo "enable-hooks: no git repository here, leaving core.hooksPath alone"
  exit 0
}

git config core.hooksPath .githooks
echo "enable-hooks: core.hooksPath = .githooks (pre-push and post-commit are armed)"

CURRENT_SSH_COMMAND=$(git config --get core.sshCommand || true)

if [ "$CURRENT_SSH_COMMAND" = "$KEEPALIVE_CMD" ]; then
  echo "enable-hooks: core.sshCommand already carries the push keepalive"
elif [ -n "$CURRENT_SSH_COMMAND" ]; then
  echo "enable-hooks: core.sshCommand is already set to '$CURRENT_SSH_COMMAND', leaving it alone"
  echo "enable-hooks: add ServerAliveInterval/ServerAliveCountMax to your own core.sshCommand, or export GIT_SSH_COMMAND with them."
elif [ -n "${GIT_SSH:-}" ]; then
  echo "enable-hooks: GIT_SSH is set, leaving core.sshCommand alone"
  echo "enable-hooks: add ServerAliveInterval/ServerAliveCountMax to your own core.sshCommand, or export GIT_SSH_COMMAND with them."
else
  git config core.sshCommand "$KEEPALIVE_CMD"
  echo "enable-hooks: core.sshCommand = $KEEPALIVE_CMD (push keepalive armed)"
fi
