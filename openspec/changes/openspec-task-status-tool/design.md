## Context

`scripts/openspec-review-check.ts` already parses `tasks.md` into task
blocks. A checkbox line matches `^- \[[ x]\]`. Its indented continuation
lines match `^\s+\S`. That block-flushing logic lives in `checkTasks`
there, scoped to a different rule: it flags "consider"/"investigate"
language, not task status.

This change adds a second, standalone script instead of extending that
one. `openspec-review-check.ts` runs before code exists. It reports
Critical/Warning/Suggestion findings for a human review pass. This script
runs at archive time, once a change's tasks are complete. Its output is a
status summary an agent branches on, not a findings list.

Reuse the line-classification approach. Do not reuse the file or its
`Finding` type.

See proposal.md - Why for the motivation.

## Goals / Non-Goals

**Goals:**
- Count complete vs. incomplete tasks in a change's `tasks.md`. Match
  exactly what `openspec-archive-change` step 3 currently counts by eye.
- Flag which incomplete tasks name a browser check. Use the same
  detection the skill already describes in prose. A task block counts if
  its text contains "browser", "manual UI walkthrough", or
  "playwright-cli" (case-insensitive).
- Print one JSON object to stdout. The calling skill parses it instead of
  re-reading the file.

**Non-Goals:**
- Deciding what happens after the count. Confirming with the user, or
  refusing the archive, stays branching logic in
  `openspec-archive-change/SKILL.md`. This change leaves that logic in
  substance unchanged.
- Touching `docs/browser-checks.md` or moving task content into it. The
  skill keeps its existing refusal path for that case.
- A shared module with `openspec-review-check.ts`. A separate change,
  `openspec-spec-diff-tool`, covers extracting that script's
  requirement-matching functions. This change does not depend on it and
  does not touch that file.

## Decisions

**Block parsing mirrors `checkTasks`, not a shared import.** Both scripts
solve "group a checkbox line with its continuation lines." Both read
`tasks.md`. But they serve different consumers at different lifecycle
stages. Duplicating roughly 15 lines of parsing is cheap. Coupling a
pre-implementation review tool to a post-implementation archive tool, for
a routine this short, is not worth the cost.

**Browser-check detection is a plain regex, not a capability list.** The
skill's own wording is already the specification. It names a browser, a
manual UI walkthrough, or `playwright-cli`. A regex over the flushed
block text, `/\b(browser|manual UI walkthrough|playwright-cli)\b/i`,
matches that wording directly. No config file, no extensibility point.
The three phrases are the whole rule. Changing the rule means changing
the skill's prose and this regex together, in one small, deliberate
step.

**Exit code carries no meaning; JSON does.** Unlike the push gates, this
script has no pass/fail verdict. The calling skill reads
the numbers and applies its own policy: confirm, refuse, or proceed. The
script exits 0 whenever it produces valid JSON. A genuine error, a
missing file or an unreadable path, is the only case that exits
non-zero, reported on stderr.

## Risks / Trade-offs

- **Risk**: the regex misses a browser-check task phrased differently
  than the three matched words. The count then understates the real
  total. **Mitigation**: the current by-eye check already carries this
  same risk. A regex is at least reproducible and testable, unlike the
  prose version. Widen the regex if a missed phrasing surfaces.
- **Risk**: this script's block-parsing logic duplicates
  `openspec-review-check.ts`'s own. The two drift, if someone edits
  only one. **Mitigation**: neither script's correctness
  depends on an exact match with the other. A drift changes what a
  future reader sees when comparing them, not what either script does.
  Acceptable, given the narrow, stable shape of a Markdown checkbox
  line.

## Migration Plan

No data migration. Rollout order: add the script, add its test, then
change `openspec-archive-change/SKILL.md` step 3 to call it. That
second step is a prose change to an instruction file. No runtime
behavior elsewhere depends on it. Rollback reverts both files; no state
to unwind.

## Open Questions

None. The skill's existing prose and `openspec-review-check.ts`'s
existing parsing pattern already fix the behavior, its scope, and its
output shape.
