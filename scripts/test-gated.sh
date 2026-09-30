#!/bin/sh
# Runs the command given as arguments, prints its full output, then applies the
# no-silent-green check to that output. Usage: sh scripts/test-gated.sh bun test
#
# Exits with the command's own code when the check passes. Exits 1 when the
# check rejects the run, even if the command passed.
#
# An output filter such as `rtk test` drops the line that names the database,
# so the check cannot read filtered text. The runner applies it to the raw
# output first. The log lives in the container's own /tmp, not the shared tmp/.
# This is not a gate: it rejects no push, so it sits beside scripts/gates/.
log=$(mktemp)
"$@" >"$log" 2>&1
rc=$?
cat "$log"
sh "$(dirname "$0")/gates/silent-green.sh" "$log" || rc=1
rm -f "$log"
exit $rc
