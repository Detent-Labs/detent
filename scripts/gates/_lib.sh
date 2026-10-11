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
#
# `bad_range` is the third: the two gates that read a pushed range share the
# wording for a range git cannot diff.

# reject <rule> — the header a gate prints before its findings.
reject() {
  echo "pre-push: rule '$1' rejected this push." >&2
}

# The last line a rejecting gate prints, after its repair command.
no_verify_note() {
  echo "To push without the gates, pass --no-verify. That disables every gate." >&2
}

# bad_range <rule> <range> <stderr-file> — a range git cannot diff. The gate
# stops here and exits 1. A swallowed failure would read as "nothing to check",
# which is a green that never looked. <stderr-file> holds git's own message.
#
# Call it from the gate's own shell, never from a command substitution: the
# exit would end the substitution's subshell and the gate would carry on.
bad_range() {
  reject "$1"
  echo "  git cannot diff the range '$2':" >&2
  sed 's/^/    /' < "$3" >&2
  echo "Repair: fetch the commits the range names, then push again:" >&2
  echo "  git fetch origin" >&2
  no_verify_note
  exit 1
}
