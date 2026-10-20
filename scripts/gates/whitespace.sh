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
# `grep -lI $'\r'` as a worktree probe finds nothing in Git Bash: MSYS grep
# opens a file in text mode and strips the CR before matching. Measured on a
# file `file(1)` reports as CRLF. This gate asks git instead, through
# `git ls-files --eol`, which also catches `w/mixed`.
#
# Range scope, not tree scope, on purpose. 1312 tracked files carry CRLF today.
# A tree-wide check would land red and cost every other gate to --no-verify.
set -e

. "$(dirname "$0")/_lib.sh"

RULE=pushed-whitespace
fail=0

files=$(mktemp)
eol=$(mktemp)
diff_err=$(mktemp)
trap 'rm -f "$files" "$eol" "$diff_err"' EXIT

# A range git cannot diff stops the gate. `git diff --check` exits 2 on a
# whitespace finding (measured), so 0, 1 and 2 are normal and the findings go to
# stdout. Any other status, 128 for a revision git does not hold, is
# `bad_range`: a swallowed status would read as "no text file changed".
while IFS= read -r range; do
  [ -n "$range" ] || continue

  rc=0
  check=$(git diff --check "$range" 2>"$diff_err") || rc=$?
  case "$rc" in
    0|1|2) ;;
    *) bad_range "$RULE" "$range" "$diff_err" ;;
  esac
  if [ -n "$check" ]; then
    if [ "$fail" -eq 0 ]; then
      reject "$RULE"
    fi
    echo "$check" >&2
    fail=1
  fi

  rc=0
  git diff --name-only --diff-filter=d "$range" 2>"$diff_err" >> "$files" || rc=$?
  case "$rc" in
    0|1|2) ;;
    *) bad_range "$RULE" "$range" "$diff_err" ;;
  esac
done

sort -u "$files" -o "$files"

# An empty range list and a range that changes no file reach the same place: no
# path to judge. Say so, and exit 0. A push that sends no text file is
# legitimate — a branch deletion is one. Silence here reads as a pass, and a
# contributor who piped nothing in would trust a check that never ran.
#
# Before the `git ls-files` probe below, so this path calls no git command at
# all. `bun test` runs in the devcontainer, where /workspace is not a usable
# repository: a linked worktree's `.git` is a file pointing outside the mount.
if [ ! -s "$files" ]; then
  echo "gate '$RULE': the push changes no text file, nothing to check."
  exit 0
fi

# A path the range changed and then deleted is absent from this listing, which
# is the wanted behavior: it has no worktree bytes left to judge.
git ls-files --eol 2>/dev/null \
  | awk -F'\t' '$1 ~ /(^| )w\/(crlf|mixed)( |$)/ {print $2}' \
  | sort -u > "$eol"

offenders=$(comm -12 "$files" "$eol")

if [ -n "$offenders" ]; then
  if [ "$fail" -eq 0 ]; then
    reject "$RULE"
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
  no_verify_note
  exit 1
fi
