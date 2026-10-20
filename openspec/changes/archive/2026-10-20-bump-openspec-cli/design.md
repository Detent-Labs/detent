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

### D2. A known-bad change proves the parse

`--json` output may differ between 1.9.0 and 1.14.3. The full suite cannot
show if the script still reads it.
The reason: `test/openspec-review-check.test.ts`
drops every `openspec validate` line (`ownFindings`), because the CLI is not
installed everywhere. A valid change proves nothing either, since a misread
also prints no finding.

The check therefore runs the script against a change with a known error. It
uses a copy of `openspec/` under the scratch directory and a delta whose
requirement has no `#### Scenario:`. The CLI reports that as an ERROR, so the
script must print a Critical from `openspec validate`. A MODIFIED header absent
from the base spec does not serve. 1.14.3 reports it as INFO, measured on
2026-10-20. Only the script's own header check turns it into a Critical.

The suite still covers the script's own checks.

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
