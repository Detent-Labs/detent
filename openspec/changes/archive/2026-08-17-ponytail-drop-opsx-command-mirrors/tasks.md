## 1. Move the archive output templates

- [x] 1.1 Read the four output blocks in `.claude/commands/opsx/archive.md`.
- [x] 1.2 Compare them against the one block the archive skill carries.
- [x] 1.3 Add the no-delta-specs template to `openspec-archive-change/SKILL.md`.
- [x] 1.4 Add the with-warnings template to the same skill.
- [x] 1.5 Add the target-exists error template to the same skill.
- [x] 1.6 Retitle every `/opsx:` name inside the three moved blocks.
- [x] 1.7 Read the four example bullets in `.claude/commands/opsx/explore.md`.
- [x] 1.8 Confirm `openspec-explore/SKILL.md:104` covers the same input cases.

## 2. Delete the command mirrors

- [x] 2.1 Delete all eleven files under `.claude/commands/opsx/`.
- [x] 2.2 Delete the directory itself.

## 3. Retitle the remaining references

- [x] 3.1 Retitle the 22 references in `openspec-onboard/SKILL.md`.
- [x] 3.2 Retitle the one in `openspec-apply-change/SKILL.md`.
- [x] 3.3 Retitle the one in `openspec-explore/SKILL.md`.
- [x] 3.4 Retitle the one in `openspec-ff-change/SKILL.md`.
- [x] 3.5 Retitle the two in `openspec-propose/SKILL.md`.
- [x] 3.6 Retitle the three in `openspec-review-change/SKILL.md`.
- [x] 3.7 Retitle the five `opsx:` mentions in `CLAUDE.md`.

## 4. Record the deletion

- [x] 4.1 Add one line to the change-workflow section of `CLAUDE.md`.
- [x] 4.2 Have it state that `openspec update` regenerates the mirrors.
- [x] 4.3 Have it state that they get deleted again after such a run.
- [x] 4.4 Mark finding 1 as resolved in `PONYTAIL-AUDIT.md`.
- [x] 4.5 Record the re-measurement: `archive` held three templates the skill lacked.

## 5. Verification

- [x] 5.1 Grep for `opsx` across `.claude/` and `CLAUDE.md`.
- [x] 5.2 Confirm the only hits are the new line and the dated code review.
- [x] 5.3 Run `bun run typecheck`. Report what it printed.
- [x] 5.4 Run `bun run build`. Report what it printed.
- [x] 5.5 Run the full `bun test` with `DATABASE_URL` set, never one file.
- [x] 5.6 Report the pass count and the skip count from that run.
- [x] 5.7 Run `git diff --check` over the touched files.
- [x] 5.8 Run the antislop linter on every Markdown file this change touched.
