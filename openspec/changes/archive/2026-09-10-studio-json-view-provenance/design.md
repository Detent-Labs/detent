## Context

See `proposal.md` for motivation. Four facts fix the shape of this change.
Each one comes from the tree on 2026-09-10.

**The guard moved with its package.** `git ls-files` finds
`packages/web/src/areas/studio/draft/load-guard.ts` and its test
`packages/web/test/studio-load-guard.test.ts`. No path under
`packages/editor/` exists. The spec's "ported verbatim from" clause describes
the port that created the file; the file now lives where the studio lives.

**The header bar's name.** `git ls-files` finds
`packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx` and no
`ProcessHeader.tsx`. `.claude/rules/ui-glossary.md:54` names the row "header
bar" and maps it to that file.

**The retired word.** `.claude/rules/ui-glossary.md:101-103` retires
*panels screen*. `:57` names "the structure surface" as the ten tab bodies
together. The same row calls it the JSON surface's one alternative. The spec
uses "Panels" three times: once in the Purpose paragraph, twice inside
scenarios (`:79`, `:134`). The requirement heading at `:22` already says
"alongside Structure". The Purpose line points the reader at `studio-canvas`
for that surface. That capability covers one tab body of ten, so the pointer
goes.

**The prose ratchet.** The file exits 1 at the linter with 40 findings. The
gate compares that count at the base against the tip and blocks a rise.

## Goals / Non-Goals

**Goals:**

- Make the Purpose paragraph true at the tree: the guard's path,
  `ProcessHeaderBar`, and the structure surface with no `studio-canvas`
  pointer beside it.

**Non-Goals:**

- Touching the two scenarios that say "Panels". See Decision 2.
- Rewriting the paragraph's history. Two clauses stay: "the editor's
  file-based Load already used" and "the same one Load/Import used". They
  describe how the JSON surface came to share a guard.
- Chasing the lowercase "panels" in "the steps/paths/timers/actions panels
  nested under it". Those components live under `panels/`, and the word is
  a common noun there.

## Decisions

### Decision 1: Bookkeeping under `skip_specs` rather than a delta

The archived `2026-09-10-doc-drift-sweep` change stated the test for this
class of work and applied it to two living specs. The test: no `SHALL`
clause gains or loses a condition, no scenario changes, and no requirement
arrives or leaves. This change passes all three. Every touched line sits in
the Purpose section, above the first requirement.

### Decision 2: The two scenario occurrences stay

`:79` reads "Canvas and Panels reflect it once shown" and `:134` reads
"Canvas and Panels (when shown) continue to reflect the draft". Both are
THEN clauses. Swapping the word there changes a scenario's text, which fails
the test in Decision 1, so it needs a delta. A delta for one retired word in
two clauses costs more than the drift it removes.

The glossary retired the word, and the claim it sits in stays true: the tab
bodies do reflect the draft. A later change that touches either scenario's
behaviour carries the swap in its own delta. The sweep renamed one word
inside a SHALL sentence. This change reads its test as written and leaves
scenario text alone.

### Decision 3: The path replaces the provenance clause

The old sentence read "ported verbatim from
`packages/editor/src/draft/load-guard.ts`". A reader today needs the guard's
location rather than its origin. The sentence names the file where it is. The
archived `studio-json-view` change keeps the port's history.

## Risks / Trade-offs

**The prose ratchet.** The replacement keeps each sentence at or under its
current length. It adds nothing that triggers a rule. Task 1.2 measures base
and tip and blocks a rise.

**Half a vocabulary sync.** After this change the Purpose says "structure
surface" and two scenarios say "Panels". Decision 2 accepts that on purpose.

## Migration Plan

Nothing persisted moves. One commit edits one file. Rollback is a revert.

## Open Questions

- The two scenario occurrences of "Panels" still need their swap. It can
  ride in the next change that touches `studio-json-view` behaviour. A sweep
  of retired vocabulary across all living specs is the other home. This
  change owes neither.
