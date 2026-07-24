## Why

`PONYTAIL-AUDIT.md` (repo-wide over-engineering scan, last run 2026-07-24)
lists three surviving findings: one dead file with zero callers, and two
duplicated code blocks that differ only in a label string — the audit under
counted the latter two: implementation found a third copy of each pattern it
missed. None of them change spec-level behavior — they are pure
deletions/extractions — but `CLAUDE.md`'s "no unused code, no unrequested
duplication" bar means they should be cleared rather than left to rot into
permanent debt.

## What Changes

- Delete `packages/editor/src/draft/validate.ts` (`validateDraft` and its
  `DraftValidationIssue`/`DraftValidationResult` types) — fully superseded by
  `validation.ts::runValidation`, which covers the same
  `authoredProcessBody.safeParse` check plus CEL/registry/duration/
  cross-process dimensions this file never grew. No caller anywhere in
  `src/` or `packages/`.
- Collapse `RegistryValidationError`, `AssignmentRegistryValidationError`,
  and `DataSourceRegistryValidationError` in `src/engine/definitions.ts`
  into one shared base class (byte-identical constructor and issue
  formatting across all three, differing only in the `name` string) — the
  third class was found during implementation, missed by the audit scan,
  and folded in at no extra cost.
- Extract the duplicated Zod-issue-to-`RegistryIssue` mapping loop
  (`.config.` path join + push) shared by `checkActionRegistry`,
  `checkAssignmentRegistry`, **and** `checkDataSourceRegistry` (the third
  copy, also found during implementation) in `src/engine/registry-check.ts`
  into one `mapConfigIssues(loc, type, zodIssues)` helper.

## Capabilities

### New Capabilities
- `registry-error-consolidation`: a structural requirement that the
  publish-time registry-validation error classes and their Zod-issue
  mapping share one implementation instead of duplicating it — the
  mechanism-level counterpart to findings 2 and 3, in the same spirit as
  the `assignment-registry-validation` capability's "no registry to
  resolve against" requirement recorded when that indirection was cut.
  External behavior (error names, `instanceof` results, `RegistryIssue`
  shape) is unchanged; this capability exists to keep the "don't
  re-duplicate this" constraint from silently regressing.

### Modified Capabilities
None. Finding 1 (deleting the dead `validate.ts` file) has no capability
coverage in `openspec/specs/` — it is orphaned code, invisible to any
documented requirement — and stays a plain deletion with no spec delta.

## Impact

- `packages/editor/src/draft/validate.ts` — deleted (~30 lines).
- `src/engine/definitions.ts` — `RegistryValidationError`,
  `AssignmentRegistryValidationError`, and `DataSourceRegistryValidationError`
  merged into one shared base class (no behavior change; all three error
  names and `instanceof` checks at call sites keep working).
- `src/engine/registry-check.ts` — `checkActionRegistry`,
  `checkAssignmentRegistry`, and `checkDataSourceRegistry` share a new
  `mapConfigIssues` helper (no behavior change).
- No schema, test-behavior, or public-API changes. Existing tests
  (`test/definitions.test.ts`, `test/assignment-registry.test.ts`,
  `test/data-source-registry-publish.test.ts`) must keep passing unmodified
  as the acceptance signal.
