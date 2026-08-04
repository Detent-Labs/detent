#!/bin/sh
# Gate rule: changed-markdown-prose
#
# Runs the antislop linter over every Markdown file the pushed range adds or
# changes. Reads ranges on stdin, one per line, as scripts/gates/range.sh
# prints them.
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

files=$(mktemp)
trap 'rm -f "$files"' EXIT

while IFS= read -r range; do
  [ -n "$range" ] || continue
  git diff --name-only --diff-filter=d "$range" -- '*.md' 2>/dev/null >> "$files" || true
done

sort -u "$files" -o "$files"

if [ ! -s "$files" ]; then
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

fail=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ -f "$f" ] || continue
  out=$("$PY" "$LINTER" check "$f" 2>&1) || {
    if [ "$fail" -eq 0 ]; then
      echo "pre-push: rule '$RULE' rejected this push." >&2
    fi
    echo "$out" >&2
    fail=1
  }
done < "$files"

if [ "$fail" -ne 0 ]; then
  echo "Repair every finding above, then commit the result:" >&2
  echo "  $PY $LINTER check <file>" >&2
  echo "To push without the gates, pass --no-verify. That disables every gate." >&2
  exit 1
fi
