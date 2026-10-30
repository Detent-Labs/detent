# Proposal

## Why

A design session on 2026-10-30 produced a complete studio UI concept. It
holds an inventory of the studio today and the owner's rating of 30 findings.
It holds six pattern references with the owner's reaction. It holds seven
design principles the owner confirmed and eight decisions (D1 to D8). It
holds a vocabulary table and an ordered list of 16 changes.

That concept exists only in a session scratchpad. The owner decided where
it lives: an open stage in `ROADMAP.md` and a design record under `docs/`.
Nothing of it is in the repository yet.

## What Changes

- The change creates `docs/studio-ui-concept.md`, the design record of the
  2026-10-30 session, in English, antislop-clean. It carries the inventory,
  the findings and their rating, the pattern references and the principles.
  It carries the decisions D1 to D8, the vocabulary table and the ordered
  change list. It carries the seven artifact links from the scratchpad's
  section 4. It states no requirement.
- `ROADMAP.md` gains an open stage 64, "Studio UI overhaul: NOT STARTED",
  under `## Open stages` after stage 43. The stage carries the seven
  principles and the ordered list of 16 changes. Each list item says what
  the change needs and resolves. A closing line points to the record.
- `docs/decisions.md`: the DRAFT-1 entry gains a sentence. A re-check on
  2026-10-30 did not reproduce the defect. The entry stays open.
- No code, no test, no spec rule, no i18n catalog, no glossary line. The
  vocabulary table goes into the record alone. Change 2 of the list,
  `studio-vocabulary-no-key-echo`, is the one that moves it into
  `.claude/rules/ui-glossary.md` and `studio-guided-vocabulary`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The record describes a programme and no behavior. Every behavior it
names reaches a spec through the change that builds it. This change sets
`skip_specs: true`.

## Impact

- `docs/studio-ui-concept.md` (new, about 300 lines), `ROADMAP.md` (one open
  stage, about 60 lines), `docs/decisions.md` (one or two sentences).
- Nothing under `src/`, `packages/`, `test/` or `openspec/specs/`.
- The 16 changes the record lists each need their own OpenSpec change later.
  The first of them, `studio-fresh-draft-starts-clean`, follows this one.
