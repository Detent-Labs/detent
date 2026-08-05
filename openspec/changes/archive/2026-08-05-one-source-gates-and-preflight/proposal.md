## Why

Ponytail audit findings 3 and 4. The audit groups them, because both trace to
one missing shared source.

The six push-gate scripts repeat two lines of policy text. The rejection
header, `pre-push: rule '$RULE' rejected this push.`, appears 9 times. The
bypass note, `To push without the gates, pass --no-verify. That disables every
gate.`, appears 8 times. Both are wording a contributor reads, not logic. Text
repeated 17 times drifts.

`scripts/preflight.sh` and `scripts/preflight.ps1` hand-sync the same six
checks, in the same order, in two languages. Check 5 carries identical SQL in
both. Both type the service list `app db mailpit` and the port list
`3000 8025`. Check 6 repeats its whole rationale as a comment in each. Commit
`210c526` narrowed the WAL check once, and both files needed the repair by
hand.

The PowerShell variant's own header says it exists "for Windows systems
without Git Bash / WSL". Its own repair strings contradict that. Both check 3
and check 4 print `bash scripts/dev-up.sh` as the repair. A system without
bash cannot run that repair either.

## What Changes

- Add `scripts/gates/_lib.sh` with `reject <rule>` and `no_verify_note`. Each
  of the six gate scripts sources it and calls them. The two lines of policy
  text then exist once.
- Rewrite `scripts/preflight.ps1` as a delegator. It resolves `bash` and runs
  `scripts/preflight.sh` with the same profile argument. It fails with a named
  message when it finds no `bash`. The file goes from 133 lines to about 20.
- `scripts/preflight.sh` stays the one implementation of the six checks. No
  check, no order, no SQL and no repair command changes.

This change drops the audit's third sub-claim under finding 3. That claim
says `prose.sh` and `whitespace.sh` hand-roll an identical changed-file loop,
differing only by a `-- '*.md'` pathspec. They do not. `prose.sh` reads
`git diff --name-status -M`. It carries base and tip paths per range, because
it must read a renamed file's baseline. `whitespace.sh` reads
`git diff --name-only` and needs neither. A shared collector would force
rename machinery on the gate that does not want it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `push-gate-checks`: the requirement on what a rejecting gate prints gains a
  clause. The rejection header and the bypass note come from one shared
  library, which every gate sources.
- `devcontainer-preflight`: the requirement that both bring-up scripts carry
  the same contract. One implementation now holds the six checks. The
  PowerShell entry point delegates to it, so the two agree by construction
  rather than by hand.

## Impact

- `scripts/gates/_lib.sh` is new.
- `scripts/gates/lockfile.sh`, `machine-paths.sh`, `ponytail-ledger.sh`,
  `prose.sh`, `silent-green.sh` and `whitespace.sh`. Each sources the library
  and calls the two helpers.
- `scripts/preflight.ps1`. Rewritten as a delegator.
- `scripts/dev-up.ps1` calls `preflight.ps1 serve`. That call stays as it is.
- `.githooks/pre-push` calls `bash scripts/preflight.sh core`. Unchanged.
- `openspec/specs/push-gate-checks/spec.md` and
  `openspec/specs/devcontainer-preflight/spec.md`. One requirement each.
- `docs/current-state.md`. One new section.
- No change to any gate's rule, scope, exit code or repair command.
