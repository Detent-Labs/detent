#!/bin/sh
# Gate rule: pushed-whitespace
#
# Rejects a CR byte, a trailing space, or a blank line at end of file, in the
# text files the pushed range adds or changes. Reads ranges on stdin, one per
# line, as scripts/gates/range.sh prints them.
#
# Two probes, because neither covers the other. `git diff --check` reports the
# trailing space and the blank line at end of file. It does not report CRLF in
# this repository: .gitattributes sets `* text=auto eol=lf`, so git normalizes a
# CRLF worktree file on `git add` and the diff sees pure LF. CLAUDE.md records
# that trap.
#
# CLAUDE.md also names `grep -lI $'\r'` as the worktree probe. That command
# finds nothing in Git Bash: MSYS grep opens a file in text mode and strips the
# CR before matching. Measured on a file `file(1)` reports as CRLF. This gate
# asks git instead, through `git ls-files --eol`, which also catches `w/mixed`.
#
# Range scope, not tree scope, on purpose. 1312 tracked files carry CRLF today.
# A tree-wide check would land red and cost every other gate to --no-verify.
set -e

RULE=pushed-whitespace
fail=0

files=$(mktemp)
eol=$(mktemp)
trap 'rm -f "$files" "$eol"' EXIT

while IFS= read -r range; do
  [ -n "$range" ] || continue

  check=$(git diff --check "$range" 2>/dev/null) || true
  if [ -n "$check" ]; then
    if [ "$fail" -eq 0 ]; then
      echo "pre-push: rule '$RULE' rejected this push." >&2
    fi
    echo "$check" >&2
    fail=1
  fi

  git diff --name-only --diff-filter=d "$range" 2>/dev/null >> "$files" || true
done

sort -u "$files" -o "$files"

# A path the range changed and then deleted is absent from this listing, which
# is the wanted behavior: it has no worktree bytes left to judge.
git ls-files --eol 2>/dev/null \
  | awk -F'\t' '$1 ~ /(^| )w\/(crlf|mixed)( |$)/ {print $2}' \
  | sort -u > "$eol"

offenders=$(comm -12 "$files" "$eol")

if [ -n "$offenders" ]; then
  if [ "$fail" -eq 0 ]; then
    echo "pre-push: rule '$RULE' rejected this push." >&2
  fi
  echo "  these files carry CR bytes in the worktree:" >&2
  echo "$offenders" | sed 's/^/    /' >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "Repair, then commit the result:" >&2
  echo "  git ls-files --eol <file>     # confirm the worktree line ending" >&2
  echo "  dos2unix <file>               # for a CR byte" >&2
  echo "  git diff --check              # for the other two" >&2
  echo "To push without the gates, pass --no-verify. That disables every gate." >&2
  exit 1
fi
