# Design

## Context

See proposal.md. `scripts/openspec-review-check.ts` spawns
`openspec validate <name> --strict --json` and folds its issues into its own
report. It runs in the container, as CLAUDE.md requires for all tooling.

## Goals / Non-Goals

**Goals:**

- One OpenSpec CLI version on the host and in the container.

**Non-Goals:**

- Running `openspec update`, which regenerates the `openspec-*` skills and
  `.claude/commands/opsx/`. CLAUDE.md keeps that directory deleted, and the
  skills carry local edits.
- Pinning the host's CLI. The host installs it per machine.

## Decisions

### D1. Pin the version the host already runs

1.14.3 is the version every change of 2026-10-20 validated against on the
host. Matching it removes the disagreement without a new unknown.

### D2. The full suite is the compatibility check

`--json` output may differ between 1.9.0 and 1.14.3. The review-check
script's tests drive real changes through it. A green full suite on the
rebuilt image shows the script still parses the output, and running the
script over this change shows it end to end.

## Risks / Trade-offs

- [The JSON shape changed and the script misreads it] → The suite and the
  end-to-end run in tasks catch it. A red result stops the change before
  merge.
- [The image rebuild takes minutes] → It runs once. `dev-pod.sh up` reuses
  the cache for every other layer.

## Migration Plan

1. Implement and verify on the stacked branch.
2. Archive after the five changes below it.
3. Rollback: revert the pin and run `sh scripts/dev-pod.sh up`.

## Open Questions

None.
