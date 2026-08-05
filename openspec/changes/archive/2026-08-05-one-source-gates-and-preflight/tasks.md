## 1. The shared gate library

- [x] 1.1 Add `scripts/gates/_lib.sh` with `reject <rule>` and
  `no_verify_note`. Each writes one line to stderr, word for word as the gates
  write it today. Add a header comment saying the file is a library, not a
  gate, and why the two lines live here.
- [x] 1.2 Source the library in `scripts/gates/lockfile.sh` and replace its
  two literals with calls.
- [x] 1.3 Do the same in `scripts/gates/machine-paths.sh`.
- [x] 1.4 Do the same in `scripts/gates/ponytail-ledger.sh`.
- [x] 1.5 Do the same in `scripts/gates/prose.sh`. Leave its
  `rule '$RULE' aborted` line alone. That wording differs on purpose.
- [x] 1.6 Do the same in `scripts/gates/silent-green.sh`. It rejects at three
  points and notes the bypass at three points.
- [x] 1.7 Do the same in `scripts/gates/whitespace.sh`. It prints the header
  at two points and the note once.
- [x] 1.8 Confirm no gate still holds either literal:
  `grep -rn "rejected this push\|To push without the gates" scripts/gates/`
  reports `_lib.sh` only.

## 2. The preflight delegator

- [x] 2.1 Rewrite `scripts/preflight.ps1`. Resolve `bash` with `Get-Command`,
  run `scripts/preflight.sh` with the same profile argument, and exit with the
  code it returns.
- [x] 2.2 On a host where `bash` resolves to nothing, print a message naming
  Git Bash and `scripts/dev-up.sh`, then exit non-zero.
- [x] 2.3 Keep the `<core|serve>` usage message and its exit code 2, so a bad
  argument behaves as it does today.
- [x] 2.4 Change nothing in `scripts/preflight.sh`. No check, no order, no
  SQL, no repair command.
- [x] 2.5 Change nothing in `scripts/dev-up.ps1`. Its
  `& (Join-Path $PSScriptRoot "preflight.ps1") serve` call still works.

## 3. Verification by running the gates

- [x] 3.1 Run each of the six gates by hand, standalone, the way a
  contributor repairs one. Report what each printed.
- [x] 3.2 Call the library directly and read the two lines:
  `sh -c '. scripts/gates/_lib.sh; reject demo-rule; no_verify_note'`. Compare
  them word for word against the literals this change removes. Do not create a
  violating file: CLAUDE.md forbids mutating the shared tree to test
  something.
- [x] 3.3 Run `bash scripts/preflight.sh core` and report what it printed.
- [x] 3.4 Run `pwsh scripts/preflight.ps1 core` and confirm it prints the same
  thing and exits the same way.
- [x] 3.5 Run `pwsh scripts/preflight.ps1 bogus` and confirm exit code 2.

## 4. Documentation

- [x] 4.1 Rewrite the `README.md` sentence that offers
  `pwsh scripts/dev-up.ps1` for "Windows without Git Bash". That path now
  needs Git Bash.
- [x] 4.2 Rewrite the devcontainer-preflight entry in `docs/current-state.md`.
  Find it by its text, not by line number. It names `scripts/preflight.ps1` as
  a second implementation.
- [x] 4.3 Correct the paragraph in `PONYTAIL-DEBT.md` that lists four markers
  outside the scanned tree. `scripts/preflight.ps1:108` goes with the
  rewritten file.
- [x] 4.4 Append a `## One source for the gates and the preflight
  (\`one-source-gates-and-preflight\`)` section to `docs/current-state.md`.

## 5. Verification

- [x] 5.1 Run `bun run typecheck`. Report what it printed. No TypeScript
  changes, so this is a regression check on the tree.
- [x] 5.2 Run the FULL `bun test` with `DATABASE_URL` set, inside the
  devcontainer. Report the pass count AND the skip count.
- [x] 5.3 Run the antislop linter over `proposal.md`, `design.md`,
  `tasks.md`, both spec deltas, `README.md` and `docs/current-state.md`.
- [x] 5.4 Run `git diff --check`.
- [x] 5.5 Run `git ls-files --eol`. Read the `w/` column for CRLF.
- [x] 5.6 Confirm each touched Markdown file's antislop finding count did not
  rise against its count at `HEAD`. The push gate compares those two.
