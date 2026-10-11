#!/bin/sh
# Gate rule: no-machine-paths
#
# Rejects a tracked file that holds an absolute path into a user's home
# directory, in any of four spellings:
#
#   - a Windows drive path, with `Users` in either letter case, whose
#     separators are slashes, single backslashes or the doubled backslashes of a
#     JSON string;
#   - the Git Bash and WSL form, where the drive letter is a path segment;
#   - the macOS form, /Users/<name>, with an exact `Users`;
#   - the Linux form, /home/<name>/.
#
# The pattern stays case-sensitive. Only the drive forms spell `Users` in both
# cases. A lowercase /users/ appears in routes, so the macOS form would flag
# them if it ignored case. The macOS form also needs a name character after
# `Users/` and no name character before the slash. The regex text
# `/Users/[^/]+` and a relative src/Users/ directory raise no finding.
#
# Commit e152f9c removed two such paths. One sat in a skill file and carried the
# Windows account name. The other sat in thirteen shell examples in a plan
# document. A path of that shape works on one machine and on no other, and it
# discloses the account name to everyone who clones the repository.
#
# Tree scope, not range scope: a path can arrive through a merge or a rebase
# that no pushed range covers, and the scan costs one `git grep`.
#
# Some tracked paths name a container filesystem rather than a contributor's
# machine. .devcontainer/devcontainer.json mounts /home/node/.claude, and the
# documents that explain that mount quote the same path. The denylist below
# neutralizes those users before the pattern runs, so a line carrying a real
# machine path beside a container path still fails.
#
# ponytail: the denylist is two container users, node and root. A base image
# that runs as a third user needs a row here. Widen it when one does.
set -e

. "$(dirname "$0")/_lib.sh"

RULE=no-machine-paths
DRIVE='[A-Za-z]:[\\/]{1,2}[Uu][Ss][Ee][Rr][Ss][\\/]{1,2}[A-Za-z0-9_]+'
GIT_BASH='/[A-Za-z]/[Uu][Ss][Ee][Rr][Ss]/[A-Za-z0-9_]+'
MACOS='(^|[^A-Za-z0-9_.])/Users/[A-Za-z0-9_]+'
LINUX='/home/[a-z][a-z0-9_-]*/'
PATTERN="$DRIVE|$GIT_BASH|$MACOS|$LINUX"
CONTAINER_USERS='node|root'

hits=$(
  git grep -nIE "$PATTERN" -- . ':(exclude).gitignore' 2>/dev/null \
    | sed -E "s#/home/($CONTAINER_USERS)/#/home/<container>/#g" \
    | grep -E "$PATTERN" \
    || true
)

if [ -n "$hits" ]; then
  reject "$RULE"
  echo "  these tracked files carry an absolute home-directory path:" >&2
  echo "$hits" | sed 's/^/    /' >&2
  echo "Replace each one with a \$HOME-relative path, an environment variable," >&2
  echo "or a repository-relative path, then commit the result." >&2
  no_verify_note
  exit 1
fi
