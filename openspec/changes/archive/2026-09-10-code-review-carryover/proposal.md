## Why

`docs/CODE_REVIEW.md` closes with a Prioritized Action List of ten items,
dated 2026-08-18. All ten are still open. A verification pass on 2026-09-09
re-checked each one against the tree and closed none of them. Nothing else in
the repository tracks them: no OpenSpec change names one, and neither
`docs/decisions.md` nor `ROADMAP.md` mentions any. SEC-5 is the one exception,
and its second record is a gitignored file.

Two of the ten moved the wrong way since the review measured them.
`src/runtime/api.ts` now holds 2,673 lines, against the 1,384 that ARCH-1
reports. `src/schema/compile.ts` now holds 53 dead `eslint-disable`
directives, against the ten that CQ-1 counted.

A reader of that review also meets a numbering error. Its top-findings list
labels the login rate limit SEC-4. Its detailed findings and its action list
both call the same finding SEC-5. Three sites disagree with seven.

One finished design sits outside the repository. It covers a Name column on
the admin area's Users screen. The file is
`docs/superpowers/specs/2026-08-23-admin-users-display-name-design.md`,
and its whole directory sits under `.gitignore`. Of 30 paths that tracked
documents point into that directory, the 2026-09-09 audit found three still
existing. Wave 0 of this effort moved two of those out, and one file remains.
One more deletion loses the design.

## What Changes

- `docs/decisions.md` gains a new `##` section,
  `Open from the 2026-08-18 code review (each needs its own OpenSpec change)`,
  after the whole `## Decided, not yet built` section. Eleven entries sit
  under it: one per open action-list item, plus one wrong source comment at
  `src/schema/compile.ts:1218` that the documentation audit found. Six of the
  ten review items are security findings. Each entry states its risk in one
  factual sentence and describes no exploitation path.
- `docs/decisions.md` gains the display-name design as one entry at the tail
  of `## Decided, not yet built`. That entry preserves the design and records
  that building it waits for the owner's approval. The entry schedules
  nothing.
- `docs/decisions.md`: one stale citation. The aggregated-data-source entry
  points `queryInstances` at `src/runtime/api.ts:1560`. That function sits at
  `:1868` today.
- `docs/CODE_REVIEW.md`: three internal ids. The top-findings list renumbers
  item 4 to SEC-5 and item 5 to SEC-6. The 2026-08-09 status table renumbers
  SEC-D's successor from SEC-6 to SEC-5. Nothing but the addressing scheme
  moves. The review's date, scope, findings, severities and recommendations
  stay as they are.

This change records ten open findings. It fixes none of them. Each fix needs
its own OpenSpec change, which is what the new section's heading says. Report
10 left the id fix to the owner. This change decides it, on the four
properties in `design.md`. A `git revert` undoes it at no cost if the owner
disagrees.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. No `openspec/specs/` capability governs `docs/decisions.md` or
`docs/CODE_REVIEW.md`. Two live specs cite `docs/decisions.md` as a source
(`data-source-resolution/spec.md:392`, `group-administration/spec.md:14`),
and neither states a requirement about the file's content. This change adds
no requirement either. A spec saying that a decisions file "stays accurate"
would be unenforceable and ungated, written only to satisfy
`openspec validate`. This change sets `skip_specs: true`, the same way
`2026-08-30-doc-bookkeeping` did.

## Impact

- `docs/decisions.md` and `docs/CODE_REVIEW.md`. Two files, documentation
  only.
- No `src/`, `packages/`, `test/` or `openspec/specs/` file changes. No UI
  change, so no browser check applies.
- Order: this change lands after the `docs/decisions.md` restructuring change
  (audit Change A). Only the `docs/decisions.md` anchors depend on that order.
  Change A never touches `docs/CODE_REVIEW.md`, so task 2 runs either side of
  it.
