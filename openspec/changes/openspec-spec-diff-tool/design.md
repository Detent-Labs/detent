## Context

This change extracts four functions from
`scripts/openspec-review-check.ts`. The function `normalizeHeading`
trims and collapses whitespace in a heading. The function
`extractRequirements` parses a delta spec's `## ADDED/MODIFIED/REMOVED
Requirements` sections into `{ kind, title, line }` entries. The
function `extractBaseTitles` lists every `### Requirement:` header in a
base spec. The function `closest` is a Levenshtein nearest-match lookup,
for a reworded header hint.

Its `main` function already loops over every capability under a
change's `specs/` directory. It reads the base spec at
`openspec/specs/<cap>/spec.md` when one exists. It classifies each delta
requirement as matched, added-that-exists, modified-with-no-match, or
removed-with-no-match.

See proposal.md - Why for the motivation.

## Goals / Non-Goals

**Goals:**
- Move the four functions above into `scripts/openspec-spec-diff.ts`,
  unchanged in behavior.
- Give `scripts/openspec-spec-diff.ts` its own CLI entry point. It
  prints one line per delta requirement. Each line carries the
  requirement's kind, its spec file, its title, and its match state
  against the base spec.
- Keep `openspec-review-check.ts`'s existing output identical.
  `test/openspec-review-check.test.ts` must pass unchanged.

**Non-Goals:**
- Changing what `openspec-review-check.ts` reports, or its severity
  levels. This change only moves code its logic already runs.
- A general-purpose diff format, JSON for example. The archive skill
  needs a short list a model reads once. Add structured output later,
  if a second consumer needs it.
- Building `openspec-task-status-tool`'s script. That is a separate
  change. It carries no dependency on this one.

## Decisions

**Extract, don't duplicate.** `openspec-archive-change` step 4 needs the
same header-matching logic `openspec-review-check.ts` already has. Two
independent implementations of "does this MODIFIED header match a base
title" can drift and disagree. That drift is the exact failure this
change exists to close. A shared module is the only option that keeps
one answer for one question.

**`import.meta.main` gates the CLI, not a separate file.** Bun sets
`import.meta.main` to `true` only when a module runs as the entry
script. It stays `false` when another module imports it. Wrapping the
new CLI's `main()` call in `if (import.meta.main)` lets
`openspec-review-check.ts` import the four functions with no side
effect. `bun run scripts/openspec-spec-diff.ts <name>` still works
standalone.

**Output stays plain text, ordered by file then by kind.** The archive
skill reads it once. A human-readable list needs no parsing step. This
matches how `openspec-review-check.ts` already prints its own findings.

**No-base-spec handling mirrors the existing rule exactly.** Take a
capability with no base spec yet, a new capability. Every delta
requirement there should read ADDED. A MODIFIED or REMOVED requirement
already has no sensible target. `openspec-review-check.ts`'s `main`
handles this today, in its `baseTitles === null` branch. The CLI reuses
that branch, not a rewritten one.

## Risks / Trade-offs

- **Risk**: the refactor could break `openspec-review-check.ts`'s test.
  **Mitigation**: task 2 of tasks.md reruns that test suite unchanged.
  It runs once before the extraction and once after.
- **Risk**: a second entry point could confuse a future reader.
  **Mitigation**: each script's own comment names its purpose. Both
  scripts follow the same pattern.

## Migration Plan

No data migration. Rollout order: extract the four functions and their
test coverage first. Confirm `openspec-review-check.ts` behaves
identically. Then add the new CLI entry. Then change
`openspec-archive-change/SKILL.md` step 4. Rollback reverts all three
files; no state to unwind.

## Open Questions

None. The existing code and the proposal already fix the functions to
extract, their behavior, and the skill's calling convention.
