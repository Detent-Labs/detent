## Why

The `openspec-review-check.ts` script already matches a delta spec's
ADDED/MODIFIED/REMOVED requirement headers against a base spec. It adds a
Levenshtein nearest-match hint for a reworded header.

<!-- antislop: allow passive-voice -->
The `openspec-archive-change` skill's step 4 asks the model to redo the
same comparison by eye. Its own words are: "compare each delta spec with
its corresponding main spec...". It also says to "determine what changes
would be applied (adds, modifications, removals, renames)".

The review script's own comment names the exact bug this causes. A
reworded MODIFIED header pairs with nothing. It silently archives as an
add. Review alone catches this today. Archive re-derives the comparison
from scratch, with no script backing it.

## What Changes

- Extract `extractRequirements`, `extractBaseTitles`, `closest`,
  `normalizeHeading`, and the `levenshtein` helper (plus the
  `RequirementEntry` interface) out of the `openspec-review-check.ts`
  script. Move them into a new shared module, `scripts/openspec-spec-diff.ts`.
  This step is behavior-preserving: what `openspec-review-check.ts`
  reports does not change.
- Add a CLI entry to `scripts/openspec-spec-diff.ts`. It takes a change
  name and prints each delta spec's requirements as ADDED, MODIFIED, or
  REMOVED. Each requirement carries a matched or unmatched mark against
  the base spec.
- Change the `openspec-archive-change` skill's step 4 to run this CLI.
  Drop the by-eye comparison of delta and base specs it does today.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none. This is a tooling and skill-instruction change. It refactors an
existing script and edits a skill's instructions. No product behavior or
definition-contract requirement changes.)

## Impact

- New file: `scripts/openspec-spec-diff.ts`.
- New file: `test/openspec-spec-diff.test.ts`.
- Edited file: `scripts/openspec-review-check.ts`. It imports the
  extracted functions instead of defining them. Its own output stays
  the same.
- Edited file: `.claude/skills/openspec-archive-change/SKILL.md` (step 4
  only).
- Existing test `test/openspec-review-check.test.ts` must keep passing
  unchanged. It asserts on that script's output.
