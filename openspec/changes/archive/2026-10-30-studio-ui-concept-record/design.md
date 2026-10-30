# Design

## Context

See `proposal.md` for motivation. Five facts shape this change.

**One.** The source is the session scratchpad `concept-draft.md` of
2026-10-30. It is outside git. Its sections 1a to 4 hold every decision; its
section 5 names two follow-up prompts and goes nowhere. Every date in it is
2026-10-30 unless it cites an older measurement.

**Two.** `ROADMAP.md` keeps open stages in full under `## Open stages`, in
number order. Two are open today, 40 and 43. The last finished stage is 63.
A stage opens with `NN. **Title: STATUS.**`, runs as indented paragraphs and
ends with the changes and specs it names. The file passes antislop with exit
0 under one `allow-file synonym-rotation` directive.

**Three.** `docs/decisions.md` carries 23 antislop findings today and an
`allow-file` directive for five rules. The DRAFT-1 bullet sits under
`## Open from the 2026-09-11 design audits`. It records a measurement of
2026-09-12: the header bar's Discard draft dialog did nothing. A re-check
on 2026-10-30 did not reproduce it.

No archived change claims the fix. The commits to `EditScreen.tsx` since
then touched the catalog text, the lazy chunks and the draft stash. None of
them names the dialog.

**Four.** The repository's one precedent for a design record is
`field-model-redesign.md`. It lived under `docs/` while its programme ran.
On 2026-09-10 it moved into the archive of its first change
(`field-model-record-home`). By then three of four changes had shipped and
the living specs carried the decisions. The reason given: no dated file
under `docs/` may stay load-bearing.

**Five.** The prose gate ratchets per file. A new file has a base count of
0, so `docs/studio-ui-concept.md` must pass antislop with exit 0. The other
two files must not rise.

## Goals / Non-Goals

**Goals:**
- Put every decision of 2026-10-30 into the repository, in English, where
  the next session finds it without the scratchpad.
- Make stage 64 the entry point: the principles and the ordered list stand in
  `ROADMAP.md`, and the record holds the reasoning.
- Keep the seven artifact links, since the mockups and screenshots exist
  nowhere else.

**Non-Goals:**
- No code and no spec rule. No change under `packages/web`, so no browser
  check and no design skill run.
- No glossary or i18n change. The vocabulary table waits for change 2.
- No pointer in `CLAUDE.md` or `docs/current-state.md`. The roadmap stage
  points at the record, and `CLAUDE.md` already sends a reader to
  `ROADMAP.md` for stage status.
- No closing of DRAFT-1. One non-reproduction is a note and no verdict.

## Decisions

**D1. The record's shape follows the scratchpad's order.** It opens with a
status line. The inventory follows: screens, process surface, tabs, form
editor, ways between the parts, raw JSON sites. The inventory ends with the
open studio points and the detector baseline.

Then come the findings and rating, the pattern references and the seven
principles. Then the author tasks by frequency. Then the decisions D1 to
D8, each with the options shown and the owner's choice.

The vocabulary table, the ordered change list and the artifact links close
it. The record keeps the scratchpad's D-labels. The 16 later changes can
then cite "D4" and "R1" against one file. The alternative, a reordering by
topic, would break every label a later change cites.

**D2. The record states no requirement.** Its head says so, in the words
`CLAUDE.md` uses for `field-model-redesign.md`. A later change that builds a
decision writes the requirement into the capability spec. A reader who finds
a sentence in the record and not in a spec treats it as intent.

**D3. The record lives under `docs/` while stage 64 runs. It moves to the
archive when the stage closes.** This is the owner's decision (a) of
2026-10-30. It squares with the `field-model-record-home` rule. That rule
retires a record once the living specs carry its content.

Stage 64's closing change does the same `git mv` into the archive of change
1, `studio-fresh-draft-starts-clean`. The record says so in its status
line.

**D4. Stage 64 carries the principles and the list. The record carries the
reasoning.** The stage prints the seven principles as one numbered list. It
prints the 16 changes as a second numbered list. Each item names the change,
what it needs and what it resolves.

The options and the owner's reactions stay in the record. The alternative,
a stage with the full decisions, doubles 300 lines and goes stale twice.

**D5. The change list prints capability names as the record has them, with
one correction.** The scratchpad names `ui-glossary` and `design tokens` as
capabilities. Neither is a spec. The record and the stage name them as the
files they are: `.claude/rules/ui-glossary.md` and `DESIGN.md`.

**D6. The artifact links stay verbatim and stay private.** Seven
`claude.ai/artifact/` links go into the record's last section. The roadmap
stage carries none, since a roadmap reader wants status and no mockups. The
scratchpad left the D2 tab-options link as `…`. The record uses the options
page link the next line names, `QzSAYxc4CGfbU9Po3HMGap`.

**D7. DRAFT-1 gets a dated sentence, in place.** The bullet keeps its
measurement of 2026-09-12 and its risk line. Two sentences follow the risk.
A re-check on 2026-10-30 did not reproduce it. The entry stays open
until a second check or a found cause closes it.

Change 13 of the list, `studio-one-dialog-form`, rebuilds that dialog and
retires the entry either way. The alternative, moving the bullet into the archive now, would close a
High finding on one observation.

**D8. Language and lint.** The record is English throughout. The one German
example in the vocabulary table, the way-out row `Freigeben → Abschluss`,
becomes an English pair. The record passes antislop with exit 0; it is a
new file with base 0. Sentences stay under 20 words and paragraphs under
six sentences. Antislop scores a table row as one sentence, so long rows
split into several.

## Risks / Trade-offs

- [A capability name in the list drifts before its change starts] → Each
  later change re-reads `openspec list --specs` on its own day. The record
  dates itself.
- [The stage's list and the record's list diverge over time] → The stage
  carries names, needs and resolves. The record carries the same three plus
  capabilities and screens. A later change that renames one updates both.
  The record's status line says so.
- [antislop merges a sentence that opens with a code span] → Every
  sentence opens with a capitalized word. A code span never opens one.
- [A private artifact link rots] → The links are the only copy of the
  mockups. The record says they are private and dated. Nothing in the repo
  depends on them resolving.
- [`docs/decisions.md` rises above 23 findings] → The task measures the
  base at `HEAD` and the tip after the sentences land, the way `prose.sh` counts.

## Migration Plan

One new file, one stage in `ROADMAP.md`, two sentences in
`docs/decisions.md`. No deploy, no data, rollback by `git revert`. Nothing
outside Markdown changes, so no browser check applies. Typecheck, build and
the full suite still run once in the Verification group. Every docs-only
change here runs them, to prove that no code file moved.

## Open Questions

None. The owner took every decision on 2026-10-30, including the place.
