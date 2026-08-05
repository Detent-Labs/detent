# Shared by every gate in this directory. Not a gate itself, which is what the
# leading underscore says. Nothing enumerates this directory: .githooks/pre-push
# names each gate it runs.
#
# Source it by a path relative to the sourcing script, so a gate still runs
# alone while a contributor repairs it:
#
#   . "$(dirname "$0")/_lib.sh"
#
# Two lines of a rejecting gate's output are the same in every gate: the header
# that names the rule, and the note that names the bypass. Both are text a
# contributor reads, not logic. Before `one-source-gates-and-preflight` the
# header stood in 9 copies and the note in 8, and a copy that fell behind would
# have taught the wrong thing.
#
# The findings and the repair command stay in each gate. Those differ per gate,
# which is the whole point of naming the rule.
#
# Two primitives rather than one combined `fail_rule`, because the gates reject
# in different shapes. `whitespace.sh` and `prose.sh` set a flag, keep checking
# and exit later. `silent-green.sh` rejects at three separate points.

# reject <rule> — the header a gate prints before its findings.
reject() {
  echo "pre-push: rule '$1' rejected this push." >&2
}

# The last line a rejecting gate prints, after its repair command.
no_verify_note() {
  echo "To push without the gates, pass --no-verify. That disables every gate." >&2
}
