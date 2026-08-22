## Why

`openspec-archive-change`'s step 3 has the model read `tasks.md` by eye and
count `- [ ]` against `- [x]`. It also scans each incomplete task's text
for words like "browser" or "playwright-cli". That scan decides whether
the stricter no-silent-archive rule applies. This is mechanical text counting, solved by
an LLM read. The skill's own text names the failure this causes: "an
earlier merge of ten changes left ten [browser] tasks unchecked. Nobody
read them again once the archive swallowed them."

## What Changes

- Add `scripts/openspec-task-status.ts`, a Bun script that reads a
  change's `tasks.md` and counts complete vs. incomplete tasks. It flags
  incomplete tasks whose text names a browser check. The match text is
  the same "browser, a manual UI walkthrough, or `playwright-cli`"
  language the skill already uses. It prints one small JSON summary.
- Change `openspec-archive-change/SKILL.md` step 3 to call this script
  instead of counting checkboxes by reading the file.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none. This is a tooling and skill-instruction change. No product behavior
or definition-contract requirement changes.)

## Impact

- New file: `scripts/openspec-task-status.ts`.
- Edited file: `.claude/skills/openspec-archive-change/SKILL.md` (step 3
  only).
- No engine, schema, or UI code touched.
