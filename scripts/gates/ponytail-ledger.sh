#!/bin/sh
# Gate rule: ponytail-ledger-fresh
#
# The ponytail ledgers record every `ponytail:` marker in the tree, so they go
# stale in silence when a marker appears, disappears or moves to another file.
# This compares the files PONYTAIL-DEBT.md names against the files that hold a
# marker today.
#
# Moved here from .githooks/pre-push, unchanged, by gate-recurring-defects.
# It was a gate by every property that change defines, and leaving it inline
# gave one concept two homes.
#
# ponytail: paths only, not line numbers. A marker that moves inside its own
# file does not trip this. Compare line numbers too if a drifted line number
# ever costs something.
set -e

RULE=ponytail-ledger-fresh

[ -f PONYTAIL-DEBT.md ] || exit 0

LEDGER_PATHS=$(grep -oE '^\*\*[^:*]+' PONYTAIL-DEBT.md | cut -c3- | sort -u)
TREE_PATHS=$(git grep -l 'ponytail:' -- src packages | sort -u)

if [ "$LEDGER_PATHS" != "$TREE_PATHS" ]; then
  echo "pre-push: rule '$RULE' rejected this push." >&2
  echo "  the ponytail ledgers are stale. These files differ:" >&2
  printf '%s\n%s\n' "$LEDGER_PATHS" "$TREE_PATHS" | sort | uniq -u | sed 's/^/    /' >&2
  echo "Rebuild them, then commit the result:" >&2
  echo "  sh scripts/ponytail-ledgers.sh" >&2
  echo "To push without the gates, pass --no-verify. That disables every gate." >&2
  exit 1
fi
