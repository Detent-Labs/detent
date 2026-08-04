## Why

The `changed-markdown-prose` gate lints whole files. It rejects a push when the
linter exits non-zero on any Markdown file the pushed range changes. It does not
ask whether the change caused the findings.

That blocked a real push on 2026-08-04. The `gate-recurring-defects` change
synced one requirement into `openspec/specs/development-toolchain/spec.md`. The
gate rejected the push over 28 findings. Every one of them also existed at
`origin/main`. Clearing them took a prose rewrite of a spec the change needed
one requirement from. Commit 82fc31c carries that rewrite.

Measurement, not estimate, sizes the remaining exposure. The live specs under
`openspec/specs/` hold 3166 findings across 52 of 80 files. The heaviest are
`instance-migration` at 287, `timers` at 220, `transition-execution` at 167 and
`transactional-outbox` at 141. A change that touches any one of them inherits
its whole debt as a precondition for pushing.

## What Changes

- Make the gate a ratchet. It reads each Markdown file the pushed range adds or
  changes. For each one it compares the linter's finding count against the count
  at the range's base commit. It rejects only a count that rises.
- A file with no version at the base has a baseline of zero. A new file SHALL
  therefore still lint clean.
- A file the range deleted raises no finding. It has no worktree bytes to read.
- Keep the absent-linter skip exactly as it is. This change does not touch it.
- Print both counts when the gate rejects, the way the skip-floor gate does.
- Record the norm in `CLAUDE.md`: clear a touched file's debt when it is cheap.
  That norm stays advisory. The ratchet is the mechanical floor.

The shape is not new here. The skip-floor gate already pairs a mechanical
ratchet with a human norm. That norm is to reduce the number it guards.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `push-gate-checks`: the *Changed Markdown passes the prose linter* requirement
  states that any non-zero linter exit blocks the push. It changes to state that
  only a rising count blocks the push.

## Impact

- Modified: `scripts/gates/prose.sh`, `CLAUDE.md`, and this change's own
  `design.md`, which records the measured cost.
- Modified spec: `openspec/specs/push-gate-checks/spec.md`.
- No change to `src/`, `packages/`, the JSON contract, or any runtime behavior.
- Cost: one more linter run per changed Markdown file, against the base version.
  Measured at 0.16s per file, so a ten-file change pays about 1.6s more.
- The gate keeps its current placement. It runs on the host, before the
  preflight, and it needs only git and a shell.
