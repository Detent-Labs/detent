## Context

Three findings from the 2026-07-24 `PONYTAIL-AUDIT.md` scan, all low-risk
internal cleanup with no cross-cutting or architectural dimension: one dead
file, and a pair of duplications the audit scan under-counted — it named
two structurally-identical error classes and one duplicated mapping loop,
but implementation found a third of each (`DataSourceRegistryValidationError`
and its `checkDataSourceRegistry` mapping loop), byte-identical to the
other two and folded into the same fix at no added cost. No new pattern,
dependency, data model, security, or performance concern is involved — this
section exists only because the schema requires a design artifact before
tasks; the substance below is intentionally thin.

## Goals / Non-Goals

**Goals:**
- Remove the dead `validate.ts` file without breaking any import.
- Merge all three registry-validation error classes and all three
  Zod-issue mapping loops without changing observable behavior (error
  `name`, message, `instanceof` results, thrown issue shapes).

**Non-Goals:**
- No change to publish-time validation logic, error handling call sites, or
  test behavior.
- No broader registry-validation refactor beyond the named duplications
  (three classes, three mapping loops — every existing copy of each
  pattern, not a hypothetical future one).

## Decisions

- **Confirm zero callers before deleting `validate.ts`.** Grep
  `validateDraft|DraftValidationIssue|DraftValidationResult` across `src/`
  and `packages/` as a pre-delete check, since the audit finding is a
  point-in-time snapshot that may be stale.
- **Merge the error classes via a shared base class, not three independent
  `name` constructor arguments hand-copied per class.** A
  `RegistryValidationErrorBase extends Error` takes `(issues, name)`; each
  of `RegistryValidationError`/`AssignmentRegistryValidationError`/
  `DataSourceRegistryValidationError` becomes a two-line subclass that
  calls `super(issues, "<OwnName>")`. This keeps every exported class name
  and `instanceof` check intact for callers, and scales to the third
  (found-during-implementation) class at zero extra cost — a bare
  constructor-argument approach without a base would have meant repeating
  the same message-formatting logic three times instead of once.
- **Extract `mapConfigIssues(loc, type, zodIssues)` as a local helper in
  `registry-check.ts`**, not a new file — it has three call sites in one
  module, so a same-file helper is the minimum viable fix per the ladder
  (no new module for three same-file callers).

## Risks / Trade-offs

- [Stale audit finding: `validate.ts` grew a caller since the scan] →
  Mitigation: re-grep immediately before deleting (see Decisions).
- [Merging error classes accidentally changes `instanceof` behavior for a
  call site relying on one of the three distinct classes] → Mitigation: keep
  all three class names as exported identifiers, each a thin subclass of one
  shared base, verified by running `test/definitions.test.ts`,
  `test/assignment-registry.test.ts`, and
  `test/data-source-registry-publish.test.ts` unmodified.

## Migration Plan

Single-step, non-breaking: delete the file, merge the classes, extract the
helper, run `bun test` (with `DATABASE_URL` set) and `bun run typecheck`.
No data migration, no version bump, no rollback beyond `git revert`.

## Open Questions

None.
