#!/bin/sh
# Rebuild PONYTAIL-DEBT.md and PONYTAIL-AUDIT.md from the `ponytail:` markers
# in the tree. The pre-push hook fails the push when the ledgers drift from the
# markers; this script is what repairs them.
#
# Runs on the host, not in the devcontainer, unlike `bun run check`. `claude` is
# a host binary and this job only reads source and rewrites two Markdown files.
#
# Commit the result yourself. A push carries the commits that already exist, so
# a rewrite during the push would ship the old ledgers.
set -e

cd "$(dirname "$0")/.."

claude -p "rescan the repo for ponytail debt markers and rewrite PONYTAIL-DEBT.md and PONYTAIL-AUDIT.md, then verify both against the antislop linter" \
  --allowedTools "Read,Grep,Edit,Bash"

echo
echo "ponytail-ledgers: what changed"
git --no-pager diff --stat -- PONYTAIL-DEBT.md PONYTAIL-AUDIT.md
