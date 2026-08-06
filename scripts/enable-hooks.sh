#!/bin/sh
# Points core.hooksPath at .githooks, so a clone gains the push gate from its
# first `bun install`. The root package.json runs this as its `prepare` script.
#
# Arms the whole directory, so `post-commit` comes with `pre-push`.
#
# Three cases end here without an error:
#   - no git on the PATH        (the production image's base has none)
#   - no repository around      (docker/engine.Dockerfile COPYs a tree whose
#                                .git .dockerignore excluded)
#   - git answers               (the ordinary case, including a worktree)
#
# `git rev-parse --git-dir` is the test, never `[ -d .git ]`. In a linked
# worktree .git is a FILE holding a gitdir: pointer, so the directory test
# answers false inside a real repository -- and this repository works in
# worktrees under .claude/worktrees/.
set -e

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
