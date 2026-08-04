#!/bin/sh
# Gate rule: no-silent-green
#
# Reads a captured `bun run check` output file, named as the one argument, and
# rejects a run that proves less than it appears to.
#
# The pass count alone is not evidence. The DB-backed suites are
# test.skipIf(!DB) at hundreds of sites, and they are most of the suite. A run
# without DATABASE_URL skips all of them and prints a green that looks genuine.
# CLAUDE.md states that twice, in bold, which measures how easily it recurs.
#
# Two signals, both printed by test/preload-db.ts:
#   line 56: `[test] database: <name>`
#   line 58: `[test] DATABASE_URL unset`
# The gate matches those literals rather than inferring a database from silence.
#
# `bun test` prints no skip line at all when nothing skips. An absent line
# therefore reads as zero: a bare grep would yield an empty string, and an
# integer comparison against empty misreports rather than rejecting.
set -e

RULE=no-silent-green
OUT="$1"
FLOOR_FILE="$(dirname "$0")/skip-floor.txt"

if [ -z "$OUT" ] || [ ! -f "$OUT" ]; then
  echo "pre-push: rule '$RULE' cannot run. No captured run at: '$OUT'" >&2
  exit 1
fi

# Both literals are anchored to line start. The preload prints them in column 0,
# while bun prints a test line as `(pass) <name>`. Without the anchor a test
# whose NAME held either literal would block every push, and no edit to the
# suite could satisfy the gate.
if grep -q '^\[test\] DATABASE_URL unset' "$OUT"; then
  echo "pre-push: rule '$RULE' rejected this push." >&2
  echo "  The suite ran with DATABASE_URL unset, so the DB-backed suites" >&2
  echo "  skipped. That pass count proves almost nothing." >&2
  echo "Run the suite in the devcontainer, where DATABASE_URL is already set." >&2
  echo "To push without the gates, pass --no-verify. That disables every gate." >&2
  exit 1
fi

if ! grep -q '^\[test\] database:' "$OUT"; then
  echo "pre-push: rule '$RULE' rejected this push." >&2
  echo "  The captured run names no database. development-toolchain requires" >&2
  echo "  every run to print the database it connected to, before the first" >&2
  echo "  suite. Its absence means the run is not the one this gate can read." >&2
  echo "To push without the gates, pass --no-verify. That disables every gate." >&2
  exit 1
fi

# `bun run check` runs the suite twice: `bun test`, then `test:tz`. Sum every
# skip line rather than reading one, so a skip in either run counts.
skipped=$(sed -n 's/^ *\([0-9][0-9]*\) skip$/\1/p' "$OUT" | awk '{n+=$1} END {print n+0}')
[ -n "$skipped" ] || skipped=0

floor=$(sed -n 's/^[0-9][0-9]*$/&/p' "$FLOOR_FILE" | tail -1)
if [ -z "$floor" ]; then
  echo "pre-push: rule '$RULE' cannot run. No integer in $FLOOR_FILE" >&2
  exit 1
fi

if [ "$skipped" -gt "$floor" ]; then
  echo "pre-push: rule '$RULE' rejected this push." >&2
  echo "  The run skipped $skipped tests. The recorded floor is $floor." >&2
  echo "  A rising skip count hides tests that stopped running." >&2
  echo "Either repair what started skipping, or raise the floor in the same" >&2
  echo "commit, with a comment naming what the increase covers:" >&2
  echo "  $FLOOR_FILE" >&2
  echo "To push without the gates, pass --no-verify. That disables every gate." >&2
  exit 1
fi
