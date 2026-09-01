## Why

`scripts/gates/whitespace.sh` reads its ranges on stdin. An empty list leaves it
nothing to check, and it exits 0 without a word. Two places document exactly that
call: `CLAUDE.md` and `openspec/specs/push-gate-checks/spec.md`. A contributor who
follows either one reads a green that proves nothing. That has happened twice here,
each time independently.

## What Changes

- `scripts/gates/whitespace.sh` prints a named line when the range list leaves it
  no file to check. The exit code stays 0, because an empty push is legitimate.
- `CLAUDE.md` documents the piped call, `sh scripts/gates/range.sh < /dev/null |
  sh scripts/gates/whitespace.sh`, the form it already documents for `prose.sh`.
- `openspec/specs/push-gate-checks/spec.md` corrects the same call in its
  "A gate still runs alone" scenario.
- `.githooks/pre-push` corrects the same call in its own header comment. That
  comment is what a contributor reads while repairing a gate.
- A `bun:test` suite runs the script with an empty range and asserts the line.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `push-gate-checks`: the whitespace gate reports an empty range instead of
  passing in silence. The scenario that names its stand-alone call names the
  piped form.

## Impact

- `scripts/gates/whitespace.sh` gains one branch and one message.
- `CLAUDE.md`, the `push-gate-checks` spec and the `.githooks/pre-push` header
  comment carry the corrected call.
- `test/` gains its first gate test.
- No engine, HTTP or UI code changes. The hook and the CI workflow already pipe
  a range into the gate, so neither call changes.
