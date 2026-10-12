#!/bin/sh
# Runs the command given as arguments, prints its full output, then applies the
# no-silent-green check to that output. Usage: sh scripts/test-gated.sh bun test
#
# Exits with the command's own code when the check passes. Exits 1 when the
# check rejects the run and the command itself exited 0. A command that failed
# keeps its own code, so a crashed Bun that printed no summary still shows 132.
#
# This is the full-suite check. The gate holds a pass floor, so a subset run
# through here fails it. A subset run belongs to `bun test <path>`.
#
# An output filter such as `rtk test` drops the line that names the database,
# so the check cannot read filtered text. The runner applies it to the raw
# output first. The log lives in the container's own /tmp, not the shared tmp/.
# This is not a gate: it rejects no push, so it sits beside scripts/gates/.
log=$(mktemp)
"$@" >"$log" 2>&1
rc=$?
cat "$log"
if ! sh "$(dirname "$0")/gates/silent-green.sh" "$log"; then
  [ "$rc" -ne 0 ] || rc=1
fi
rm -f "$log"
exit $rc
