#!/bin/sh
# Prints one commit range per pushed ref, one per line, in `A..B` form.
#
# Git feeds a pre-push hook one line per ref on stdin:
#   <local ref> <local sha> <remote ref> <remote sha>
#
# Four cases:
#   - a remote sha this clone holds -> <remote sha>..<local sha>
#   - a remote sha it does not hold -> <merge-base with origin/main>..<local sha>,
#     and a note on stderr naming the sha
#   - an all-zero remote   -> <merge-base with origin/main>..<local sha>, a new branch
#   - an all-zero local    -> nothing, a branch deletion pushes no content
#
# The missing sha is routine: a force-push over a remote state the clone never
# fetched, a push after a history rewrite, and every force-push in CI, where the
# previous sha is gone. The range since origin/main over-checks commits the
# remote already holds. It never under-checks.
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

# since_main <sha> — the base of the range since origin/main. A clone without
# origin/main, or a sha that shares no commit with it, falls to the empty tree.
since_main() {
  git merge-base "$1" origin/main 2>/dev/null || echo "$EMPTY_TREE"
}

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
      printf '%s..%s\n' "$(since_main "$local_sha")" "$local_sha"
    elif git cat-file -e "${remote_sha}^{commit}" 2>/dev/null; then
      printf '%s..%s\n' "$remote_sha" "$local_sha"
    else
      echo "gates/range: remote sha $remote_sha is not in this clone." >&2
      echo "  Checking the range since origin/main instead." >&2
      printf '%s..%s\n' "$(since_main "$local_sha")" "$local_sha"
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
