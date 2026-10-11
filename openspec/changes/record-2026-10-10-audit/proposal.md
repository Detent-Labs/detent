## Why

The audit of 2026-10-10 read HEAD `5f41cd8a` and found 129 issues: 7 high, 43
medium and 79 low. The reports sit in `tmp/audit-2026-10-10/`. Git does not
track that directory, and every worktree shares it. Nothing in the repository
records the audit, so the next pass would report the same issues as new.

The `development-toolchain` capability already says where an audit lands. Open
findings go to `docs/decisions.md`. The audit document goes to an archived
OpenSpec entry. The 2026-08-18 code review record applied that rule. This
change applies it to the 2026-10-10 audit.

The audit also drives 36 follow-up changes. Each one needs an entry to close
when it archives. Without the index, no change knows which finding it owns.

## What Changes

- A new archived entry, `openspec/changes/archive/2026-10-10-audit-record/`,
  holds the report, the coordinator's verification ledger and the nine area
  reports, all in English. A `README.md` states what the record is and the
  commit it read. It quotes the checks and their results. It lists the owner
  rulings and says where the live findings sit.
- `docs/decisions.md` gains a section, "Open from the 2026-10-10 audit (one
  OpenSpec change each)". It holds one entry per planned change. An entry
  gives the change name, its finding ids, the severity, and one sentence on
  what is wrong.
- Each later change of the audit deletes its own entry when it archives.
- Finding ids stay as the audit wrote them, from A-1 to K-1. The brief of each
  later change, the record and the index then cross-reference one another.
- Line numbers in the record stay as they were at `5f41cd8a`. They are
  historical anchors, and the README says so.
- The English text passes the prose gate with no `allow-file` directive. A
  targeted directive with a reason covers only a quote, a table or a finding
  id that forces a finding.
- The German originals stay in the untracked `tmp/` directory.
- Nine findings concern security. The record keeps their case narrative and
  their quoted check output. It drops the literal attack payloads. Their index
  entries state the risk in one sentence and give no trigger recipe.

This change fixes no finding. Each fix needs its own OpenSpec change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The requirement "An audit's findings, evidence and method each land in a
named home" in `development-toolchain` already governs this work. The change
sets `skip_specs: true` in `.openspec.yaml`.

## Impact

- Documentation only. One new archived directory with 12 files, and one new
  section in `docs/decisions.md`.
- No `src/`, `packages/` or `test/` file changes. No UI changes, so no browser
  check applies.
- This change runs before every other change of the audit. Each of them edits
  the new section when it archives. Expect a merge conflict in that section.
  Resolve it mechanically.
- The record is about 280 KB of Markdown. The repository is public, which is
  why the security findings lose their attack payloads.
