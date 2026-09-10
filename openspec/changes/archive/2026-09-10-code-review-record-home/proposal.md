## Why

Four dated review files hold 2,474 lines at a mutable path under `docs/`.
`docs/CODE_REVIEW.md` carries 621 lines, `-2026-07-29.md` 611, `-2026-08-01.md`
739 and `-2026-08-09.md` 503. Nothing tracked governs where they live. One
tracked file delegates to them: the intro of the code-review section in
`docs/decisions.md` links `docs/CODE_REVIEW.md` for the reasoning and the
recommended fix. That link moves with the file. No other tracked file reads a
finding out of any of the four.

Commit `0b520cc8` already drew the line this repository uses. That one commit
untracked `PONYTAIL-AUDIT.md` and `PONYTAIL-DEBT.md`. The same commit moved
`CODE_REVIEW.md` into `docs/` and kept it tracked. Its message says why:
the ponytail reports "are snapshots that /ponytail-audit and /ponytail-debt
regenerate on demand", while "CODE_REVIEW.md records a closed audit". The test
was regenerable against not regenerable. It was never "something points at this
file".

A dated audit is not regenerable. Its value rests on its date, its commit and
its method. That property splits the artifact along a seam it already has. The
findings are live state and belong in a living home. The evidence, the method
and the confidence bounds are frozen history and belong in a frozen home. This
repository has exactly one frozen home: the OpenSpec archive.

One live finding sits in the family and nowhere else. The source is
`docs/CODE_REVIEW-2026-08-01.md:426-437`. It rates `NotFoundError` at HTTP 500
as Medium. Its own words: "this needs a spec change rather than a patch, but
it should get one". The mapping still stands at `src/http/errors.ts:95` today.
`openspec/changes/archive/2026-07-29-correct-api-error-responses/design.md:65-69`
closes with "Recorded as an open question". No such record was ever made.
`grep -n "NotFoundError" docs/decisions.md` returns nothing. A deletion with no
carry-over drops the last live trace of it.

## What Changes

- `docs/decisions.md` gains one entry under `## Open questions`: the
  `NotFoundError` mapping. It states the question and decides nothing. The
  archived design already called it an open question. That is why it lands in
  that section and not in the code-review section.
- `docs/decisions.md` gains nine entries in the existing
  `## Open from the 2026-08-18 code review` section. SEC-7, SEC-8, SEC-9,
  SEC-10, ARCH-2, CQ-2, DEP-2, PERF-1 and PERF-2 never reached the copy. Seven
  are Low and two are Informational. Every one was re-checked against the tree
  for this change, and each entry carries the anchor that holds today.
- All four `docs/CODE_REVIEW*.md` files move into one archived entry with
  `git mv`. `design.md` records the directory choice and the reason. No
  archived prose gets rewritten.
- `CLAUDE.md:333-334` stops pointing readers at the four files. It points at
  `docs/decisions.md` for the open findings and at the archived entry for the
  record.
- The intro of `## Open from the 2026-08-18 code review` in `docs/decisions.md`
  links `docs/CODE_REVIEW.md` by relative path. This change repoints that link
  at the archived entry. The SEC-5 bullet's `docs/CODE_REVIEW.md:281` citation
  needs no repoint, since the ponytail change drops it one change earlier.
- The `development-toolchain` capability gains one requirement: where an
  audit's findings, evidence and method land. That requirement is what stops
  the question returning at the next audit.

This change fixes no finding. Each fix needs its own OpenSpec change, which is
what the existing section heading already says.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-toolchain`: one new requirement stating where an audit's output
  lands. Findings go to `docs/decisions.md`. Evidence, method and confidence
  bounds go to an archived OpenSpec entry. No tracked file under `docs/` holds
  an audit record. The capability already holds the sibling rule for browser
  checks at `openspec/specs/development-toolchain/spec.md:830`, so this matches
  a shape the file carries.

## Impact

- `docs/decisions.md`, `CLAUDE.md`, four files under `docs/`, one live spec
  file, and one new `README.md` inside the archived entry. Documentation and
  specification only.
- No `src/`, `packages/` or `test/` file changes. No UI change, so no browser
  check applies.
- Eighteen archived files name a `CODE_REVIEW` path. Seven of them already
  point at the wrong review today. `design.md` reads every citation in context.
  It explains why none needs repair.
- Order: this change lands second of three. The ponytail change lands first.
  It adds a fifth heading, `## Refused simplifications`, at the end of
  `docs/decisions.md`, and it removes the `allow-file` directive at line 1.
  The four headings this change writes under stay as they are. This change
  anchors on heading text, since the ponytail change moves every line from
  `:970` down.
