#!/bin/sh
# Prints one commit range per pushed ref, one per line, in `A..B` form.
#
# Git feeds a pre-push hook one line per ref on stdin:
#   <local ref> <local sha> <remote ref> <remote sha>
#
# Three cases:
#   - a real remote sha    -> <remote sha>..<local sha>
#   - an all-zero remote   -> <merge-base with origin/main>..<local sha>, a new branch
#   - an all-zero local    -> nothing, a branch deletion pushes no content
#
# Every case emits `A..B`. `git diff` takes two endpoints and does not accept
# rev-list syntax, so `<sha> --not --remotes` would not survive the consumer.
#
# With no stdin a contributor is running a gate by hand. The fallback is
# origin/main..HEAD.
set -e

ZERO=0000000000000000000000000000000000000000
# The hash git gives the empty tree. Diffing against it yields every line of
# every file in the range, which is the correct base for a branch that shares
# no commit with origin/main.
EMPTY_TREE=4b825dc642cb6eb9a060e54bf8d69288fbee4904

# `saw_line` and `emitted` are not the same question. A push that only deletes
# branches gives lines but no range, and it must stay empty: falling back to
# origin/main..HEAD there would check commits the push does not send.
saw_line=0
emitted=0

if [ ! -t 0 ]; then
  while read -r _local_ref local_sha _remote_ref remote_sha; do
    saw_line=1
    if [ -z "$local_sha" ] || [ -z "$remote_sha" ]; then
      echo "gates/range: cannot parse this pre-push line" >&2
      echo "  fields: '$_local_ref' '$local_sha' '$_remote_ref' '$remote_sha'" >&2
      exit 1
    fi

    if [ "$local_sha" = "$ZERO" ]; then
      continue
    fi

    if [ "$remote_sha" = "$ZERO" ]; then
      base=$(git merge-base "$local_sha" origin/main 2>/dev/null || echo "$EMPTY_TREE")
      printf '%s..%s\n' "$base" "$local_sha"
    else
      printf '%s..%s\n' "$remote_sha" "$local_sha"
    fi
    emitted=1
  done
fi

if [ "$emitted" -eq 0 ] && [ "$saw_line" -eq 0 ]; then
  if git rev-parse --verify --quiet origin/main >/dev/null 2>&1; then
    printf 'origin/main..HEAD\n'
  else
    printf '%s..HEAD\n' "$EMPTY_TREE"
  fi
fi
