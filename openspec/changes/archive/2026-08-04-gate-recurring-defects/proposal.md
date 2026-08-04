## Why

The push gate runs the typecheck and the full suite. `CLAUDE.md` names two more
checks that a change must pass. A person runs both from memory: the antislop
linter, and `git diff --check`. Memory is not a gate.

A defect-archaeology pass read 132 archived changes, the 37 numbered findings in
the two review documents, and 289 commits. Five defect classes recur, each twice
or more. Each one has a detector that costs one shell command.

One of those detectors already existed and then went away. The
`add-ci-and-dependency-hygiene` change made `bun install --frozen-lockfile` the
first CI step. Commit 4ff4382 replaced the CI workflow with the pre-push hook. It
carried that step over nowhere. Nothing has guarded lockfile drift since
2026-07-29.

## What Changes

- Add `scripts/gates/`, one script per defect class. Each script prints the rule
  name it enforces when it rejects a push.
- Extend `.githooks/pre-push` to run the gates. The hook keeps its current order:
  ledger check, preflight, then the container checks.
- Gate 1, lockfile drift: run `bun install --frozen-lockfile` in the container.
- Gate 2, silent green: refuse a suite run that names no database. Hold the skip
  count at or below a recorded floor.
- Gate 3, whitespace: reject a CR byte, a trailing space, or a blank line at end
  of file. The gate reads the pushed commit range only.
- Gate 4, prose: run the antislop linter over the Markdown files the push changes.
- Gate 5, machine paths: reject an absolute home-directory path in a tracked file.
- Add a section to `CLAUDE.md` that lists what the gates now enforce.

Three properties hold for every gate. Each one passes on the current tree, so the
gate arrives green. Each one names its own rule when it rejects a push. Each one
that needs only git and a shell runs on the host. A stopped container still
reports those three.

## Capabilities

### New Capabilities

- `push-gate-checks`: the five mechanical detectors. What each one rejects, where
  each one runs, and what each one does when its tool is absent.

### Modified Capabilities

- `development-toolchain`: the push-gate requirement states that the hook runs the
  typecheck and the suite. It changes to state that the hook also runs the gates.
  A gate that rejects a push blocks that push.

## Impact

- New: `scripts/gates/` and its scripts. One of those files is data, not a script:
  `scripts/gates/skip-floor.txt` holds the skip count the suite gate compares
  against.
- Moved: the ponytail-ledger check leaves `.githooks/pre-push` for
  `scripts/gates/ponytail-ledger.sh`, unchanged.
- Modified: `.githooks/pre-push`, `CLAUDE.md`.
- No change to `src/`, `packages/`, the JSON contract, or any runtime behavior.
- The antislop linter sits outside the repository, at a path that differs per
  machine. Gate 4 therefore reports a skip when it cannot find the linter. On a
  clone without the tool, a gate that rejected the push would teach contributors
  to pass `--no-verify`. That flag disables every gate.
