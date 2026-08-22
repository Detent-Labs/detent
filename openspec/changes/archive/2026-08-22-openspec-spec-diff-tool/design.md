## Context

This change extracts the requirement-matching helpers from
`scripts/openspec-review-check.ts`. The function `normalizeHeading`
trims and collapses whitespace in a heading. The function
`extractRequirements` parses a delta spec's `## ADDED/MODIFIED/REMOVED
Requirements` sections into `{ kind, title, line }` entries. The
function `extractBaseTitles` lists every `### Requirement:` header in a
base spec. The function `levenshtein` computes the edit distance and the
function `closest` turns it into a nearest-match lookup, for a reworded
header hint. The `RequirementEntry` interface moves with them.

Its `main` function already loops over every capability under a
change's `specs/` directory. It reads the base spec at
`openspec/specs/<cap>/spec.md` when one exists. It classifies each delta
requirement as matched, added-that-exists, modified-with-no-match, or
removed-with-no-match.

See proposal.md - Why for the motivation.

## Goals / Non-Goals

**Goals:**
- Move the functions above (plus the `RequirementEntry` interface) into
  `scripts/openspec-spec-diff.ts`, unchanged in behavior.
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
change exists to close. The shared module owns every drift-prone part of
that match — heading normalization, requirement and title extraction,
and the Levenshtein distance — so the two scripts reach one answer. Each
`main` keeps only its own consumer-specific branching: the review-check
turns a non-match into a Critical finding, the CLI turns it into an
`(unmatched)` line.

**`import.meta.main` gates the CLI, not a separate file.** Bun sets
`import.meta.main` to `true` only when a module runs as the entry
script. It stays `false` when another module imports it. Wrapping the
new CLI's `main()` call in `if (import.meta.main)` lets
`openspec-review-check.ts` import the shared functions with no side
effect. `bun run scripts/openspec-spec-diff.ts <name>` still works
standalone.

**Output stays plain text, ordered by file then by kind.** The archive
skill reads it once. A human-readable list needs no parsing step. This
matches how `openspec-review-check.ts` already prints its own findings.

**No-base-spec handling mirrors the existing rule exactly.** Take a
capability with no base spec yet, a new capability. Every delta
requirement there should read ADDED. A MODIFIED or REMOVED requirement
already has no sensible target. `openspec-review-check.ts`'s `main`
handles this today, in its `baseTitles === null` branch. The CLI mirrors
that branch's rule, then prints each requirement as ADDED with no match
check.

**Exit code: 0 on success, 2 only on a usage error.** This CLI is a
diff printer for archive time, not a gate. An unmatched MODIFIED or
REMOVED header is data the archive skill reads, not a failure to signal
through the exit code. Only a missing or unknown change name exits 2,
matching `openspec-review-check.ts`'s convention.

## Risks / Trade-offs

- **Risk**: the refactor could break `openspec-review-check.ts`'s test.
  **Mitigation**: tasks.md reruns that test suite unchanged — once
  before the extraction (task 1.1) and once after (task 3.1).
- **Risk**: a second entry point could confuse a future reader.
  **Mitigation**: each script's own comment names its purpose. Both
  scripts follow the same pattern.
- **Risk**: the CLI resolves `openspec/` from `process.cwd()`, so the
  archive skill's `--store` flag does not relocate its scan.
  **Mitigation**: step 4 keeps its store-aware `existingOutputPaths`
  gate; the cwd-relative scan matches `openspec-review-check.ts`, which
  is already cwd-relative.

## Migration Plan

No data migration. Rollout order: extract the shared helpers and
confirm `openspec-review-check.ts` behaves identically (its existing
test passes unchanged). Then add the new CLI entry. Then change
`openspec-archive-change/SKILL.md` step 4. Rollback reverts all touched
files; no state to unwind.

## Open Questions

None. The existing code and the proposal already fix the functions to
extract, their behavior, and the skill's calling convention.

**Coordination note.** The sibling change `openspec-task-status-tool`
also edits the same frontmatter line, in
`.claude/skills/openspec-archive-change/SKILL.md`. That change drops
the `allowed-tools` line entirely, so the skill inherits full session
permissions. Task 6.2 here widens the line instead of dropping it. If
`openspec-task-status-tool` lands first and the line is already gone,
task 6.2 needs no action. Treat "the line is absent" as satisfying 6.2,
not as a precondition failure.
