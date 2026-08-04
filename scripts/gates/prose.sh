#!/bin/sh
# Gate rule: changed-markdown-prose
#
# A ratchet. For every Markdown file the pushed range adds or changes, this
# compares the antislop linter's finding count at the range's base against the
# count at its tip. A rising count blocks the push. A level or falling count
# does not, whatever its value.
#
# Whole-file linting does not survive contact with this repository. The live
# specs under openspec/specs/ hold about 3166 findings across 52 of 80 files,
# and none carries an allow-file directive. A whole-file gate makes every one of
# them unpushable until somebody clears its debt in full. That happened on
# 2026-08-04: a change that synced one requirement into
# development-toolchain/spec.md paid a 28-finding prose rewrite, and all 28
# predated it.
#
# Both sides read committed content through `git show`, never the worktree. A
# push ships commits, and a worktree can hold edits the push does not send. The
# whitespace gate reads worktree bytes instead, and that is deliberate there:
# .gitattributes normalizes CRLF on `git add`, so only the worktree still holds
# the CR. Prose carries no such asymmetry.
#
# Reads ranges on stdin, one per line, as scripts/gates/range.sh prints them.
# Every range has the form A..B. A push of several refs gives several ranges
# with different bases, so this evaluates each (range, path) pair against that
# range's own base.
#
# The linter sits outside this repository, so its path differs per machine and
# the devcontainer does not carry it. This gate resolves it from $ANTISLOP
# first, then from a $HOME-relative default. It prints a named skip when it
# finds neither, and lets the push proceed.
#
# The skip is deliberate. On a clone without the tool, a gate that rejected the
# push would leave --no-verify as the only way through, and that flag disables
# every gate. One check lost beats all of them.
#
# The default is $HOME-relative rather than absolute on purpose. A literal
# C:/Users/<account>/... in this tracked file is exactly what the
# no-machine-paths gate rejects.
set -e

RULE=changed-markdown-prose
LINTER="${ANTISLOP:-$HOME/AI/AntiSlop/antislop.py}"

ranges=$(mktemp)
pairs=$(mktemp)
findings=$(mktemp)
blob="${TMPDIR:-/tmp}/prose-gate-$$.md"
trap 'rm -f "$ranges" "$pairs" "$findings" "$blob"' EXIT

# stdin yields once. Capture it, then read the capture.
cat > "$ranges"

# Collect (range, path) pairs. --diff-filter=d drops a path the range deleted,
# which is why a deleted file needs no special case below.
while IFS= read -r range; do
  [ -n "$range" ] || continue
  git diff --name-only --diff-filter=d "$range" -- '*.md' 2>/dev/null \
    | while IFS= read -r p; do
        [ -n "$p" ] && printf '%s\t%s\n' "$range" "$p"
      done >> "$pairs" || true
done < "$ranges"

sort -u "$pairs" -o "$pairs"

if [ ! -s "$pairs" ]; then
  echo "gate '$RULE': the push changes no Markdown, nothing to check."
  exit 0
fi

if [ ! -f "$LINTER" ]; then
  echo "gate '$RULE': SKIPPED. No linter at:" >&2
  echo "  $LINTER" >&2
  echo "  Set ANTISLOP to its path to run this gate." >&2
  exit 0
fi

PY=python3
command -v python3 >/dev/null 2>&1 || PY=python

# lint_at <commit> <path> <findings-file>
#
# Prints the finding count for that path at that commit, and writes the linter's
# output to <findings-file>.
#
# The count comes from the exit code, not from the line count alone. The linter
# exits 0 with no output on a clean file, 1 with one line per finding, and 2
# with one line on a bad path. Counting lines alone would therefore read a bad
# path as one finding. That corrupts a baseline in the direction that matters:
# a base of 1 instead of 0 lets a newly added file carry a finding through.
#
# A path absent at that commit counts zero, which is what makes a file the push
# adds lint clean against a base of zero. The absent case never reaches the
# linter, since that would itself exit 2.
lint_at() {
  _commit=$1
  _path=$2
  _out=$3

  : > "$_out"
  if ! git show "$_commit:$_path" > "$blob" 2>/dev/null; then
    echo 0
    return 0
  fi

  set +e
  "$PY" "$LINTER" check "$blob" > "$_out" 2>&1
  _rc=$?
  set -e

  case "$_rc" in
    0) echo 0 ;;
    1) grep -c . < "$_out" ;;
    *)
      echo "pre-push: rule '$RULE' aborted. The linter exited $_rc on:" >&2
      echo "  $_commit:$_path" >&2
      sed 's/^/    /' < "$_out" >&2
      return 2
      ;;
  esac
}

fail=0
TAB=$(printf '\t')

while IFS="$TAB" read -r range path; do
  [ -n "$range" ] || continue
  [ -n "$path" ] || continue

  base=${range%%..*}
  tip=${range##*..}

  if ! base_count=$(lint_at "$base" "$path" "$findings"); then exit 1; fi
  if ! tip_count=$(lint_at "$tip" "$path" "$findings"); then exit 1; fi

  if [ "$tip_count" -gt "$base_count" ]; then
    if [ "$fail" -eq 0 ]; then
      echo "pre-push: rule '$RULE' rejected this push." >&2
    fi
    echo "  $path" >&2
    echo "    $base_count findings at $(git rev-parse --short "$base"), $tip_count at $(git rev-parse --short "$tip")" >&2
    # The linter names the temp file it read. Put the real path back, so a
    # contributor can act on the finding without decoding a temp path.
    #
    # Match on the basename, not on "$blob". Git Bash writes the file through a
    # POSIX path and the Windows Python prints a drive-letter path for the same
    # file, so the two spellings never compare equal.
    sed -e "s|^.*prose-gate-$$\\.md|$path|" -e 's/^/    /' < "$findings" >&2
    fail=1
  fi
done < "$pairs"

if [ "$fail" -ne 0 ]; then
  echo "The gate blocks a rising count, not a non-zero one. Repair what this" >&2
  echo "push added, then commit the result:" >&2
  echo "  $PY $LINTER check <file>" >&2
  echo "To push without the gates, pass --no-verify. That disables every gate." >&2
  exit 1
fi
