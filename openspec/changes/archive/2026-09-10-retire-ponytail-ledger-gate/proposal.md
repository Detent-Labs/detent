## Why

`CLAUDE.md:195` lists `ponytail-ledger-fresh` in a table that opens with
"`.githooks/pre-push` runs the gates below on every push". That gate runs on
one machine. `scripts/gates/ponytail-ledger.sh:22` reads
`[ -f PONYTAIL-DEBT.md ] || exit 0` before its comparison, and `.gitignore:51-52`
ignores both ledgers. Every other clone gets a silent pass.

The shape was deliberate and dated. Commit `0b520cc8` untracked both files on
2026-07-31. Commit `22f32847` created the gate on 2026-08-03, three days later,
with the guard present from birth. That commit's own message states the
consequence: "the hook skips the check on a clone that has none". The gate has
never run on a second clone, by construction.

`openspec/specs/push-gate-checks/spec.md` already forbids this shape twice, for
other gates. The whitespace requirement says "Silence would read as a pass". The
prose requirement's scenario is "An absent linter skips loudly". That spec also
carries a requirement for each of the five other rules in the `CLAUDE.md` table.
This rule is the only one with none. The repository wrote the rule and never
applied it here.

The two ledgers hold content worth keeping. A 294-line block records
simplifications that a reviewer examined and refused, each with the measurement
that refused it. Its job is to stop the next sweep re-proposing a cut somebody
already priced.

## What Changes

- **BREAKING for the push gate set.** Delete `scripts/gates/ponytail-ledger.sh`,
  `scripts/ponytail-ledgers.sh`, the hook line at `.githooks/pre-push:50`, the
  CI step at `.github/workflows/check.yml:50-51`, and the `CLAUDE.md` table row.
  Six push gates become five. Four host gates become three.
- Add one requirement to `push-gate-checks`. It defines the `ponytail:` marker
  convention, names `git grep -n 'ponytail:' -- src packages` as the roll-up,
  and states that no ledger file and no gate back it.
- `docs/decisions.md` gains the audit's one open finding, under "Decided, not
  yet built". The hand-rolled router in `src/http/server.ts` reimplements
  `Bun.serve({ routes })`. Verified at the code on 2026-09-10.
- `docs/decisions.md` gains a new section holding the refusal record, rewritten
  rather than moved. Each entry keeps the proposal, the refusal reason, and
  the measurement.
- `docs/decisions.md` entry SEC-5 loses its three dead citations. It names
  `PONYTAIL-DEBT.md:84-87` and the gate this change deletes.
- Six citations name finding numbers that `PONYTAIL-AUDIT.md` no longer holds.
  Each one moves to the archived change that closed it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `push-gate-checks`: one added requirement. It defines the `ponytail:` marker
  convention and its roll-up command. It states that neither a ledger file nor a
  gate backs the convention. This change leaves `skip_specs` unset.

The five gate-specific requirements in that spec each describe a detector. This
one describes the absence of a detector, and says what carries the record
instead. Two spec-level statements follow. The requirement binds where a
deferral gets written down. It also forbids a later change from reintroducing a
ledger for a gate to compare against.

## Impact

- Deleted: `scripts/gates/ponytail-ledger.sh`, `scripts/ponytail-ledgers.sh`.
- Edited: `.githooks/pre-push`, `.github/workflows/check.yml`, `CLAUDE.md`,
  `docs/decisions.md`, `docs/current-state.md`, `src/pagination.ts`, and the
  four `*-consolidation` specs that cite the audit in Purpose prose.
- Added: `openspec/specs/push-gate-checks/spec.md` gains one requirement.
- No engine, HTTP or UI behavior changes. `src/pagination.ts` takes one comment
  change inside its module doc block.
- Two files carry an armed prose ratchet at count 0: `docs/decisions.md` and
  `openspec/specs/push-gate-checks/spec.md`. `field-tree-check-consolidation`
  sits at 0 too. Any error-class finding added to one of the three is a rise.
  `CLAUDE.md` is masked by the `allow-file` line commit `bbf37d1` added.
