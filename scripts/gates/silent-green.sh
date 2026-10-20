#!/bin/sh
# Gate rule: no-silent-green
#
# Reads a captured `bun run check` output file, named as the one argument, and
# rejects a run that proves less than it appears to.
#
# The pass count alone is not evidence. The DB-backed suites are
# test.skipIf(!DB) at hundreds of sites, and they are most of the suite. A run
# without DATABASE_URL skips all of them and prints a green that looks genuine.
# CLAUDE.md makes that a bold rule of its own, which measures how easily it recurs.
#
# Two signals, both printed by test/preload-db.ts:
#   `[test] database: <name>`
#   `[test] DATABASE_URL unset`
# The gate matches those literals rather than inferring a database from silence.
#
# `bun test` closes each run with indented count lines and one `Ran` line:
#
#    5206 pass
#    1 skip
#    0 fail
#   Ran 5207 tests across 269 files. [41.3s]
#
# The gate reads that whole summary, because a gate that reads one line is
# fooled by the rename of it. `bun test` prints no skip line and no todo line
# when the count is zero, so an absent line reads as zero.
#   - It sums the skip and todo lines into one skip count. A todo test runs
#     nothing, so it counts as a skip.
#   - It keeps the largest pass count. `bun run check` prints one summary for
#     `bun test` and one for `test:tz`, and a hand run prints one.
#   - For each `Ran N tests` line, the counts since the previous `Ran` line must
#     add up to N. A renamed count line breaks the sum, so the gate rejects it
#     instead of reading zero skips.
#   - A run with no `pass` line, no `Ran` line, or counts after its last `Ran`
#     line has a summary the gate cannot read.
#
# The awk program below uses POSIX features only: no interval expression, no
# gensub, no array form of match. mawk (devcontainer) and gawk (Git Bash) read
# it alike.
set -e

. "$(dirname "$0")/_lib.sh"

RULE=no-silent-green
OUT="$1"
SKIP_FLOOR_FILE="$(dirname "$0")/skip-floor.txt"
PASS_FLOOR_FILE="$(dirname "$0")/pass-floor.txt"

# read_floor <file> — the last bare integer in a floor file. Every other line
# is a comment. Prints nothing when the file holds no integer.
read_floor() {
  sed -n 's/^[0-9][0-9]*$/&/p' "$1" | tail -1
}

# unreadable <reason> — the run's summary cannot be trusted. A summary the gate
# cannot read could hide skipped tests behind a count of zero.
unreadable() {
  reject "$RULE"
  echo "  The gate cannot read the run's summary: $1" >&2
  echo "  A summary it cannot read could hide skipped tests behind a count of zero." >&2
  echo "Run the full suite again with 'sh scripts/test-gated.sh bun test'. If bun" >&2
  echo "changed its summary format, repair the awk program in this gate." >&2
  no_verify_note
  exit 1
}

if [ -z "$OUT" ] || [ ! -f "$OUT" ]; then
  echo "pre-push: rule '$RULE' cannot run. No captured run at: '$OUT'" >&2
  exit 1
fi

# Both literals are anchored to line start. The preload prints them in column 0,
# while bun prints a test line as `(pass) <name>`. Without the anchor a test
# whose NAME held either literal would block every push, and no edit to the
# suite could satisfy the gate.
if grep -q '^\[test\] DATABASE_URL unset' "$OUT"; then
  reject "$RULE"
  echo "  The suite ran with DATABASE_URL unset, so the DB-backed suites" >&2
  echo "  skipped. That pass count proves almost nothing." >&2
  echo "Run the suite in the devcontainer, where DATABASE_URL is already set." >&2
  no_verify_note
  exit 1
fi

if ! grep -q '^\[test\] database:' "$OUT"; then
  reject "$RULE"
  echo "  The captured run names no database. development-toolchain requires" >&2
  echo "  every run to print the database it connected to, before the first" >&2
  echo "  suite. Its absence means the run is not the one this gate can read." >&2
  no_verify_note
  exit 1
fi

# Nine integers, in this order: pass lines, Ran lines, 1 when count lines follow
# the last Ran line, skip sum, todo sum, largest pass count, 1 when a Ran line
# disagrees with its counts, then that block's count sum and its Ran total.
summary=$(awk '
  /^ *[0-9]+ pass$/ {
    passlines++; bsum += $1; pending = 1
    if ($1 + 0 > maxpass) maxpass = $1 + 0
    next
  }
  /^ *[0-9]+ skip$/ { skip += $1; bsum += $1; pending = 1; next }
  /^ *[0-9]+ todo$/ { todo += $1; bsum += $1; pending = 1; next }
  /^ *[0-9]+ fail$/ { bsum += $1; pending = 1; next }
  /^Ran [0-9]+ tests? across/ {
    ran++
    if (bsum != $2 + 0 && !mismatch) { mismatch = 1; msum = bsum; mtotal = $2 + 0 }
    bsum = 0; pending = 0
    next
  }
  END {
    printf "%d %d %d %d %d %d %d %d %d\n", passlines, ran, pending, skip, todo, maxpass, mismatch, msum, mtotal
  }
' "$OUT")
set -- $summary
passlines=$1 ranlines=$2 trailing=$3 skipped=$4 todo=$5 maxpass=$6
mismatch=$7 blocksum=$8 blocktotal=$9

[ "$passlines" -gt 0 ] || unreadable "it prints no 'N pass' line."
[ "$ranlines" -gt 0 ] || unreadable "it prints no 'Ran N tests' line."
[ "$mismatch" -eq 0 ] ||
  unreadable "its counts add up to $blocksum, but its 'Ran' line says $blocktotal tests."
[ "$trailing" -eq 0 ] || unreadable "count lines follow its last 'Ran' line."

skip_floor=$(read_floor "$SKIP_FLOOR_FILE")
if [ -z "$skip_floor" ]; then
  echo "pre-push: rule '$RULE' cannot run. No integer in $SKIP_FLOOR_FILE" >&2
  exit 1
fi

pass_floor=$(read_floor "$PASS_FLOOR_FILE")
if [ -z "$pass_floor" ]; then
  echo "pre-push: rule '$RULE' cannot run. No integer in $PASS_FLOOR_FILE" >&2
  exit 1
fi

held=$((skipped + todo))
if [ "$held" -gt "$skip_floor" ]; then
  reject "$RULE"
  echo "  The run skipped $held tests: $skipped skip and $todo todo. A todo test" >&2
  echo "  counts as a skip. The recorded floor is $skip_floor." >&2
  echo "  A rising skip count hides tests that stopped running." >&2
  echo "Either repair what started skipping, or raise the floor in the same" >&2
  echo "commit, with a comment naming what the increase covers:" >&2
  echo "  $SKIP_FLOOR_FILE" >&2
  no_verify_note
  exit 1
fi

if [ "$maxpass" -lt "$pass_floor" ]; then
  reject "$RULE"
  echo "  The run passed $maxpass tests. The recorded pass floor is $pass_floor." >&2
  echo "  A run of far fewer tests than the suite holds proves less than it looks." >&2
  echo "Run the full suite with 'sh scripts/test-gated.sh bun test'. A subset run" >&2
  echo "belongs to 'bun test <path>'. If a change removed tests on purpose, lower" >&2
  echo "the floor in the same commit:" >&2
  echo "  $PASS_FLOOR_FILE" >&2
  no_verify_note
  exit 1
fi
