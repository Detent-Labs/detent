## ADDED Requirements

### Requirement: The `ponytail:` marker is the deferral record

A deliberate shortcut in `src/` or `packages/` SHALL carry a `ponytail:` comment
at the code it defers. That comment SHALL state three things: the shortcut, the
ceiling it holds to, and the entry point for the upgrade.

The roll-up SHALL be derived on demand. The command is
`git grep -n 'ponytail:' -- src packages`. No tracked ledger file and no push
gate SHALL back this convention. A contributor who adds or removes a marker
SHALL owe no bookkeeping beyond the comment itself.

The reason is a measured failure. `ponytail-ledger-fresh` compared a
`PONYTAIL-DEBT.md` path set against the tree. Commit `0b520cc8` untracked that
ledger on 2026-07-31, and commit `22f32847` added the gate three days later. The
gate opened with `[ -f PONYTAIL-DEBT.md ] || exit 0`, so it passed in silence on
every clone but the one holding the file. Two neighbouring requirements in this
spec already name that shape as a failure. The whitespace requirement says
silence would read as a pass. The prose requirement demands a loud, named skip
for an absent dependency.

Duplication was the second failure. The ledger restated the marker comments in a
template. The markers sit in the code, so they cannot drift from it. The ledger
could, and did. This change measured nineteen ledger line numbers and found four
wrong, one of them by 110 lines. The gate compared path sets alone, so it
reported a pass over all four.

The repair path was the third failure. `scripts/ponytail-ledgers.sh` regenerated
both ledgers through a `claude -p` call on the host. That call is
non-deterministic, needs the network, and the devcontainer cannot make it. No
other gate asks a contributor for a repair nobody can reproduce. That sentence
is rationale for this requirement. It binds no other gate. The lockfile gate's
repair needs the container and may need the network, and that gate stays.

A `ponytail:` marker outside `src/` and `packages/` stays legitimate. The
roll-up command scopes to those two trees, so a wider grep finds the rest.

#### Scenario: A new marker costs one comment and nothing else

- **WHEN** a contributor adds a `ponytail:` comment to a file under `src/` or
  `packages/`
- **THEN** the push gates raise no finding
- **AND** no tracked file records the marker a second time

#### Scenario: The roll-up is one command

- **WHEN** a reader asks what deferrals the tree carries
- **THEN** `git grep -n 'ponytail:' -- src packages` prints every marker with its
  file and line
- **AND** each hit carries its own shortcut, ceiling and upgrade entry point

#### Scenario: A marker that moves keeps its record

- **WHEN** a later change shifts a `ponytail:` comment to another line, or to
  another file
- **THEN** the record moves with it, and no second site needs a matching change

#### Scenario: A reintroduced ledger is rejected in review

- **WHEN** a change proposes a tracked file listing the `ponytail:` markers, or a
  gate comparing such a file against the tree
- **THEN** this requirement rejects it, and the change SHALL amend this
  requirement first
